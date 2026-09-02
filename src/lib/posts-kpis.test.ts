import { describe, expect, it } from 'vitest'
import {
  activeRows,
  hasNoPlatformMetrics,
  postKpisFrom,
  topPostsByGain,
  unpastedCount,
  withPlatformMetrics,
  networksPresent,
  withoutPlatformMetricsCount,
  type PostRow,
} from './posts-kpis'

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

describe('activeRows', () => {
  it('deja fuera las borradas y conserva el orden de las demás', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', archived: true }),
      row({ id: 'c' }),
    ]

    expect(activeRows(rows).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('un arreglo vacío queda vacío', () => {
    expect(activeRows([])).toEqual([])
  })

  it('no muta el arreglo que recibe', () => {
    // Everything else in this module filters through `activeRows`, so a mutation here
    // would reach the rows the page is about to render.
    const rows = [row({ id: 'a' }), row({ id: 'b', archived: true })]

    activeRows(rows)

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('unpastedCount', () => {
  it('un arreglo vacío no tiene nada que avisar', () => {
    expect(unpastedCount([])).toBe(0)
  })

  it('cero visitas no es lo mismo que nunca haber pegado el link', () => {
    // The whole point of the nudge: a tag that was pasted and nobody clicked comes back
    // as 0 and needs no advice. Only `null` — never seen — counts.
    const rows = [row({ id: 'a', visits: null }), row({ id: 'b', visits: 0 })]

    expect(unpastedCount(rows)).toBe(1)
  })

  it('cuenta todas cuando ninguna tiene el link pegado', () => {
    expect(unpastedCount([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })])).toBe(3)
  })

  it('no cuenta las borradas: nadie puede pegar un link en un post que ya no existe', () => {
    const rows = [
      row({ id: 'a', visits: null }),
      row({ id: 'b', visits: null, archived: true }),
      row({ id: 'c', visits: null, archived: true }),
    ]

    expect(unpastedCount(rows)).toBe(1)
  })

  it('cero cuando todas ya tienen visitas', () => {
    expect(unpastedCount([row({ id: 'a', visits: 12 }), row({ id: 'b', visits: 0 })])).toBe(0)
  })
})

describe('hasNoPlatformMetrics', () => {
  it('sólo cuando views, likes y comentarios son los tres nulos', () => {
    expect(hasNoPlatformMetrics(row({}))).toBe(true)
    expect(hasNoPlatformMetrics(row({ views: 0 }))).toBe(false)
    expect(hasNoPlatformMetrics(row({ likes: 0 }))).toBe(false)
    expect(hasNoPlatformMetrics(row({ comments: 3 }))).toBe(false)
  })

  it('ignora las métricas que ninguna columna muestra', () => {
    // A row carrying only `shares`/`saves`/`reach` still reads as blank in the table,
    // so it belongs with the rows that step back — consulting those fields would leave
    // a visually empty row looking undimmed and unexplained.
    expect(hasNoPlatformMetrics(row({ shares: 9, saves: 4, reach: 100 }))).toBe(true)
  })

  it('las visitas propias no rescatan a una fila sin métricas de la red', () => {
    expect(hasNoPlatformMetrics(row({ visits: 40, clicks: 2 }))).toBe(true)
  })
})

describe('withoutPlatformMetricsCount', () => {
  it('un arreglo vacío da cero', () => {
    expect(withoutPlatformMetricsCount([])).toBe(0)
  })

  it('cuenta las filas sin ninguna de las tres métricas', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', views: 1200, likes: 30, comments: 4 }),
      row({ id: 'c', views: 0, likes: null, comments: null }),
    ]

    // 'c' has a real zero from the network, which is data — only 'a' is blank.
    expect(withoutPlatformMetricsCount(rows)).toBe(1)
  })

  it('todas cuando el catálogo entero es anterior a la cuenta profesional', () => {
    expect(withoutPlatformMetricsCount([row({ id: 'a' }), row({ id: 'b' })])).toBe(2)
  })

  it('no cuenta las borradas', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', archived: true })]

    expect(withoutPlatformMetricsCount(rows)).toBe(1)
  })
})

describe('withPlatformMetrics', () => {
  it('deja pasar las filas con al menos una de las tres métricas', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', likes: 0 }),
      row({ id: 'c', views: 900, likes: 10, comments: 2 }),
    ]

    expect(withPlatformMetrics(rows).map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('no toca el estado de borrado: el filtro responde otra pregunta', () => {
    const rows = [row({ id: 'a', archived: true, views: 500 }), row({ id: 'b', archived: true })]

    expect(withPlatformMetrics(rows).map((r) => r.id)).toEqual(['a'])
  })

  it('un arreglo vacío queda vacío', () => {
    expect(withPlatformMetrics([])).toEqual([])
  })
})

describe('topPostsByGain', () => {
  it('un arreglo vacío no tiene tope', () => {
    expect(topPostsByGain([], 10)).toEqual([])
  })

  it('ordena de mayor a menor por views ganadas', () => {
    const rows = [
      row({ id: 'a', viewsChange: 50 }),
      row({ id: 'b', viewsChange: 900 }),
      row({ id: 'c', viewsChange: 300 }),
    ]

    const top = topPostsByGain(rows, 10)

    expect(top.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(top.map((r) => r.viewsChange)).toEqual([900, 300, 50])
  })

  it('deja fuera lo que no creció: cero no es crecimiento y nulo no es cero', () => {
    const rows = [
      row({ id: 'creció', viewsChange: 10 }),
      row({ id: 'plano', viewsChange: 0 }),
      row({ id: 'sin-lectura', viewsChange: null }),
    ]

    expect(topPostsByGain(rows, 10).map((r) => r.id)).toEqual(['creció'])
  })

  it('respeta el límite y devuelve las mejores, no las primeras', () => {
    const rows = [
      row({ id: 'a', viewsChange: 1 }),
      row({ id: 'b', viewsChange: 2 }),
      row({ id: 'c', viewsChange: 3 }),
    ]

    const top = topPostsByGain(rows, 2)

    expect(top.map((r) => r.id)).toEqual(['c', 'b'])
    expect(top.map((r) => r.viewsChange)).toEqual([3, 2])
  })

  it('un límite de cero o negativo devuelve nada', () => {
    const rows = [row({ id: 'a', viewsChange: 100 })]

    expect(topPostsByGain(rows, 0)).toEqual([])
    expect(topPostsByGain(rows, -1)).toEqual([])
  })

  it('los empates conservan el orden en que llegaron', () => {
    const rows = [
      row({ id: 'primera', viewsChange: 40 }),
      row({ id: 'segunda', viewsChange: 40 }),
      row({ id: 'tercera', viewsChange: 40 }),
    ]

    expect(topPostsByGain(rows, 3).map((r) => r.id)).toEqual(['primera', 'segunda', 'tercera'])
    expect(topPostsByGain(rows, 2).map((r) => r.id)).toEqual(['primera', 'segunda'])
  })

  it('no rankea posts borrados por más que hayan crecido', () => {
    const rows = [
      row({ id: 'viva', viewsChange: 10 }),
      row({ id: 'borrada', viewsChange: 5000, archived: true }),
    ]

    expect(topPostsByGain(rows, 10).map((r) => r.id)).toEqual(['viva'])
  })

  it('no muta el arreglo que recibe', () => {
    const rows = [row({ id: 'a', viewsChange: 1 }), row({ id: 'b', viewsChange: 9 })]

    topPostsByGain(rows, 10)

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('networksPresent', () => {
  it('lista cada red una sola vez, en el orden canónico del catálogo', () => {
    const rows = [
      row({ id: 'a', network: 'tiktok' }),
      row({ id: 'b', network: 'instagram' }),
      row({ id: 'c', network: 'tiktok' }),
      row({ id: 'd', network: 'youtube' }),
    ]
    expect(networksPresent(rows)).toEqual(['instagram', 'tiktok', 'youtube'])
  })

  it('una red fuera del orden canónico va al final, en orden de llegada', () => {
    const rows = [
      row({ id: 'a', network: 'mastodon' }),
      row({ id: 'b', network: 'x' }),
    ]
    expect(networksPresent(rows)).toEqual(['x', 'mastodon'])
  })

  it('sin filas no hay chips', () => {
    expect(networksPresent([])).toEqual([])
  })
})
