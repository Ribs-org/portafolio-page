import { describe, expect, it } from 'vitest'
import { periodChange, type Snapshot } from './delta'

const snapshots: Snapshot[] = [
  { day: '2026-08-01', value: 100 },
  { day: '2026-08-10', value: 400 },
  { day: '2026-08-20', value: 900 },
]

describe('periodChange', () => {
  it('resta el último snapshot previo al período', () => {
    expect(periodChange(snapshots, '2026-08-05', '2026-08-25')).toEqual({
      current: 900,
      change: 800,
      isNew: false,
    })
  })

  it('sin snapshot previo, el crecimiento es el acumulado y el post es nuevo', () => {
    expect(periodChange(snapshots, '2026-07-01', '2026-08-25')).toEqual({
      current: 900,
      change: 900,
      isNew: true,
    })
  })

  it('sin snapshots dentro del período no hay dato', () => {
    expect(periodChange(snapshots, '2026-09-01', '2026-09-30')).toEqual({
      current: null,
      change: null,
      isNew: false,
    })
  })

  it('usa el snapshot más cercano al borde, no uno exacto', () => {
    // El cron se saltó el 2026-08-15; el borde cae en un día sin fila.
    expect(periodChange(snapshots, '2026-08-15', '2026-08-25').change).toBe(500)
  })

  it('piso en cero cuando el contador retrocede', () => {
    const corrected: Snapshot[] = [
      { day: '2026-08-01', value: 500 },
      { day: '2026-08-10', value: 450 },
    ]
    expect(periodChange(corrected, '2026-08-05', '2026-08-25').change).toBe(0)
  })

  it('ignora los snapshots con la métrica ausente', () => {
    const partial: Snapshot[] = [
      { day: '2026-08-01', value: null },
      { day: '2026-08-10', value: 300 },
    ]
    expect(periodChange(partial, '2026-08-05', '2026-08-25')).toEqual({
      current: 300,
      change: 300,
      isNew: true,
    })
  })

  it('sin snapshots no revienta', () => {
    expect(periodChange([], '2026-08-01', '2026-08-25')).toEqual({
      current: null,
      change: null,
      isNew: false,
    })
  })
})
