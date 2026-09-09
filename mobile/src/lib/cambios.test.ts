import { describe, expect, it } from 'vitest'

import { anotarCambio, huboCambioDesde } from './cambios'

describe('cambios', () => {
  it('sin marca de caché siempre hay que refrescar', () => {
    expect(huboCambioDesde(null)).toBe(true)
  })

  it('una caché guardada después del último cambio no necesita refresco', () => {
    anotarCambio(1_000)
    expect(huboCambioDesde(2_000)).toBe(false)
  })

  it('una caché guardada antes del último cambio sí', () => {
    anotarCambio(5_000)
    expect(huboCambioDesde(4_000)).toBe(true)
  })
})
