// Kai: assistente pessoal no Discord, movido pelo Claude Code.
//
// Cada mensagem sua vira um `claude -p` na pasta da persona (CLAUDE.md), com memória por thread (--resume).
// Atende só o dono (DISCORD_OWNER_ID): DM, menção, threads abertas por ele e o canal de ideias (sem menção).
// Extras opcionais: transcrição de áudio (whisper), lembretes por DM, rotinas agendadas e sincronizar notas com git.

import { Client, Events, GatewayIntentBits, Partials, ChannelType, type Message } from 'discord.js'
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { carregarRotinas, deveRodar, partesDoDia, proximaVez, type Rotina } from './rotinas.ts'

// ---------- configuração (.env) ----------
const env = (k: string, padrao = '') => (process.env[k] ?? padrao).trim()
const TOKEN = env('DISCORD_BOT_TOKEN')
const DONO = env('DISCORD_OWNER_ID')
const NOME_DONO = env('KAI_NOME_DONO', 'você')
const PERSONA = resolve(env('KAI_PERSONA', join(import.meta.dir, '..', 'persona')))   // pasta com o CLAUDE.md
const DADOS = resolve(env('KAI_DADOS', join(import.meta.dir, '..', 'dados')))          // sessões, lembretes, anexos
const FUSO = env('KAI_FUSO', 'America/Sao_Paulo')
const CANAL_IDEIAS = env('KAI_CANAL_IDEIAS', 'ideias')
const WHISPER = env('KAI_WHISPER_URL')                     // ex.: http://127.0.0.1:9000 (vazio = sem áudio)
const NOTAS_GIT = env('KAI_NOTAS_GIT')                     // pasta de notas com git (vazio = não sincroniza)
const MODO = env('KAI_PERMISSION_MODE', 'auto')
const TIMEOUT_MS = Number(env('KAI_TIMEOUT_MIN', '5')) * 60_000

if (!TOKEN || !DONO) throw new Error('Faltam DISCORD_BOT_TOKEN ou DISCORD_OWNER_ID no .env (veja o .env.example)')
if (!existsSync(join(PERSONA, 'CLAUDE.md'))) throw new Error(`Não achei ${join(PERSONA, 'CLAUDE.md')}. Rode o install.sh ou copie persona/CLAUDE.md.example`)
mkdirSync(DADOS, { recursive: true })

const ARQ_SESSOES = join(DADOS, 'sessoes.json')
const ARQ_ROTINAS = join(DADOS, 'rotinas-rodadas.json')
const ARQ_LEMBRETES = join(DADOS, 'lembretes.db')
const INBOX = join(DADOS, 'anexos')

const lerJson = (arq: string) => (existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : {})
const sessoes: Record<string, string> = lerJson(ARQ_SESSOES)
const salvarSessoes = () => writeFileSync(ARQ_SESSOES, JSON.stringify(sessoes, null, 2), { mode: 0o600 })

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
})

// Uma chamada ao Claude por vez (cabe numa VPS pequena e evita duas respostas escrevendo nas mesmas notas)
let fila: Promise<unknown> = Promise.resolve()
function enfileirar<T>(tarefa: () => Promise<T>) {
  const p = fila.then(tarefa, tarefa)
  fila = p.catch(() => {})
  return p
}

// ---------- notas com git (ex.: um vault do Obsidian só com uma pasta) ----------
async function git(...args: string[]) {
  const p = Bun.spawn(['git', '-C', NOTAS_GIT, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  return { ok: (await p.exited) === 0, out: out.trim(), err: err.trim() }
}
const temGit = () => !!NOTAS_GIT && existsSync(join(NOTAS_GIT, '.git'))
async function puxarNotas() { if (temGit()) await git('pull', '--rebase', '--autostash', '-q') }
async function enviarNotas(resumo: string) {
  if (!temGit()) return
  await git('add', '-A')
  if ((await git('diff', '--cached', '--quiet')).ok) return
  await git('commit', '-qm', `Kai: ${resumo.replace(/\s+/g, ' ').slice(0, 60)}`)
  await git('pull', '--rebase', '--autostash', '-q')
  const r = await git('push', '-q')
  if (!r.ok) console.error('não consegui enviar as notas:', r.err)
}

// ---------- Claude Code ----------
async function perguntarAoClaude(texto: string, sessao?: string) {
  const args = ['claude', '-p', '--output-format', 'json', '--permission-mode', MODO]
  if (sessao) args.push('--resume', sessao)
  const proc = Bun.spawn(args, {
    cwd: PERSONA, stdin: new Blob([texto]), stdout: 'pipe', stderr: 'pipe',
    // bin/ no PATH: o Claude usa o comando `lembrete` dali
    env: { ...process.env, KAI_DADOS: DADOS, KAI_FUSO: FUSO, PATH: `${join(import.meta.dir, '..', 'bin')}:${process.env.PATH ?? ''}` },
  })
  const timer = setTimeout(() => proc.kill(), TIMEOUT_MS)
  const [saida, erro] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  clearTimeout(timer)
  await proc.exited
  try {
    const r = JSON.parse(saida)
    return { texto: String(r.result ?? '').trim(), sessao: r.session_id as string, erro: r.is_error ? String(r.result) : null }
  } catch {
    const motivo = proc.signalCode ? `demorou mais de ${TIMEOUT_MS / 60_000} min e foi interrompido` : (erro || saida).slice(0, 300)
    return { texto: '', sessao, erro: motivo }
  }
}

const agora = () => new Date().toLocaleString('pt-BR', {
  timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

function emPartes(texto: string, max = 1900) {
  const partes: string[] = []
  let resto = texto
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max)
    if (corte < max / 2) corte = max
    partes.push(resto.slice(0, corte))
    resto = resto.slice(corte).replace(/^\n/, '')
  }
  if (resto) partes.push(resto)
  return partes
}

// ---------- anexos e áudio ----------
async function salvarAnexos(msg: Message) {
  if (!msg.attachments.size) return []
  const pasta = join(INBOX, msg.id)
  mkdirSync(pasta, { recursive: true })
  const caminhos: string[] = []
  for (const a of msg.attachments.values()) {
    if (a.size > 25 * 1024 * 1024) continue
    const nome = a.name.replace(/[^\w.\-]/g, '_')
    writeFileSync(join(pasta, nome), Buffer.from(await (await fetch(a.url)).arrayBuffer()))
    caminhos.push(join(pasta, nome))
  }
  return caminhos
}
const ehAudio = (caminho: string) => /\.(ogg|oga|opus|mp3|m4a|wav|webm|aac|flac)$/i.test(caminho)
async function transcrever(caminho: string) {
  const r = await fetch(`${WHISPER.replace(/\/$/, '')}/transcrever`, { method: 'POST', body: Bun.file(caminho), signal: AbortSignal.timeout(TIMEOUT_MS) })
  const j: any = await r.json()
  if (!r.ok) throw new Error(j.erro || `whisper HTTP ${r.status}`)
  return String(j.texto || '').trim()
}

// ---------- mensagens ----------
client.on(Events.MessageCreate, async msg => {
  try {
    if (msg.author.bot || msg.author.id !== DONO) return
    const dm = msg.channel.type === ChannelType.DM
    if (dm && /^![\w-]+$/.test(msg.content.trim())) return          // atalhos de rotina: tratados abaixo
    const ch: any = msg.channel
    const threadDoBot = ch.isThread?.() && ch.ownerId === client.user!.id
    const mencionado = msg.mentions.users.has(client.user!.id)
    const nomeCanal: string = (ch.isThread?.() ? ch.parent?.name : ch.name) ?? ''
    const caixaIdeias = !dm && !!CANAL_IDEIAS && nomeCanal === CANAL_IDEIAS
    if (!dm && !threadDoBot && !mencionado && !caixaIdeias) return

    let texto = msg.content.replace(new RegExp(`<@!?${client.user!.id}>`, 'g'), '').trim()
    const salvos = await salvarAnexos(msg)
    const audios = salvos.filter(ehAudio), anexos = salvos.filter(a => !ehAudio(a))
    if (!texto && !salvos.length) return

    // Fora de DM e de thread, cada conversa ganha uma thread (e uma sessão própria do Claude)
    let destino: any = msg.channel
    if (!dm && !ch.isThread?.()) destino = await msg.startThread({ name: (texto || 'Anexo').slice(0, 90), autoArchiveDuration: 1440 })
    const chave = dm ? `dm:${msg.author.id}` : destino.id

    if (audios.length) {
      if (!WHISPER) await destino.send('🎙️ Recebi um áudio, mas a transcrição está desligada (KAI_WHISPER_URL no .env).')
      else {
        await msg.react('⏳').catch(() => {})
        const partes: string[] = []
        for (const a of audios) { try { partes.push(await transcrever(a)) } catch (e: any) { await destino.send(`⚠️ Não consegui transcrever o áudio: ${e.message}`) } }
        await msg.reactions.cache.get('⏳')?.users.remove(client.user!.id).catch(() => {})
        const transcricao = partes.filter(Boolean).join('\n')
        if (transcricao) {
          await destino.send(`📝 **Transcrição:**\n> ${transcricao.slice(0, 1800).replace(/\n/g, '\n> ')}`)
          texto = [texto, `[Áudio transcrito]: ${transcricao}`].filter(Boolean).join('\n')
        }
      }
      if (!texto && !anexos.length) { await msg.react('❌').catch(() => {}); return }
    }

    await msg.react('👀').catch(() => {})
    const prompt = [
      `[Mensagem de ${NOME_DONO} pelo Discord · ${dm ? 'DM' : `#${nomeCanal || 'canal'}`} · agora: ${agora()} (${FUSO})]`,
      caixaIdeias ? `[Caixa de ideias: siga a seção "Caixa de ideias" do CLAUDE.md. Thread: ${destino.id}]` : '',
      texto,
      anexos.length ? `\nAnexos salvos (leia se precisar):\n${anexos.map(a => `- ${a}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')

    const digitando = setInterval(() => destino.sendTyping().catch(() => {}), 8000)
    destino.sendTyping().catch(() => {})
    const r = await enfileirar(async () => {
      await puxarNotas()
      const resposta = await perguntarAoClaude(prompt, sessoes[chave])
      await enviarNotas(texto || 'anexo')
      return resposta
    })
    clearInterval(digitando)

    if (r.sessao) { sessoes[chave] = r.sessao; salvarSessoes() }
    if (r.erro && !r.texto) { await destino.send(`⚠️ Não consegui responder: ${r.erro}`); await msg.react('❌').catch(() => {}); return }
    for (const parte of emPartes(r.texto || '(sem resposta)')) await destino.send(parte)
    await msg.reactions.cache.get('👀')?.users.remove(client.user!.id).catch(() => {})
    await msg.react('✅').catch(() => {})
  } catch (e) {
    console.error('erro ao tratar mensagem:', e)
    await msg.react('❌').catch(() => {})
  }
})

// ---------- lembretes (criados pelo comando bin/lembrete; entregues por DM na hora) ----------
let entregando = false
async function entregarLembretes() {
  if (entregando || !existsSync(ARQ_LEMBRETES)) return
  entregando = true
  let banco: Database | undefined
  try {
    banco = new Database(ARQ_LEMBRETES)
    banco.exec('pragma busy_timeout = 5000')
    const vencidos: any[] = banco.query(
      'select id, quando, texto, repetir from lembretes where cancelado = 0 and enviado_em is null and quando <= ? order by quando',
    ).all(new Date().toISOString())
    if (!vencidos.length) return
    const dono = await client.users.fetch(DONO)
    const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: FUSO, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    for (const l of vencidos) {
      const atrasado = Date.now() - Date.parse(l.quando) > 15 * 60_000 ? `\n-# era para ${fmt(l.quando)} (eu estava fora do ar)` : ''
      const proxima = l.repetir ? proximaVez(l.quando, l.repetir, FUSO) : null
      const rep = proxima ? `\n-# repete ${l.repetir} · próximo: ${fmt(proxima)} · para cancelar: "cancela o lembrete #${l.id}"` : ''
      await dono.send(`⏰ **Lembrete:** ${l.texto}${atrasado}${rep}`)
      if (proxima) banco.query('update lembretes set quando = ? where id = ?').run(proxima, l.id)
      else banco.query('update lembretes set enviado_em = ? where id = ?').run(new Date().toISOString(), l.id)
    }
  } finally {
    banco?.close()
    entregando = false
  }
}

// ---------- rotinas agendadas (config/rotinas.json) ----------
const rotinas: Rotina[] = carregarRotinas(resolve(env('KAI_ROTINAS', join(import.meta.dir, '..', 'config', 'rotinas.json'))))
const rodadas: Record<string, string> = lerJson(ARQ_ROTINAS)

async function rodarRotina(r: Rotina) {
  const canal: any = client.channels.cache.find((c: any) => c.name === r.canal && c.isTextBased?.())
  const destino = canal ?? (await client.users.fetch(DONO))       // sem o canal, manda por DM
  const pedido = await r.montarPedido()
  const resposta = await enfileirar(async () => {
    await puxarNotas()
    const x = await perguntarAoClaude(`[Rotina agendada "${r.nome}" · agora: ${agora()} (${FUSO})]\n${pedido}`)
    await enviarNotas(r.nome)
    return x
  })
  for (const parte of emPartes(resposta.texto || `⚠️ A rotina ${r.nome} falhou: ${resposta.erro}`)) await destino.send(parte)
}

async function verificarRotinas() {
  const p = partesDoDia(FUSO)
  for (const r of rotinas) {
    if (!deveRodar(r, p) || rodadas[r.nome] === p.dia) continue
    rodadas[r.nome] = p.dia
    writeFileSync(ARQ_ROTINAS, JSON.stringify(rodadas, null, 2))
    await rodarRotina(r).catch(e => console.error(`rotina ${r.nome}:`, e))
  }
}

// Atalho para testar: mande "!<nome da rotina>" na DM (ex.: !briefing)
client.on(Events.MessageCreate, async msg => {
  if (msg.author.id !== DONO || msg.channel.type !== ChannelType.DM) return
  const nome = msg.content.trim().match(/^!([\w-]+)$/)?.[1]
  const r = rotinas.find(x => x.nome === nome)
  if (!r) return
  await msg.react('⏳').catch(() => {})
  await rodarRotina(r)
  await msg.react('✅').catch(() => {})
})

client.once(Events.ClientReady, () => {
  console.log(`Kai conectado como ${client.user!.tag} · persona: ${PERSONA} · ${rotinas.length} rotina(s) · áudio: ${WHISPER ? 'ligado' : 'desligado'}`)
  setInterval(() => verificarRotinas().catch(e => console.error('rotinas:', e)), 60_000)
  entregarLembretes().catch(e => console.error('lembretes:', e))
  setInterval(() => entregarLembretes().catch(e => console.error('lembretes:', e)), 30_000)
})
client.login(TOKEN)
