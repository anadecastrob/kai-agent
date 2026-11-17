"""Transcrição local de áudio (faster-whisper) para o Kai.

POST /transcrever com o áudio no corpo (ogg, mp3, m4a, wav...) → {"texto": "...", "segundos": 12.3}
Uma transcrição por vez; escuta só na rede interna/localhost.
"""
import json
import os
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from faster_whisper import WhisperModel

MODELO = os.environ.get("WHISPER_MODEL", "small")
IDIOMA = os.environ.get("WHISPER_LANG", "pt")
MAX_BYTES = 25 * 1024 * 1024

modelo = WhisperModel(MODELO, device="cpu", compute_type="int8", download_root="/models")
fila = threading.Lock()


def decodificar(caminho):
    """Converte qualquer áudio para PCM 16 kHz mono com ffmpeg (o decodificador embutido quebra com o PyAV atual)."""
    pcm = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", caminho, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True, timeout=300,
    ).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_GET(self):
        if self.path == "/saude":
            return self._json(200, {"ok": True, "modelo": MODELO})
        self._json(404, {"erro": "rota inexistente"})

    def do_POST(self):
        if self.path != "/transcrever":
            return self._json(404, {"erro": "rota inexistente"})
        tamanho = int(self.headers.get("Content-Length") or 0)
        if not tamanho or tamanho > MAX_BYTES:
            return self._json(413, {"erro": "áudio vazio ou maior que 25 MB"})
        audio = self.rfile.read(tamanho)
        with tempfile.NamedTemporaryFile(suffix=".audio") as f:
            f.write(audio)
            f.flush()
            inicio = time.time()
            try:
                with fila:
                    segmentos, info = modelo.transcribe(decodificar(f.name), language=IDIOMA, vad_filter=True, beam_size=1)
                    texto = " ".join(s.text.strip() for s in segmentos).strip()
            except Exception as e:  # áudio corrompido, formato desconhecido...
                return self._json(422, {"erro": str(e)[:300]})
        self._json(200, {"texto": texto, "duracao_audio": round(info.duration, 1), "segundos": round(time.time() - inicio, 1)})

    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"whisper pronto (modelo {MODELO}, idioma {IDIOMA})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
