# Criando o bot do Discord

1. Abra o [Discord Developer Portal](https://discord.com/developers/applications) e clique em **New Application**. Dê o nome **Kai** (ou o que quiser).
2. Em **Bot**:
   - clique em **Reset Token** e copie o token. Ele vai no `.env` como `DISCORD_BOT_TOKEN`. **Não compartilhe com ninguém.**
   - ligue **Message Content Intent** (em *Privileged Gateway Intents*). Sem isso, o Kai não lê as mensagens.
   - se quiser, troque a foto do bot (pode usar `assets/kai-icon.png`).
3. Em **OAuth2 → URL Generator**, marque o escopo **bot** e as permissões:
   - Read Messages/View Channels, Send Messages, Send Messages in Threads, Create Public Threads, Read Message History, Add Reactions, Attach Files.
4. Abra a URL gerada e adicione o bot ao **seu** servidor.
5. Pegue o seu ID de usuário: no Discord, **Configurações → Avançado → Modo desenvolvedor**, depois clique com o botão direito no seu nome → **Copiar ID do usuário**. Ele vai no `.env` como `DISCORD_OWNER_ID`.
6. Crie os canais que quiser usar:
   - `#ideias`: tudo que você manda ali vira ideia, sem precisar mencionar o Kai;
   - `#briefing`: onde chega o briefing da manhã (rotina `briefing`).

   Os nomes podem ser outros: troque em `KAI_CANAL_IDEIAS` no `.env` e em `canal` no `config/rotinas.json`.

## Como falar com o Kai
- **DM**: fale direto, sem mencionar.
- **Em um canal**: mencione `@Kai`. Ele abre uma thread e continua a conversa ali, sem precisar mencionar de novo.
- **No `#ideias`**: só escreva.
- **Áudio**: mande uma mensagem de voz (com a transcrição ligada).
- **Testar uma rotina**: mande `!briefing` (ou o nome da rotina) na DM.

O Kai responde **só ao dono** (`DISCORD_OWNER_ID`). Outras pessoas no servidor são ignoradas.
