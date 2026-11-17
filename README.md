<p align="center">
  <img src="assets/kai-icon.png" width="180" alt="Kai">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/kai-wordmark-branco.svg">
    <img src="assets/kai-wordmark.svg" width="420" alt="KAI AGENT">
  </picture>
</p>

<p align="center">
  <b>Seu assistente pessoal no Discord, movido pelo Claude Code.</b><br>
  Conversa, lembra, organiza ideias, transcreve áudio e manda o briefing da manhã.<br>
  Roda no seu computador ou servidor, com a assinatura do Claude que você já tem.
</p>

<p align="center">
  <a href="README.en.md">English</a> ·
  <a href="#instalação">Instalação</a> ·
  <a href="docs/discord.md">Criar o bot</a> ·
  <a href="#rotinas">Rotinas</a> ·
  <a href="#segurança">Segurança</a>
</p>

---

## O que o Kai faz

| | |
|---|---|
| 💬 **Conversa com memória** | Fale por DM ou mencione `@Kai` num canal. Cada thread é uma conversa contínua: ele lembra do que vocês falaram ali. |
| ⏰ **Lembretes** | "Me lembra amanhã 15h de ligar pro João" ou "todo dia útil 9h ver os e-mails". Ele avisa por DM na hora. |
| 💡 **Caixa de ideias** | Tudo o que você joga no `#ideias` vira uma ideia organizada (tipo, esforço, impacto) e, se quiser, uma nota. |
| ☀️ **Rotinas agendadas** | Briefing da manhã com o clima, resumo semanal das ideias ou o que você inventar, no horário e no canal que você escolher. |
| 🎙️ **Áudio** | Mande uma mensagem de voz: ele transcreve no seu próprio servidor (Whisper) e responde. |
| 📎 **Anexos** | Prints, PDFs e arquivos vão junto para ele ler. |
| 🗒️ **Notas com git** | Opcional: ele lê e escreve numa pasta de notas (ex.: Obsidian) e sincroniza com git a cada resposta. |
| 🧠 **Personalidade sua** | Tudo o que ele sabe sobre você e como deve agir fica num `CLAUDE.md` que você edita. |

## Como funciona

```
Você no Discord ──► Kai (Bun + discord.js) ──► claude -p (Claude Code)
                          │                         │
                          │                         ├─ lê persona/CLAUDE.md (quem você é, regras)
                          │                         └─ usa ferramentas: comando lembrete, notas, web
                          ├─ lembretes.db ──► DM na hora marcada
                          ├─ config/rotinas.json ──► briefing e resumos agendados
                          └─ whisper (opcional) ──► áudio vira texto
```

O Kai não tem um modelo próprio: cada mensagem vira uma chamada ao **Claude Code** na pasta da persona. Por isso ele usa o **seu login do Claude** (assinatura Pro/Max) ou uma **chave de API**, e tudo roda na sua máquina.

## Instalação

**Precisa de:** [Bun](https://bun.sh), [Claude Code](https://docs.claude.com/claude-code) com login feito, Python 3 e um bot do Discord ([passo a passo](docs/discord.md)). Funciona em Linux e macOS.

```bash
git clone https://github.com/anadecastrob/kai-agent.git
cd kai-agent
./install.sh
bun start
```

O `install.sh` confere as dependências, pergunta o token do bot e o seu ID do Discord, cria o `.env`, a sua persona (`persona/CLAUDE.md`) e as rotinas de exemplo.

**Para deixar ligado 24h** num servidor Linux (VPS):

```bash
./install.sh --servico
```

**Transcrição de áudio** (opcional, precisa de Docker):

```bash
docker compose up -d whisper
```

e no `.env`: `KAI_WHISPER_URL=http://127.0.0.1:9000`.

## Personalize

- **`persona/CLAUDE.md`**: quem você é, como o Kai deve responder, o que ele pode fazer. Vem com seções prontas (lembretes, caixa de ideias, briefing). Apague o que não usar e acrescente o que quiser.
- **`persona/.claude/settings.json`**: o que o Claude Code pode usar sem pedir (já libera o comando `lembrete` e bloqueia `sudo`, `curl` e a leitura de `.env` e chaves SSH).
- **`.env`**: nome, fuso, cidade do clima, canal de ideias, áudio e notas. Veja o [`.env.example`](.env.example).

## Rotinas

As rotinas ficam em `config/rotinas.json`:

```json
{
  "nome": "briefing",
  "canal": "briefing",
  "dias": ["seg", "ter", "qua", "qui", "sex"],
  "hora": "07:30",
  "ate": "11:59",
  "pedido": "Faça o briefing da manhã seguindo a seção \"Briefing da manhã\" do CLAUDE.md.\nClima de hoje: {clima}."
}
```

- `dias` vazio = todo dia. `ate` é até quando ela ainda roda se o Kai estava desligado na hora.
- `{clima}` vira o clima do dia na sua cidade (Open-Meteo, sem chave). `{data}` vira a data de hoje.
- Sem o canal, a rotina chega por DM.
- Para testar na hora, mande `!briefing` (o nome da rotina) na DM.

## Segurança

- **Só você fala com ele.** Mensagens de qualquer outra pessoa são ignoradas (`DISCORD_OWNER_ID`).
- **Rode num usuário separado**, sem `sudo`, principalmente num servidor. O Claude Code executa ferramentas de verdade na pasta da persona.
- **O `.env` e a pasta `dados/` são só seus** (o instalador deixa sem acesso para outros usuários). Nunca publique o `.env`.
- **Anexos e páginas da web são dados, não ordens.** A persona de exemplo já instrui o Kai a não seguir instruções vindas de arquivos ou sites.
- Ações que não dá para desfazer (apagar, enviar algo a alguém, gastar) devem passar por você: deixe isso claro no seu `CLAUDE.md`.

## Perguntas

**Preciso pagar algo?** O Kai é grátis (MIT). Você usa a sua própria conta do Claude (assinatura Pro/Max ou chave de API) e o seu computador ou servidor.

**Posso usar com a minha assinatura do Claude?** O Kai chama o Claude Code com o login que estiver na máquina, para o seu uso pessoal. Siga os [termos de uso da Anthropic](https://www.anthropic.com/legal) da sua conta. Para uso em empresa ou por várias pessoas, use uma chave de API.

**Funciona no Windows?** Use o WSL (Ubuntu). No macOS e no Linux funciona direto.

**Ele lê o meu servidor inteiro do Discord?** Não. Ele só reage às suas DMs, às suas menções, às threads que ele abriu e ao canal de ideias.

**Dá para trocar o nome e a foto?** Sim: o nome e a foto do bot são do Discord (Developer Portal), e a personalidade é o `CLAUDE.md`.

---

<p align="center">
  Feito por <a href="https://github.com/anadecastrob">Ana de Castro</a>. Licença <a href="LICENSE">MIT</a>.<br>
  <sub>Projeto pessoal, sem vínculo com a Anthropic ou o Discord. "Claude" e "Claude Code" são marcas da Anthropic.</sub>
</p>
