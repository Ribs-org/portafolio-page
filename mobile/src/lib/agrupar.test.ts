import { describe, expect, it } from 'vitest'

import { agruparPorDia } from './agrupar'

describe('agruparPorDia', () => {
  it('agrupa por el día del ISO que manda el API, sin tocar zonas', () => {
    const grupos = agruparPorDia([
      { id: 'a', texto: '', cuando: '2026-09-03T11:06:00-04:00', redes: [] },
      { id: 'b', texto: '', cuando: '2026-09-03T19:30:00-04:00', redes: [] },
      { id: 'c', texto: '', cuando: '2026-09-04T08:00:00-04:00', redes: [] },
    ])
    expect(grupos.map((g) => g.dia)).toEqual(['2026-09-03', '2026-09-04'])
    expect(grupos[0]!.posts.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('sin posts no hay grupos', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
