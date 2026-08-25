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

  it('arrastre es nulo cuando las views totales son cero', () => {
    const rows = [row({ views: null, visits: 10 }), row({ views: null, visits: null })]

    expect(postKpisFrom(rows).pull).toBeNull()
  })

  it('arrastre suma visitas y views totales antes de dividir, no promedia la razón de cada fila', () => {
    // Per-row ratios are 1% and 40% — deliberately far apart so summing-then-dividing
    // and averaging-the-ratios land on very different numbers. Only the former is
    // correct: a post with 1000 views must outweigh one with 100 in the total.
    const rows = [row({ views: 1000, visits: 10 }), row({ views: 100, visits: 40 })]

    // Summed: (10 + 40) / (1000 + 100) * 100 ≈ 4.55%. Averaging the ratios would give
    // (1% + 40%) / 2 = 20.5% instead — a test built on closer numbers wouldn't tell
    // these two formulas apart.
    expect(postKpisFrom(rows).pull).toBeCloseTo((50 / 1100) * 100, 10)
  })
})
