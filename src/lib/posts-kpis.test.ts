import { describe, expect, it } from 'vitest'
import { postKpisFrom, type PostRow } from './posts-kpis'

/** Builds a full `PostRow`, overriding only the fields a test cares about. */
function row(overrides: Partial<PostRow>): PostRow {
  return {
    id: 'post-1',
    network: 'instagram',
    permalink: null,
    caption: null,
    thumbnailUrl: null,
    mediaType: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    campaign: 'reel-1',
    archived: false,
    views: null,
    viewsChange: null,
    isNew: false,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    reach: null,
    visits: null,
    uniques: null,
    clicks: null,
    ctr: null,
    pull: null,
    ...overrides,
  }
}

describe('postKpisFrom', () => {
  it('un arreglo vacío da todo en cero y arrastre nulo', () => {
    expect(postKpisFrom([])).toEqual({
      views: 0,
      engagement: 0,
      visits: 0,
      pull: null,
    })
  })

  it('los nulos no aportan a la suma, no se convierten en cero', () => {
    const rows = [
      row({ views: 100, likes: 10, comments: null, shares: 5, visits: 20 }),
      row({ views: null, likes: null, comments: 3, shares: null, visits: null }),
    ]

    const kpis = postKpisFrom(rows)

    // views: 100 + (null→0) = 100. engagement: (10+0)+(0+3)+(5+0) = 18.
    expect(kpis.views).toBe(100)
    expect(kpis.engagement).toBe(18)
    expect(kpis.visits).toBe(20)
  })

  it('distingue visitas nulas (etiqueta nunca pegada) de visitas en cero (pegada, sin tráfico)', () => {
    const neverPasted = row({ views: 50, visits: null })
    const pastedButQuiet = row({ views: 50, visits: 0 })

    const kpis = postKpisFrom([neverPasted, pastedButQuiet])

    // Both contribute 0 to the visits total — the distinction matters per-row,
    // not in the aggregate — but the total itself must still land on a real 0.
    expect(kpis.visits).toBe(0)
    expect(kpis.views).toBe(100)
  })

  it('arrastre es nulo cuando las views totales son cero', () => {
    const rows = [row({ views: null, visits: 10 }), row({ views: null, visits: null })]

    expect(postKpisFrom(rows).pull).toBeNull()
  })

  it('arrastre es un porcentaje real cuando hay views', () => {
    const rows = [row({ views: 200, visits: 50 }), row({ views: 100, visits: 25 })]

    // total visits 75 / total views 300 * 100 = 25
    expect(postKpisFrom(rows).pull).toBe(25)
  })
})
