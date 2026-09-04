// Puro: recibe las filas ya leídas y arma lo que la sección dibuja. La zona no entra
// acá — los `day` ya vienen como fecha local desde la sincronización.
import { periodChange } from './social/delta'

export type AccountMetricRow = {
  network: string
  day: string
  followers: number | null
  profileViews: number | null
  reach: number | null
}

/**
 * Una cuenta no «nace» dentro de una ventana como sí lo hace un post, así que su
 * contador sin lectura previa siempre significa «no lo puedo saber». Esta fecha
 * imposible es lo que le dice eso a `periodChange`, cuyo cuarto argumento existe
 * justamente para distinguir los dos casos.
 */
const LA_CUENTA_YA_EXISTIA = '0000-01-01'

export type AccountCard = {
  network: string
  followers: number | null
  /** Seguidores ganados dentro del período; null cuando no hay lectura previa. */
  followersChange: number | null
  profileViews: number | null
  reach: number | null
  /** Fecha corta (ej. «3 sep») del día del que salen `profileViews`/`reach`; null si no hay lectura. */
  dayLabel: string | null
}

export function buildAccountCards(
  rows: AccountMetricRow[],
  from: string,
  to: string,
): AccountCard[] {
  const byNetwork = new Map<string, AccountMetricRow[]>()
  for (const row of rows) {
    const list = byNetwork.get(row.network) ?? []
    list.push(row)
    byNetwork.set(row.network, list)
  }

  return [...byNetwork.entries()].map(([network, list]) => {
    const ordered = [...list].sort((a, b) => a.day.localeCompare(b.day))
    const inside = ordered.filter((r) => r.day >= from && r.day <= to)
    const last = inside.at(-1) ?? null

    // El mismo motor que los posts: distingue «creció esto» de «no lo puedo saber».
    const followers = periodChange(
      ordered.map((r) => ({ day: r.day, value: r.followers })),
      from,
      to,
      LA_CUENTA_YA_EXISTIA,
    )

    return {
      network,
      followers: followers.current,
      followersChange: followers.change,
      profileViews: last?.profileViews ?? null,
      reach: last?.reach ?? null,
      dayLabel: last ? formatShortDay(last.day) : null,
    }
  })
}

export type AccountSeriesPoint = {
  date: string
  /** Suma entre redes; null solo cuando ninguna red aportó el dato ese día. */
  profileViews: number | null
  reach: number | null
}

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null
  return (a ?? 0) + (b ?? 0)
}

/**
 * Serie diaria de visitas al perfil y alcance, sumada entre redes cuando más de una
 * aporte el dato. Hoy solo Instagram lo entrega, pero la suma no lo asume: un día sin
 * ninguna lectura queda en null, no en cero.
 */
export function buildAccountSeries(
  rows: AccountMetricRow[],
  from: string,
  to: string,
): AccountSeriesPoint[] {
  const byDay = new Map<string, { profileViews: number | null; reach: number | null }>()
  for (const row of rows) {
    if (row.day < from || row.day > to) continue
    const existing = byDay.get(row.day) ?? { profileViews: null, reach: null }
    byDay.set(row.day, {
      profileViews: sumOrNull(existing.profileViews, row.profileViews),
      reach: sumOrNull(existing.reach, row.reach),
    })
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }))
}

const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/** `YYYY-MM-DD` → «3 sep», sin construir un `Date` (el día ya es wall-clock, no un instante). */
export function formatShortDay(day: string): string {
  const [, month, dayOfMonth] = day.split('-').map(Number) as [number, number, number]
  return `${dayOfMonth} ${MONTHS_SHORT[month - 1]}`
}
