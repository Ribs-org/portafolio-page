import { describe, expect, it } from 'vitest'
import {
  INSTRUCCIONES_POR_DEFECTO,
  TOPE_INSTRUCCIONES,
  normalizarInstrucciones,
} from './instrucciones'

describe('normalizarInstrucciones', () => {
  it('devuelve las de por defecto cuando no hay nada guardado', () => {
    expect(normalizarInstrucciones(null)).toBe(INSTRUCCIONES_POR_DEFECTO)
  })

  it('devuelve las de por defecto cuando lo guardado es espacio en blanco', () => {
    expect(normalizarInstrucciones('   \n  ')).toBe(INSTRUCCIONES_POR_DEFECTO)
  })

  it('recorta los bordes de lo guardado', () => {
    expect(normalizarInstrucciones('  Responde corto.  ')).toBe('Responde corto.')
  })

  it('corta al tope por puntos de código, sin partir un emoji', () => {
    const largo = '🙂'.repeat(TOPE_INSTRUCCIONES + 50)
    const corto = normalizarInstrucciones(largo)
    expect([...corto]).toHaveLength(TOPE_INSTRUCCIONES)
    expect(corto.endsWith('🙂')).toBe(true)
  })
})
