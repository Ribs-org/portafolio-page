import { describe, expect, it } from 'vitest'

import { freshness } from './cache'

const now = new Date('2026-09-04T12:00:00Z').getTime()

describe('freshness', () => {
  it('recién guardado está fresco', () => {
    expect(freshness(now - 30_000, now)).toEqual({ fresca: true, etiqueta: 'recién' })
  })

  it('minutos y horas se cuentan en español', () => {
    expect(freshness(now - 20 * 60_000, now).etiqueta).toBe('hace 20 min')
    expect(freshness(now - 3 * 3600_000, now).etiqueta).toBe('hace 3 h')
    expect(freshness(now - 30 * 3600_000, now).etiqueta).toBe('hace 1 d')
  })

  it('pasados cinco minutos deja de estar fresca y se refresca al abrir', () => {
    expect(freshness(now - 4 * 60_000, now).fresca).toBe(true)
    expect(freshness(now - 6 * 60_000, now).fresca).toBe(false)
  })

  it('sin marca de tiempo no hay nada que mostrar', () => {
    expect(freshness(null, now)).toEqual({ fresca: false, etiqueta: null })
  })
})
