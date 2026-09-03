import { describe, expect, it } from 'vitest'
import { buildAccountCards, type AccountMetricRow } from './account-stats'

const rows: AccountMetricRow[] = [
  { network: 'instagram', day: '2026-09-01', followers: 1500, profileViews: 100, reach: 2000 },
  { network: 'instagram', day: '2026-09-03', followers: 1540, profileViews: 122, reach: 3206 },
  { network: 'youtube', day: '2026-09-03', followers: 240, profileViews: null, reach: null },
]

describe('buildAccountCards', () => {
  it('una tarjeta por red, con seguidores actuales y lo ganado en el período', () => {
    expect(buildAccountCards(rows, '2026-09-02', '2026-09-03')).toEqual([
      { network: 'instagram', followers: 1540, followersChange: 40, profileViews: 122, reach: 3206 },
      { network: 'youtube', followers: 240, followersChange: null, profileViews: null, reach: null },
    ])
  })

  it('sin lectura previa el crecimiento es desconocido, no el total', () => {
    const cards = buildAccountCards(rows, '2026-08-01', '2026-09-03')
    expect(cards[0]!.followersChange).toBeNull()
  })

  it('sin filas no hay tarjetas', () => {
    expect(buildAccountCards([], '2026-09-01', '2026-09-03')).toEqual([])
  })
})
