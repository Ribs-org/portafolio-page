import { describe, expect, it } from 'vitest'
import {
  OPCIONES_ERROR,
  TIKTOK_PATROCINADO_PRIVADO,
  TIKTOK_SIN_PRIVACIDAD,
  opcionesDesdeFormulario,
  opcionesDesdeFormularioPorCuenta,
  resumenOpciones,
  validarOpciones,
  validarOpcionesPorCuenta,
  validarOpcionesPorRed,
} from './opciones'

const directo = {
  modo: 'directo',
  privacidad: 'SELF_ONLY',
  comentarios: true,
  duo: false,
  pegar: false,
  comercial: 'no',
}

describe('validarOpciones para tiktok', () => {
  it('acepta el modo directo completo', () => {
    expect(validarOpciones('tiktok', directo)).toEqual({ opciones: directo })
  })

  it('acepta el borrador y descarta lo demás', () => {
    expect(validarOpciones('tiktok', { modo: 'borrador', privacidad: 'SELF_ONLY', comentarios: true })).toEqual({
      opciones: { modo: 'borrador' },
    })
  })

  it('sin opciones: la frase apunta a la privacidad, que es lo que falta casi siempre', () => {
    expect(validarOpciones('tiktok', undefined)).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', null)).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('directo sin privacidad o con una desconocida', () => {
    expect(validarOpciones('tiktok', { ...directo, privacidad: undefined })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', { ...directo, privacidad: '' })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', { ...directo, privacidad: 'PRIVADO' })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('las casillas ausentes valen false', () => {
    expect(validarOpciones('tiktok', { modo: 'directo', privacidad: 'PUBLIC_TO_EVERYONE' })).toEqual({
      opciones: {
        modo: 'directo',
        privacidad: 'PUBLIC_TO_EVERYONE',
        comentarios: false,
        duo: false,
        pegar: false,
        comercial: 'no',
      },
    })
  })

  it('patrocinado no puede ser privado', () => {
    expect(validarOpciones('tiktok', { ...directo, comercial: 'patrocinado' })).toEqual({
      error: TIKTOK_PATROCINADO_PRIVADO,
    })
    expect(
      validarOpciones('tiktok', { ...directo, privacidad: 'FOLLOWER_OF_CREATOR', comercial: 'patrocinado' }),
    ).toEqual({
      opciones: { ...directo, privacidad: 'FOLLOWER_OF_CREATOR', comercial: 'patrocinado' },
    })
  })

  it('rechaza la forma que no entiende', () => {
    expect(validarOpciones('tiktok', 'directo')).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', ['directo'])).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { privacidad: 'SELF_ONLY' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { modo: 'programado' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { ...directo, comentarios: 'sí' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { ...directo, comercial: 'ads' })).toEqual({ error: OPCIONES_ERROR })
  })

  it('rechaza un objeto desmedido', () => {
    expect(validarOpciones('tiktok', { ...directo, relleno: 'x'.repeat(2000) })).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('validarOpciones para otras redes', () => {
  it('sin opciones es null; con opciones es error', () => {
    expect(validarOpciones('instagram', undefined)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', null)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', { modo: 'directo' })).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('validarOpcionesPorRed', () => {
  it('devuelve solo las redes con opciones', () => {
    expect(validarOpcionesPorRed(['instagram', 'tiktok'], { tiktok: directo })).toEqual({
      opciones: { tiktok: directo },
    })
    expect(validarOpcionesPorRed(['instagram'], {})).toEqual({ opciones: {} })
  })

  it('una red pedida sin sus opciones falla con su frase', () => {
    expect(validarOpcionesPorRed(['tiktok'], {})).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('ignora opciones de redes que no están en la fila', () => {
    expect(validarOpcionesPorRed(['instagram'], { tiktok: directo })).toEqual({ opciones: {} })
  })
})

describe('validarOpcionesPorCuenta', () => {
  // Dos cuentas con valores que se distinguen entre sí (una en borrador, otra directa
  // con una privacidad concreta) a propósito: si algún día se cruzaran las identidades
  // —que 'tt-1' terminara leyendo lo de 'tt-2' y viceversa— este test lo vería, porque
  // comprobar solo las claves no lo detectaría.
  it('valida las opciones de cada cuenta por separado, sin cruzar identidades', () => {
    const cuentas = [
      { id: 'tt-1', network: 'tiktok', handle: '@vicente' },
      { id: 'tt-2', network: 'tiktok', handle: '@vicenteclips' },
    ]
    const raw = {
      'tt-1': { modo: 'borrador' },
      'tt-2': {
        modo: 'directo',
        privacidad: 'PUBLIC_TO_EVERYONE',
        comentarios: true,
        duo: false,
        pegar: false,
        comercial: 'no',
      },
    }
    const check = validarOpcionesPorCuenta(cuentas, raw)
    expect('error' in check).toBe(false)
    if ('error' in check) return
    expect(check.opciones['tt-1']).toEqual({ modo: 'borrador' })
    expect(check.opciones['tt-2']).toEqual(raw['tt-2'])
  })

  // Simétrico con el test de `validarOpcionesPorRed` que hace lo mismo por red: una
  // clave sobrante en `raw` no es un error, es una decisión documentada.
  it('ignora las claves de raw que no corresponden a ninguna cuenta pedida', () => {
    const cuentas = [{ id: 'tt-1', network: 'tiktok', handle: '@vicente' }]
    const raw = { 'tt-1': { modo: 'borrador' }, 'tt-2': { modo: 'directo', privacidad: 'SELF_ONLY' } }
    expect(validarOpcionesPorCuenta(cuentas, raw)).toEqual({ opciones: { 'tt-1': { modo: 'borrador' } } })
  })

  it('una cuenta de TikTok sin privacidad falla nombrando su frase', () => {
    const cuentas = [{ id: 'tt-1', network: 'tiktok', handle: '@vicente' }]
    const check = validarOpcionesPorCuenta(cuentas, { 'tt-1': { modo: 'directo', privacidad: '' } })
    expect(check).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  // Cubre los dos lados: con dos cuentas de la misma red el error nombra la que falló
  // (arriba, «una cuenta de TikTok sin privacidad...», cubre el lado sin ambigüedad —una
  // sola cuenta de la red, la frase queda tal cual porque nombrarla sería ruido).
  it('con dos cuentas de la misma red, el error antepone el handle de la que falló', () => {
    const cuentas = [
      { id: 'tt-1', network: 'tiktok', handle: '@vicente' },
      { id: 'tt-2', network: 'tiktok', handle: '@vicenteclips' },
    ]
    const raw = { 'tt-1': { modo: 'directo', privacidad: '' }, 'tt-2': { modo: 'borrador' } }
    expect(validarOpcionesPorCuenta(cuentas, raw)).toEqual({ error: `«@vicente»: ${TIKTOK_SIN_PRIVACIDAD}` })
  })

  // Separa «dos cuentas en total» de «dos cuentas de la misma red»: aquí hay dos cuentas,
  // pero de redes distintas, así que TikTok sigue apareciendo una sola vez y la frase no
  // debe llevar prefijo. Si la condición contara el total en vez de contar por red, este
  // test lo delataría — es justo lo que separa las dos hipótesis.
  it('con dos cuentas de redes distintas, la que falla no lleva prefijo: su red no es ambigua', () => {
    const cuentas = [
      { id: 'ig-1', network: 'instagram', handle: '@insta' },
      { id: 'tt-1', network: 'tiktok', handle: '@vicente' },
    ]
    const raw = { 'tt-1': { modo: 'directo', privacidad: '' } }
    expect(validarOpcionesPorCuenta(cuentas, raw)).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })
})

describe('opcionesDesdeFormularioPorCuenta', () => {
  it('el formulario lee los campos con el sufijo de cada cuenta', () => {
    const fd = new FormData()
    fd.set('tiktokModo:tt-1', 'borrador')
    fd.set('tiktokModo:tt-2', 'directo')
    fd.set('tiktokPrivacidad:tt-2', 'SELF_ONLY')
    const cuentas = [
      { id: 'tt-1', network: 'tiktok', handle: '@a' },
      { id: 'tt-2', network: 'tiktok', handle: '@b' },
    ]
    const raw = opcionesDesdeFormularioPorCuenta(fd, cuentas)
    expect(raw['tt-1']).toEqual({ modo: 'borrador' })
    expect((raw['tt-2'] as Record<string, unknown>).privacidad).toBe('SELF_ONLY')
  })
})

describe('opcionesDesdeFormulario', () => {
  function form(entries: Record<string, string>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(entries)) fd.set(k, v)
    return fd
  }

  it('arma el objeto de tiktok desde los campos del compositor', () => {
    const fd = form({
      tiktokModo: 'directo',
      tiktokPrivacidad: 'SELF_ONLY',
      tiktokComentarios: 'on',
      tiktokComercial: 'marca_propia',
    })
    expect(opcionesDesdeFormulario(fd, ['tiktok'])).toEqual({
      tiktok: {
        modo: 'directo',
        privacidad: 'SELF_ONLY',
        comentarios: true,
        duo: false,
        pegar: false,
        comercial: 'marca_propia',
      },
    })
  })

  it('en borrador solo viaja el modo', () => {
    expect(opcionesDesdeFormulario(form({ tiktokModo: 'borrador', tiktokPrivacidad: 'SELF_ONLY' }), ['tiktok'])).toEqual({
      tiktok: { modo: 'borrador' },
    })
  })

  it('sin tiktok entre las redes no produce nada', () => {
    expect(opcionesDesdeFormulario(form({ tiktokModo: 'directo' }), ['instagram'])).toEqual({})
  })

  it('con tiktok y sin campos, la privacidad va vacía para que la validación hable', () => {
    expect(opcionesDesdeFormulario(form({}), ['tiktok'])).toEqual({
      tiktok: { modo: 'directo', privacidad: '', comentarios: false, duo: false, pegar: false, comercial: 'no' },
    })
  })
})

describe('resumenOpciones', () => {
  it('resume el directo y el borrador en una línea', () => {
    expect(resumenOpciones('tiktok', directo)).toBe('Directo · Solo yo · con comentarios · sin dúo · sin pegar · sin comercial')
    expect(
      resumenOpciones('tiktok', { ...directo, privacidad: 'PUBLIC_TO_EVERYONE', duo: true, comercial: 'patrocinado' }),
    ).toBe('Directo · Todos · con comentarios · con dúo · sin pegar · patrocinado')
    expect(resumenOpciones('tiktok', { modo: 'borrador' })).toBe('Borrador a tu bandeja de TikTok')
  })

  it('nada que resumir da null', () => {
    expect(resumenOpciones('tiktok', null)).toBeNull()
    expect(resumenOpciones('instagram', { modo: 'directo' })).toBeNull()
    expect(resumenOpciones('tiktok', 'basura')).toBeNull()
  })
})
