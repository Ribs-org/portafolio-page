import { describe, expect, it } from 'vitest'
import { ESCRIBE_RESPUESTA, validarRespuesta } from './validar'

describe('validarRespuesta', () => {
  it('rechaza el texto vacío o solo espacios con la frase fija', () => {
    expect(validarRespuesta('', 100)).toEqual({ error: ESCRIBE_RESPUESTA })
    expect(validarRespuesta('   \n ', 100)).toEqual({ error: ESCRIBE_RESPUESTA })
  })

  it('recorta los bordes y devuelve el texto', () => {
    expect(validarRespuesta('  ¡Gracias!  ', 100)).toEqual({ texto: '¡Gracias!' })
  })

  it('rechaza lo que pasa del límite de la red, contando puntos de código', () => {
    const r = validarRespuesta('🙂🙂🙂', 2)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toContain('2')
  })

  it('acepta justo el límite', () => {
    expect(validarRespuesta('🙂🙂', 2)).toEqual({ texto: '🙂🙂' })
  })
})
