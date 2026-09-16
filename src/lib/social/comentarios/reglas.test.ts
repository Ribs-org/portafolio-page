import { describe, expect, it } from 'vitest'
import {
  REGLA_MENSAJE,
  REGLA_PALABRA,
  REGLA_RESPUESTA,
  RESPUESTA_PUBLICA_POR_DEFECTO,
  coincide,
  decidirAutomatica,
  enlaceMedible,
  normalizarPalabra,
  validarRegla,
} from './reglas'

describe('normalizarPalabra', () => {
  it('minúsculas, sin tildes, sin espacios alrededor', () => {
    expect(normalizarPalabra('  GUÍA ')).toBe('guia')
    expect(normalizarPalabra('Guía2')).toBe('guia2')
  })

  it('rechaza vacío, espacios internos, símbolos y más de 30', () => {
    expect(normalizarPalabra('')).toBeNull()
    expect(normalizarPalabra('   ')).toBeNull()
    expect(normalizarPalabra('dos palabras')).toBeNull()
    expect(normalizarPalabra('#guia')).toBeNull()
    expect(normalizarPalabra('a'.repeat(31))).toBeNull()
    expect(normalizarPalabra('a'.repeat(30))).toBe('a'.repeat(30))
  })
})

describe('coincide', () => {
  it('palabra completa, sin importar mayúsculas, tildes ni signos alrededor', () => {
    expect(coincide('GUÍA', 'guia')).toBe(true)
    expect(coincide('quiero la guía!!', 'guia')).toBe(true)
    expect(coincide('#guia por favor', 'guia')).toBe(true)
    expect(coincide('Guia 🙏', 'guia')).toBe(true)
  })

  it('no dispara dentro de otra palabra ni con texto vacío', () => {
    expect(coincide('me gusta guiar', 'guia')).toBe(false)
    expect(coincide('guias', 'guia')).toBe(false)
    expect(coincide('', 'guia')).toBe(false)
  })
})

describe('enlaceMedible', () => {
  const host = 'www.vicente-pareja.cl'

  it('etiqueta el primer enlace propio, con ? o con &', () => {
    expect(enlaceMedible('Acá está: https://www.vicente-pareja.cl/guia', 'guia', host)).toBe(
      'Acá está: https://www.vicente-pareja.cl/guia?s=dm-guia',
    )
    expect(enlaceMedible('https://www.vicente-pareja.cl/?x=1 y más', 'guia', host)).toBe(
      'https://www.vicente-pareja.cl/?x=1&s=dm-guia y más',
    )
  })

  it('deja igual los enlaces externos, el texto sin enlace, y todo si no hay host', () => {
    expect(enlaceMedible('mira https://notion.so/algo', 'guia', host)).toBe('mira https://notion.so/algo')
    expect(enlaceMedible('sin enlace', 'guia', host)).toBe('sin enlace')
    expect(enlaceMedible('https://www.vicente-pareja.cl/guia', 'guia', null)).toBe('https://www.vicente-pareja.cl/guia')
  })

  it('el host se compara sin www y sin distinguir mayúsculas', () => {
    expect(enlaceMedible('https://vicente-pareja.cl/guia', 'guia', 'WWW.vicente-pareja.cl')).toBe(
      'https://vicente-pareja.cl/guia?s=dm-guia',
    )
  })
})

describe('validarRegla', () => {
  it('sin palabra ni mensaje no hay regla', () => {
    expect(validarRegla(undefined)).toEqual({ regla: null })
    expect(validarRegla(null)).toEqual({ regla: null })
    expect(validarRegla({ palabra: '', mensaje: '' })).toEqual({ regla: null })
    expect(validarRegla({ palabra: '  ', mensaje: '  ', respuestaPublica: 'x' })).toEqual({ regla: null })
  })

  it('normaliza la palabra y pone la respuesta por defecto', () => {
    expect(validarRegla({ palabra: 'GUÍA', mensaje: 'Toma: https://x.cl' })).toEqual({
      regla: { palabra: 'guia', mensaje: 'Toma: https://x.cl', respuestaPublica: RESPUESTA_PUBLICA_POR_DEFECTO },
    })
    expect(validarRegla({ palabra: 'guia', mensaje: 'm', respuestaPublica: ' Listo 📩 ' })).toEqual({
      regla: { palabra: 'guia', mensaje: 'm', respuestaPublica: 'Listo 📩' },
    })
  })

  it('cada campo tiene su frase', () => {
    expect(validarRegla({ palabra: 'dos palabras', mensaje: 'm' })).toEqual({ error: REGLA_PALABRA })
    expect(validarRegla({ palabra: 'guia' })).toEqual({ error: REGLA_MENSAJE })
    expect(validarRegla({ palabra: 'guia', mensaje: 'x'.repeat(1001) })).toEqual({ error: REGLA_MENSAJE })
    expect(validarRegla({ palabra: 'guia', mensaje: 'm', respuestaPublica: 'x'.repeat(301) })).toEqual({ error: REGLA_RESPUESTA })
    expect(validarRegla({ mensaje: 'sin palabra' })).toEqual({ error: REGLA_PALABRA })
    expect(validarRegla('guia')).toEqual({ error: REGLA_PALABRA })
  })
})

describe('decidirAutomatica', () => {
  const now = new Date('2026-09-16T12:00:00Z')
  const regla = { palabra: 'guia', mensaje: 'Toma: https://www.vicente-pareja.cl/guia', respuestaPublica: 'Te lo mandé 📩' }
  const base = {
    texto: 'GUÍA porfa',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-16T11:00:00Z'),
    now,
    privadoEncendido: true,
    regla,
    sitioHost: 'www.vicente-pareja.cl',
  }
  const conEnlace = 'Toma: https://www.vicente-pareja.cl/guia?s=dm-guia'

  it('coincide y hay privado: respuesta corta en público, mensaje medible en privado', () => {
    expect(decidirAutomatica(base)).toEqual({ accion: 'responder', publico: 'Te lo mandé 📩', privado: conEnlace })
  })

  it('no coincide o es del dueño: ignorar', () => {
    expect(decidirAutomatica({ ...base, texto: 'qué buen video' })).toEqual({ accion: 'ignorar' })
    expect(decidirAutomatica({ ...base, esPropio: true })).toEqual({ accion: 'ignorar' })
  })

  it('segundo comentario del mismo autor: solo la respuesta pública', () => {
    expect(decidirAutomatica({ ...base, yaRecibioPrivado: true })).toEqual({
      accion: 'responder',
      publico: 'Te lo mandé 📩',
      privado: null,
    })
  })

  it('sin privado posible, el mensaje con enlace va en público', () => {
    const publicoConEnlace = { accion: 'responder', publico: conEnlace, privado: null }
    expect(decidirAutomatica({ ...base, privadoEncendido: false })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, network: 'tiktok' })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, network: 'youtube' })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, publishedAt: new Date('2026-09-08T11:00:00Z') })).toEqual(publicoConEnlace)
  })
})
