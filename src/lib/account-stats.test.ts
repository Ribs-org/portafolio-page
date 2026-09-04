import { describe, expect, it } from 'vitest'
import {
  buildAccountCards,
  buildAccountSeries,
  formatShortDay,
  type AccountMetricRow,
} from './account-stats'

const rows: AccountMetricRow[] = [
  { network: 'instagram', day: '2026-09-01', followers: 1500, profileViews: 100, reach: 2000 },
  { network: 'instagram', day: '2026-09-03', followers: 1540, profileViews: 122, reach: 3206 },
  { network: 'youtube', day: '2026-09-03', followers: 240, profileViews: null, reach: null },
]

describe('buildAccountCards', () => {
  it('una tarjeta por red, con seguidores actuales y lo ganado en el período', () => {
    expect(buildAccountCards(rows, '2026-09-02', '2026-09-03')).toEqual([
      {
        network: 'instagram',
        followers: 1540,
        followersChange: 40,
        profileViews: 122,
        reach: 3206,
        dayLabel: '3 sep',
      },
      {
        network: 'youtube',
        followers: 240,
        followersChange: null,
        profileViews: null,
        reach: null,
        dayLabel: '3 sep',
      },
    ])
  })

  it('sin lectura previa el crecimiento es desconocido, no el total', () => {
    const cards = buildAccountCards(rows, '2026-08-01', '2026-09-03')
    expect(cards[0]!.followersChange).toBeNull()
  })

  it('sin lecturas dentro de la ventana, dayLabel es null', () => {
    const cards = buildAccountCards(rows, '2026-01-01', '2026-01-31')
    expect(cards[0]!.dayLabel).toBeNull()
  })

  it('sin filas no hay tarjetas', () => {
    expect(buildAccountCards([], '2026-09-01', '2026-09-03')).toEqual([])
  })
})

describe('buildAccountSeries', () => {
  it('una serie ordenada por día, sumando entre redes', () => {
    const withOverlap: AccountMetricRow[] = [
      { network: 'instagram', day: '2026-09-03', followers: 1540, profileViews: 122, reach: 3206 },
      { network: 'instagram', day: '2026-09-01', followers: 1500, profileViews: 100, reach: 2000 },
      { network: 'youtube', day: '2026-09-01', followers: 240, profileViews: 10, reach: 5 },
    ]
    expect(buildAccountSeries(withOverlap, '2026-09-01', '2026-09-03')).toEqual([
      { date: '2026-09-01', profileViews: 110, reach: 2005 },
      { date: '2026-09-03', profileViews: 122, reach: 3206 },
    ])
  })

  it('respeta la ventana', () => {
    expect(buildAccountSeries(rows, '2026-09-02', '2026-09-03')).toEqual([
      { date: '2026-09-03', profileViews: 122, reach: 3206 },
    ])
  })

  it('un día sin ninguna red con dato queda en null, no en cero', () => {
    const noData: AccountMetricRow[] = [
      { network: 'youtube', day: '2026-09-02', followers: 240, profileViews: null, reach: null },
    ]
    expect(buildAccountSeries(noData, '2026-09-02', '2026-09-02')).toEqual([
      { date: '2026-09-02', profileViews: null, reach: null },
    ])
  })

  it('lista vacía sin filas', () => {
    expect(buildAccountSeries([], '2026-09-01', '2026-09-03')).toEqual([])
  })
})

describe('formatShortDay', () => {
  it('formatea YYYY-MM-DD como «d mon» en español', () => {
    expect(formatShortDay('2026-09-03')).toBe('3 sep')
    expect(formatShortDay('2026-01-09')).toBe('9 ene')
  })
})
