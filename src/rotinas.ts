// Rotinas agendadas e cálculo de datas no fuso do dono.
import { existsSync, readFileSync } from 'node:fs'

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
type Dia = typeof DIAS[number]

export type Rotina = {
  nome: string                 // também é o atalho na DM: !<nome>
  canal: string                // nome do canal (sem #); se não existir, vai por DM
  dias: Dia[]                  // vazio = todo dia
  hora: string                 // "HH:MM": a partir de quando roda
  ate: string                  // "HH:MM": se o Kai estava fora do ar, ainda roda até este horário
  pedido: string               // o que pedir ao Claude; aceita {clima} e {data}
  montarPedido: () => Promise<string>
}

const paraMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }

/** Partes da data/hora atual no fuso: dia (AAAA-MM-DD), dia da semana e minutos desde 0h. */
export function partesDoDia(fuso: string, quando = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(quando).map(x => [x.type, x.value]))
  const semana = DIAS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)]
  return { dia: `${p.year}-${p.month}-${p.day}`, semana, minutos: Number(p.hour) * 60 + Number(p.minute) }
}

export function deveRodar(r: Rotina, p: ReturnType<typeof partesDoDia>) {
  if (r.dias.length && !r.dias.includes(p.semana)) return false
  return p.minutos >= paraMin(r.hora) && p.minutos <= paraMin(r.ate)
}

/** Próxima ocorrência de um lembrete que repete (diario | dias-uteis | semanal | mensal), sempre no futuro. */
export function proximaVez(iso: string, repetir: string, fuso: string) {
  const d = new Date(iso)
  do {
    if (repetir === 'mensal') d.setUTCMonth(d.getUTCMonth() + 1)
    else d.setUTCDate(d.getUTCDate() + (repetir === 'semanal' ? 7 : 1))
    if (repetir === 'dias-uteis') while (['sab', 'dom'].includes(partesDoDia(fuso, d).semana)) d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getTime() <= Date.now())
  return d.toISOString()
}

// Clima do dia pela Open-Meteo (grátis, sem chave)
const TEMPO: Record<number, string> = {
  0: 'céu limpo', 1: 'poucas nuvens', 2: 'parcialmente nublado', 3: 'nublado', 45: 'neblina', 48: 'neblina',
  51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte',
  80: 'pancadas fracas', 81: 'pancadas de chuva', 82: 'pancadas fortes', 95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas com granizo',
}
export async function climaDeHoje(cidade: string, pais: string, fuso: string) {
  if (!cidade) return 'cidade não configurada (KAI_CIDADE no .env)'
  try {
    const g: any = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=${encodeURIComponent(cidade)}${pais ? `&countryCode=${pais}` : ''}`)).json()
    const local = g.results?.[0]
    if (!local) return `não achei a cidade "${cidade}"`
    const f: any = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${local.latitude}&longitude=${local.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=${encodeURIComponent(fuso)}&forecast_days=1`)).json()
    const d = f.daily
    return `${local.name}: ${TEMPO[d.weather_code[0]] ?? 'tempo variável'}, mín ${Math.round(d.temperature_2m_min[0])}°C, máx ${Math.round(d.temperature_2m_max[0])}°C, chance de chuva ${d.precipitation_probability_max[0]}%`
  } catch (e: any) {
    return `clima indisponível (${e.message})`
  }
}

/** Lê config/rotinas.json. Arquivo ausente = nenhuma rotina. */
export function carregarRotinas(arquivo: string): Rotina[] {
  if (!existsSync(arquivo)) return []
  const fuso = process.env.KAI_FUSO || 'America/Sao_Paulo'
  const lista = JSON.parse(readFileSync(arquivo, 'utf8')) as any[]
  return lista.map((r, i) => {
    if (!r.nome || !/^[\w-]+$/.test(r.nome)) throw new Error(`rotinas.json, item ${i + 1}: "nome" só com letras, números, - e _`)
    if (!/^\d{1,2}:\d{2}$/.test(r.hora ?? '')) throw new Error(`rotinas.json, "${r.nome}": "hora" no formato HH:MM`)
    const dias = (r.dias ?? []).map((d: string) => d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3))
    for (const d of dias) if (!DIAS.includes(d)) throw new Error(`rotinas.json, "${r.nome}": dia "${d}" inválido (use ${DIAS.join(', ')})`)
    const rotina: Rotina = {
      nome: r.nome, canal: r.canal ?? '', dias, hora: r.hora, ate: r.ate ?? '23:59', pedido: String(r.pedido ?? ''),
      montarPedido: async () => {
        let t = rotina.pedido
        if (t.includes('{clima}')) t = t.replaceAll('{clima}', await climaDeHoje(process.env.KAI_CIDADE || '', process.env.KAI_PAIS || '', fuso))
        return t.replaceAll('{data}', partesDoDia(fuso).dia)
      },
    }
    return rotina
  })
}
