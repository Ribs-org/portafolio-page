// Pure pieces of GET /api/metrics/posts. The zone arrives as a parameter — this
// module must stay importable by vitest (no server-only imports).
import { addDays } from '@/lib/schedule-week'
import { fromZonedInput } from '@/lib/utils'
import type { Atributos } from '@/lib/social/publish/atributos'
import type { PostRow } from '@/lib/posts-kpis'

export const RANGO_ERROR = 'El rango de fechas no se entendió (usa YYYY-MM-DD).'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** `hasta` cubre el día completo: el corte es el inicio del día siguiente en la zona. */
export function parseRango(
  desde: string | null,
  hasta: string | null,
  now: Date,
  zone: string,
): { from: Date; to: Date } | { error: string } {
  let to = now
  if (hasta !== null) {
    if (!DAY_KEY.test(hasta) || addDays(hasta, 0) !== hasta) return { error: RANGO_ERROR }
    const parsed = fromZonedInput(`${addDays(hasta, 1)}T00:00`, zone)
    if (!parsed) return { error: RANGO_ERROR }
    to = parsed
  }

  let from = new Date(to.getTime() - 30 * 864e5)
  if (desde !== null) {
    if (!DAY_KEY.test(desde) || addDays(desde, 0) !== desde) return { error: RANGO_ERROR }
    const parsed = fromZonedInput(`${desde}T00:00`, zone)
    if (!parsed) return { error: RANGO_ERROR }
    from = parsed
  }

  if (from.getTime() > to.getTime()) return { error: RANGO_ERROR }
  return { from, to }
}

/** ISO con el offset de la zona: 2026-09-03T11:15:00-03:00. */
export function isoInZone(date: Date, zone: string): string {
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
    .format(date)
    .replace(' ', 'T')
  const offsetMin = Math.round((new Date(`${wall}Z`).getTime() - date.getTime()) / 60000)
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${wall}${sign}${hh}:${mm}`
}

export type MetricPost = {
  red: string
  externalId: string
  permalink: string | null
  texto: string | null
  publicadoEl: string
  etiqueta: string
  atributos: Atributos | null
  archivado: boolean
  metricas: {
    views: number | null
    viewsGanadas: number | null
    likes: number | null
    comentarios: number | null
    compartidos: number | null
    alcance: number | null
    visitasAlSitio: number | null
    clicks: number | null
    ctr: number | null
    arrastre: number | null
  }
}

/** Nombres en español para el consumidor; los nulls viajan intactos (nunca 0). */
export function buildMetricPost(
  row: PostRow,
  atributos: Atributos | null,
  zone: string,
): MetricPost {
  return {
    red: row.network,
    externalId: row.externalId,
    permalink: row.permalink,
    texto: row.caption,
    publicadoEl: isoInZone(row.publishedAt, zone),
    etiqueta: row.campaign,
    atributos,
    archivado: row.archived,
    metricas: {
      views: row.views,
      viewsGanadas: row.viewsChange,
      likes: row.likes,
      comentarios: row.comments,
      compartidos: row.shares,
      alcance: row.reach,
      visitasAlSitio: row.visits,
      clicks: row.clicks,
      ctr: row.ctr,
      arrastre: row.pull,
    },
  }
}
