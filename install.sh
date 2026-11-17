#!/usr/bin/env bash
# Instalador do Kai. Rode dentro da pasta do projeto:  ./install.sh
# Com --servico (Linux com systemd), também instala e liga o serviço "kai".
set -euo pipefail
cd "$(dirname "$0")"
PASTA="$(pwd)"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[33m%s\033[0m\n' "$*"; }
falta() { amarelo "✗ $1"; FALTOU=1; }
FALTOU=0

echo "== Kai: instalação =="

# 1. Dependências
command -v bun >/dev/null 2>&1 && verde "✓ Bun $(bun --version)" || falta "Bun não encontrado. Instale: https://bun.sh  (curl -fsSL https://bun.sh/install | bash)"
command -v claude >/dev/null 2>&1 && verde "✓ Claude Code $(claude --version 2>/dev/null | head -1)" || falta "Claude Code não encontrado. Instale: https://docs.claude.com/claude-code e faça login rodando: claude"
command -v python3 >/dev/null 2>&1 && verde "✓ Python $(python3 -V 2>&1 | cut -d' ' -f2)" || falta "Python 3 não encontrado (usado pelos lembretes)"
command -v git >/dev/null 2>&1 || amarelo "• git não encontrado (só é preciso para sincronizar notas)"
[ "$FALTOU" = 1 ] && { amarelo "Instale o que falta e rode ./install.sh de novo."; exit 1; }

# 2. Pacotes
bun install --silent && verde "✓ Pacotes instalados"

# 3. .env
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo
  echo "Vamos preencher o .env (dá para editar depois). Como criar o bot: docs/discord.md"
  read -rsp "Token do bot do Discord (não aparece na tela): " TOKEN; echo
  read -rp "Seu ID de usuário no Discord: " DONO
  read -rp "Como o Kai deve te chamar: " NOME
  read -rp "Cidade para o clima do briefing (opcional): " CIDADE
  python3 - "$TOKEN" "$DONO" "$NOME" "$CIDADE" <<'PY'
import re, sys
token, dono, nome, cidade = sys.argv[1:5]
s = open('.env').read()
for k, v in {'DISCORD_BOT_TOKEN': token, 'DISCORD_OWNER_ID': dono, 'KAI_NOME_DONO': nome, 'KAI_CIDADE': cidade}.items():
    if v.strip():
        s = re.sub(rf'^{k}=.*$', f'{k}={v.strip()}', s, flags=re.M)
open('.env', 'w').write(s)
PY
  verde "✓ .env criado (permissão só para você)"
else
  verde "✓ .env já existe (não mexi)"
fi

# 4. Persona e rotinas
NOME_DONO="$(grep -E '^KAI_NOME_DONO=' .env | cut -d= -f2-)"
if [ ! -f persona/CLAUDE.md ]; then
  sed "s/{{NOME}}/${NOME_DONO:-você}/g" persona/CLAUDE.md.example > persona/CLAUDE.md
  verde "✓ persona/CLAUDE.md criado: edite para contar ao Kai quem você é"
else
  verde "✓ persona/CLAUDE.md já existe (não mexi)"
fi
[ -f config/rotinas.json ] || { cp config/rotinas.example.json config/rotinas.json; verde "✓ config/rotinas.json criado (briefing e resumo de ideias)"; }
mkdir -p dados && chmod 700 dados

# 5. Serviço (opcional, Linux)
if [ "${1:-}" = "--servico" ]; then
  if ! command -v systemctl >/dev/null 2>&1; then amarelo "systemd não encontrado: rode com 'bun start'"; exit 0; fi
  sed -e "s#USUARIO#$(id -un)#g" -e "s#HOMEDIR#$HOME#g" -e "s#PASTA#$PASTA#g" deploy/kai.service | sudo tee /etc/systemd/system/kai.service >/dev/null
  sudo systemctl daemon-reload && sudo systemctl enable --now kai
  verde "✓ Serviço kai ligado. Logs: journalctl -u kai -f"
  exit 0
fi

echo
verde "Pronto! Para ligar o Kai:  bun start"
echo "Para deixar rodando 24h num servidor Linux:  ./install.sh --servico"
echo "Áudio (opcional):  docker compose up -d whisper  e  KAI_WHISPER_URL=http://127.0.0.1:9000 no .env"
