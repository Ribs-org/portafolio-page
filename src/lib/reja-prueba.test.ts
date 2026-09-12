import { describe, expect, it } from 'vitest'

// Archivo desechable: existe solo para comprobar que la reja bloquea de verdad.
// Se borra junto con su rama apenas termine la prueba.
describe('la reja', () => {
  it('falla a propósito', () => {
    expect(1).toBe(2)
  })
})
