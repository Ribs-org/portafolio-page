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
    publishedLabel: '1 ago',
    campaign: 'reel-1',
    archived: false,
    views: null,
    viewsChange: null,
    likesChange: null,
    commentsChange: null,
    sharesChange: null,
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
      row({ viewsChange: 100, likesChange: 10, commentsChange: null, sharesChange: 5, visits: 20 }),
      row({
        viewsChange: null,
        likesChange: null,
        commentsChange: 3,
        sharesChange: null,
        visits: null,
      }),
    ]

    const kpis = postKpisFrom(rows)

    // views: 100 + (null→0) = 100. engagement: (10+0)+(0+3)+(5+0) = 18.
    expect(kpis.views).toBe(100)
    expect(kpis.engagement).toBe(18)
    expect(kpis.visits).toBe(20)
  })

  it('las tiles cuentan lo ganado en el período, no el acumulado de toda la vida', () => {
    // The cumulative counters are an order of magnitude bigger than the period's
    // growth, so a tile that reached for them instead would be off by 100x — and its
    // "En el período" hint would be a lie. Same for the interaction totals.
    const rows = [
      row({
        views: 50_000,
        viewsChange: 500,
        likes: 4000,
        likesChange: 40,
        comments: 900,
        commentsChange: 9,
        shares: 100,
        sharesChange: 1,
      }),
    ]

    const kpis = postKpisFrom(rows)

    expect(kpis.views).toBe(500)
    expect(kpis.engagement).toBe(50)
  })

  it('arrastre es nulo cuando no se ganaron views en el período', () => {
    // A post nobody watched this period has no denominator, and inventing one would
    // report an arrastre for an audience that never existed.
    const rows = [
      row({ views: 50_000, viewsChange: null, visits: 10 }),
      row({ views: 3000, viewsChange: null, visits: null }),
    ]

    expect(postKpisFrom(rows).pull).toBeNull()
  })

  it('arrastre suma visitas y views ganadas antes de dividir, no promedia la razón de cada fila', () => {
    // Per-row ratios are 1% and 40% — deliberately far apart so summing-then-dividing
    // and averaging-the-ratios land on very different numbers. Only the former is
    // correct: a post that gained 1000 views must outweigh one that gained 100.
    // The lifetime counters are set to the mirror image of the gains so a formula that
    // reached for `views` instead of `viewsChange` would land nowhere near either answer.
    const rows = [
      row({ views: 1200, viewsChange: 1000, visits: 10 }),
      row({ views: 90_000, viewsChange: 100, visits: 40 }),
    ]

    // Summed: (10 + 40) / (1000 + 100) * 100 ≈ 4.55%. Averaging the ratios would give
    // (1% + 40%) / 2 = 20.5% instead — a test built on closer numbers wouldn't tell
    // these two formulas apart.
    expect(postKpisFrom(rows).pull).toBeCloseTo((50 / 1100) * 100, 10)
  })
})
