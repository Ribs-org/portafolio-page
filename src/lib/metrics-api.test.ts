import { describe, expect, it } from 'vitest'
import { buildMetricPost, isoInZone, parseRango, RANGO_ERROR } from './metrics-api'
import type { PostRow } from './posts-kpis'

const ZONE = 'America/Santiago'
const now = new Date('2026-06-20T15:00:00Z')

describe('parseRango', () => {
  it('sin parámetros son los últimos 30 días', () => {
    const r = parseRango(null, null, now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.to).toEqual(now)
    expect(r.from).toEqual(new Date(now.getTime() - 30 * 864e5))
  })

  it('desde y hasta en zona, con el día final completo', () => {
    const r = parseRango('2026-06-01', '2026-06-02', now, ZONE)
    if ('error' in r) throw new Error(r.error)
    // Junio: invierno chileno, UTC-4 sin ambigüedad de DST. 00:00 Chile = 04:00Z.
    expect(r.from.toISOString()).toBe('2026-06-01T04:00:00.000Z')
    // hasta inclusive: el corte es el inicio del día siguiente
    expect(r.to.toISOString()).toBe('2026-06-03T04:00:00.000Z')
  })

  it('ilegible o invertido es la frase fija', () => {
    expect(parseRango('mañana', null, now, ZONE)).toEqual({ error: RANGO_ERROR })
    expect(parseRango('2026-06-05', '2026-06-01', now, ZONE)).toEqual({ error: RANGO_ERROR })
    expect(parseRango('2026-02-31', null, now, ZONE)).toEqual({ error: RANGO_ERROR })
  })
})

describe('isoInZone', () => {
  it('formatea el instante con el offset de la zona (meses sin ambigüedad de DST)', () => {
    expect(isoInZone(new Date('2026-01-15T14:15:00Z'), ZONE)).toBe('2026-01-15T11:15:00-03:00')
    expect(isoInZone(new Date('2026-06-15T14:15:00Z'), ZONE)).toBe('2026-06-15T10:15:00-04:00')
  })
})

describe('buildMetricPost', () => {
  const row: PostRow = {
    id: 'uuid-1', network: 'instagram', externalId: 'ext-9',
    permalink: 'https://instagram.com/p/x', caption: 'Hola', thumbnailUrl: null,
    mediaType: 'video', publishedLabel: '3 sep', publishedAt: new Date('2026-01-15T14:15:00Z'),
    campaign: 'reel-42', archived: false,
    views: 5210, viewsChange: 1200, likesChange: 30, commentsChange: 2, sharesChange: 1,
    isNew: false, likes: 310, comments: 12, shares: 8, saves: null, reach: 4100,
    visits: 85, uniques: 60, clicks: 40, ctr: 3.3, pull: 7.1,
  }

  it('mapea al shape en español preservando nulls', () => {
    expect(buildMetricPost(row, { hook: 'pregunta' }, ZONE)).toEqual({
      red: 'instagram', externalId: 'ext-9',
      permalink: 'https://instagram.com/p/x', texto: 'Hola',
      publicadoEl: '2026-01-15T11:15:00-03:00',
      etiqueta: 'reel-42', atributos: { hook: 'pregunta' }, archivado: false,
      metricas: {
        views: 5210, viewsGanadas: 1200, likes: 310, comentarios: 12,
        compartidos: 8, alcance: 4100, visitasAlSitio: 85, clicks: 40,
        ctr: 3.3, arrastre: 7.1,
      },
    })
  })

  it('el post orgánico va con atributos null y los nulls de métricas quedan nulls', () => {
    const organico = { ...row, views: null, visits: null, ctr: null, pull: null }
    const built = buildMetricPost(organico, null, ZONE)
    expect(built.atributos).toBeNull()
    expect(built.metricas.views).toBeNull()
    expect(built.metricas.visitasAlSitio).toBeNull()
    expect(built.metricas.arrastre).toBeNull()
  })
})
