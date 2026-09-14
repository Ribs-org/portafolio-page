import { describe, expect, it } from 'vitest'
import { DIAS_PRIVADO, tocaPrivado } from './privado'

const AHORA = new Date('2026-09-14T12:00:00.000Z')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 864e5)

describe('tocaPrivado', () => {
  it('nunca con la bandera apagada', () => {
    expect(tocaPrivado('instagram', hace(1), AHORA, false)).toBe(false)
  })

  it('solo en Instagram y Facebook', () => {
    expect(tocaPrivado('instagram', hace(1), AHORA, true)).toBe(true)
    expect(tocaPrivado('facebook', hace(1), AHORA, true)).toBe(true)
    expect(tocaPrivado('youtube', hace(1), AHORA, true)).toBe(false)
  })

  it('solo dentro de la ventana de Meta', () => {
    expect(tocaPrivado('instagram', hace(DIAS_PRIVADO - 1), AHORA, true)).toBe(true)
    expect(tocaPrivado('instagram', hace(DIAS_PRIVADO + 1), AHORA, true)).toBe(false)
  })
})
