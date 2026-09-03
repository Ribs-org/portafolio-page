import { describe, expect, it } from 'vitest'
import { ATRIBUTOS_ERROR, validateAtributos } from './atributos'

describe('validateAtributos', () => {
  it('acepta un objeto plano de escalares y lo devuelve tal cual', () => {
    const atributos = { hook: 'pregunta-polemica', tema: 'negocios', serie: 'mut', episodio: 4, activo: true }
    expect(validateAtributos(atributos)).toEqual({ atributos })
  })

  it('ausente o null es sin atributos, no un error', () => {
    expect(validateAtributos(undefined)).toEqual({ atributos: null })
    expect(validateAtributos(null)).toEqual({ atributos: null })
  })

  it('rechaza lo que no es objeto plano: arrays, strings, anidados', () => {
    expect(validateAtributos(['hook'])).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos('hook: pregunta')).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ hook: { tipo: 'pregunta' } })).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ lista: ['a'] })).toEqual({ error: ATRIBUTOS_ERROR })
  })

  it('rechaza los excesos: más de 20 claves o más de 2000 caracteres', () => {
    const muchas = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']))
    expect(validateAtributos(muchas)).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ nota: 'x'.repeat(2000) })).toEqual({ error: ATRIBUTOS_ERROR })
  })

  it('el objeto vacío vale como sin atributos', () => {
    expect(validateAtributos({})).toEqual({ atributos: null })
  })
})
