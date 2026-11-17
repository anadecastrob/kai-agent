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
  <b>Your personal assistant on Discord, powered by Claude Code.</b><br>
  <a href="README.md">Português</a>
</p>

---

Kai is a small Discord bot that turns each of your messages into a `claude -p` call inside a persona folder (`persona/CLAUDE.md`), with one memory per thread. It runs on your own machine or server and uses the Claude login (Pro/Max) or API key you already have.

**Features:** conversations with per-thread memory · reminders delivered by DM (`bin/lembrete`) · an `#ideias` inbox that organizes ideas · scheduled routines (`config/rotinas.json`, e.g. a morning briefing with the weather) · local voice-message transcription (Whisper, optional) · attachments · optional git-synced notes folder (e.g. Obsidian). It only answers its owner (`DISCORD_OWNER_ID`).

The code, prompts and messages are in Brazilian Portuguese. To use it in another language, translate `persona/CLAUDE.md.example` and the routine prompts; the persona decides the language Kai speaks.

## Quick start

Requirements: [Bun](https://bun.sh), [Claude Code](https://docs.claude.com/claude-code) (logged in), Python 3, and a Discord bot ([guide, in Portuguese](docs/discord.md): create an application, enable **Message Content Intent**, invite it with the `bot` scope).

```bash
git clone https://github.com/anadecastrob/kai-agent.git
cd kai-agent
./install.sh          # asks for the bot token and your Discord user ID
bun start             # or ./install.sh --servico for a systemd service on Linux
```

Voice messages (optional): `docker compose up -d whisper` and `KAI_WHISPER_URL=http://127.0.0.1:9000` in `.env` (set `WHISPER_LANG` in `docker-compose.yml`).

## Security

Run it under a dedicated user without sudo. Only the owner is served, attachments and web content are treated as data, and `persona/.claude/settings.json` blocks `sudo`, `curl` and reading `.env`/SSH keys by default. Never publish your `.env`.

MIT licensed. Personal project, not affiliated with Anthropic or Discord.
