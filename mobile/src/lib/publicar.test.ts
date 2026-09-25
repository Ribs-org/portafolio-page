import { describe, expect, it } from 'vitest'

import {
  ARCHIVO_MUY_GRANDE,
  ENVIO_INICIAL,
  MAX_BYTES,
  SIN_SENAL_SUBIDA,
  TIPO_NO_PUBLICABLE,
  describirArchivo,
  etiquetaCuenta,
  etiquetaEnvio,
  proximaHoraEnPunto,
  puedeEnviar,
  reducirEnvio,
  textoConfirmacion,
  vieneMarcada,
  type Envio,
} from './publicar'
import type { CuentaApp } from './tipos'

describe('describirArchivo', () => {
  it('toma el tipo que entrega el selector', () => {
    expect(
      describirArchivo({ uri: 'content://media/1', fileName: 'VID_1.mp4', mimeType: 'video/mp4', fileSize: 500 }),
    ).toEqual({ uri: 'content://media/1', nombre: 'VID_1.mp4', tipo: 'video/mp4', bytes: 500, mediaType: 'video' })
  })

  it('sin mimeType, lo deduce de la extensión con la misma tabla del sitio', () => {
    expect(describirArchivo({ uri: 'file:///a/clip.MOV', fileName: 'clip.MOV', fileSize: 1 })).toMatchObject({
      tipo: 'video/quicktime',
      mediaType: 'video',
    })
    expect(describirArchivo({ uri: 'file:///a/f.jpg', fileName: 'f.jpg', fileSize: 1 })).toMatchObject({
      tipo: 'image/jpeg',
      mediaType: 'image',
    })
  })

  it('sin nombre, usa el último segmento de la uri', () => {
    expect(describirArchivo({ uri: 'file:///cache/foto.png', mimeType: 'image/png', fileSize: 1 })).toMatchObject({
      nombre: 'foto.png',
    })
  })

  it('con fileName vacío, también cae al último segmento de la uri', () => {
    expect(
      describirArchivo({ uri: 'file:///cache/foto.png', fileName: '', mimeType: 'image/png', fileSize: 1 }),
    ).toMatchObject({ nombre: 'foto.png' })
  })

  it('rechaza lo que no es imagen ni video, y lo que no tiene ni tipo ni extensión', () => {
    expect(describirArchivo({ uri: 'file:///a/doc.pdf', fileName: 'doc.pdf', mimeType: 'application/pdf', fileSize: 1 })).toEqual({
      error: TIPO_NO_PUBLICABLE,
    })
    expect(describirArchivo({ uri: 'content://media/9', fileSize: 1 })).toEqual({ error: TIPO_NO_PUBLICABLE })
  })

  it('rechaza más de 500 MB antes de pedir una URL que el servidor va a negar', () => {
    expect(describirArchivo({ uri: 'file:///v.mp4', mimeType: 'video/mp4', fileSize: MAX_BYTES + 1 })).toEqual({
      error: ARCHIVO_MUY_GRANDE,
    })
  })

  it('un tamaño desconocido no bloquea: el servidor es la puerta', () => {
    expect(describirArchivo({ uri: 'file:///v.mp4', mimeType: 'video/mp4' })).toMatchObject({ bytes: 0 })
  })
})

describe('reducirEnvio', () => {
  it('recorre el camino feliz', () => {
    let e: Envio = ENVIO_INICIAL
    e = reducirEnvio(e, { tipo: 'chequear' })
    expect(e).toEqual({ paso: 'chequeando' })
    e = reducirEnvio(e, { tipo: 'subir', indice: 0, total: 2 })
    expect(e).toEqual({ paso: 'subiendo', indice: 0, total: 2, progreso: 0 })
    e = reducirEnvio(e, { tipo: 'progreso', progreso: 0.5 })
    expect(e).toEqual({ paso: 'subiendo', indice: 0, total: 2, progreso: 0.5 })
    e = reducirEnvio(e, { tipo: 'subir', indice: 1, total: 2 })
    e = reducirEnvio(e, { tipo: 'crear' })
    expect(e).toEqual({ paso: 'creando' })
    e = reducirEnvio(e, { tipo: 'hecho' })
    expect(e).toEqual({ paso: 'hecho' })
  })

  it('el progreso se acota a [0, 1] y solo cuenta mientras sube', () => {
    const subiendo: Envio = { paso: 'subiendo', indice: 0, total: 1, progreso: 0 }
    expect(reducirEnvio(subiendo, { tipo: 'progreso', progreso: 1.7 })).toMatchObject({ progreso: 1 })
    expect(reducirEnvio(subiendo, { tipo: 'progreso', progreso: -1 })).toMatchObject({ progreso: 0 })
    expect(reducirEnvio({ paso: 'creando' }, { tipo: 'progreso', progreso: 0.5 })).toEqual({ paso: 'creando' })
  })

  it('un rechazo del servidor vuelve a listo con la frase: hay algo que cambiar', () => {
    expect(reducirEnvio({ paso: 'chequeando' }, { tipo: 'rechazado', mensaje: 'X recibe hasta cuatro imágenes.' })).toEqual({
      paso: 'listo',
      error: 'X recibe hasta cuatro imágenes.',
    })
  })

  it('un fallo de red guarda desde dónde retomar, y reintentar vuelve exactamente ahí', () => {
    const retomar = { paso: 'subiendo', indice: 1, total: 3, progreso: 0 } as const
    const caido = reducirEnvio(
      { paso: 'subiendo', indice: 1, total: 3, progreso: 0.4 },
      { tipo: 'fallo', mensaje: SIN_SENAL_SUBIDA, retomar },
    )
    expect(caido).toEqual({ paso: 'error', mensaje: SIN_SENAL_SUBIDA, retomar })
    expect(reducirEnvio(caido, { tipo: 'reintentar' })).toEqual(retomar)
  })

  it('reintentar fuera de un error no hace nada', () => {
    expect(reducirEnvio({ paso: 'creando' }, { tipo: 'reintentar' })).toEqual({ paso: 'creando' })
  })

  it('cancelar vuelve a listo sin error', () => {
    expect(reducirEnvio({ paso: 'subiendo', indice: 0, total: 1, progreso: 0.3 }, { tipo: 'cancelar' })).toEqual(ENVIO_INICIAL)
  })
})

describe('etiquetaEnvio', () => {
  it('dice en qué va, en español, con el archivo y el porcentaje', () => {
    expect(etiquetaEnvio({ paso: 'listo', error: null })).toBeNull()
    expect(etiquetaEnvio({ paso: 'chequeando' })).toBe('Comprobando…')
    expect(etiquetaEnvio({ paso: 'subiendo', indice: 1, total: 3, progreso: 0.456 })).toBe('Subiendo 2 de 3 · 46 %')
    expect(etiquetaEnvio({ paso: 'creando' })).toBe('Guardando…')
    expect(etiquetaEnvio({ paso: 'hecho' })).toBe('Listo')
    expect(etiquetaEnvio({ paso: 'error', mensaje: 'x', retomar: { paso: 'creando' } })).toBeNull()
  })
})

function cuenta(red: string, handle: string | null): CuentaApp {
  return { id: `${red}-1`, red, handle, conectada: true }
}

describe('textoConfirmacion', () => {
  it('nombra los handles con «y» al final y avisa el plazo', () => {
    expect(textoConfirmacion([cuenta('instagram', '@mi_ig')])).toBe(
      '¿Publicar ahora en @mi_ig? Saldrá en los próximos 5 minutos.',
    )
    expect(textoConfirmacion([cuenta('instagram', '@mi_ig'), cuenta('youtube', '@mi_canal')])).toBe(
      '¿Publicar ahora en @mi_ig y @mi_canal? Saldrá en los próximos 5 minutos.',
    )
    expect(
      textoConfirmacion([cuenta('instagram', '@mi_ig'), cuenta('facebook', '@mi_fb'), cuenta('x', '@mi_x')]),
    ).toBe('¿Publicar ahora en @mi_ig, @mi_fb y @mi_x? Saldrá en los próximos 5 minutos.')
  })

  it('sin handle, cae al nombre de la red', () => {
    expect(textoConfirmacion([cuenta('youtube', null)])).toBe(
      '¿Publicar ahora en YouTube? Saldrá en los próximos 5 minutos.',
    )
  })
})

describe('vieneMarcada', () => {
  it('con una sola cuenta conectada, viene marcada', () => {
    const sola = cuenta('instagram', '@mi_ig')
    expect(vieneMarcada(sola, [sola])).toBe(true)
  })

  it('con dos cuentas conectadas, no viene ninguna', () => {
    const a = cuenta('instagram', '@mi_ig')
    const b = cuenta('facebook', '@mi_fb')
    expect(vieneMarcada(a, [a, b])).toBe(false)
    expect(vieneMarcada(b, [a, b])).toBe(false)
  })

  it('una desconectada no cuenta para decidir ni viene marcada', () => {
    const viva = cuenta('instagram', '@mi_ig')
    const muerta = { ...cuenta('facebook', '@mi_fb'), conectada: false }
    expect(vieneMarcada(viva, [viva, muerta])).toBe(true)
    expect(vieneMarcada(muerta, [viva, muerta])).toBe(false)
  })
})

describe('etiquetaCuenta', () => {
  it('junta el nombre de la red y el handle', () => {
    expect(etiquetaCuenta(cuenta('instagram', '@mi_ig'))).toBe('Instagram · @mi_ig')
  })

  it('sin handle, dice «sin nombre»', () => {
    expect(etiquetaCuenta(cuenta('facebook', null))).toBe('Facebook · sin nombre')
  })

  it('una red sin nombre conocido usa el código tal cual', () => {
    expect(etiquetaCuenta(cuenta('mastodon', '@yo'))).toBe('mastodon · @yo')
  })
})

describe('proximaHoraEnPunto', () => {
  it('redondea hacia arriba a la hora siguiente', () => {
    expect(proximaHoraEnPunto(new Date(2026, 8, 9, 15, 20, 30))).toEqual(new Date(2026, 8, 9, 16, 0, 0, 0))
  })

  it('en punto exacto, igual salta a la siguiente: «la próxima» nunca es ahora mismo', () => {
    expect(proximaHoraEnPunto(new Date(2026, 8, 9, 15, 0, 0))).toEqual(new Date(2026, 8, 9, 16, 0, 0, 0))
  })
})

describe('puedeEnviar', () => {
  it('sin texto ni archivo, no envía aunque haya una cuenta elegida', () => {
    expect(puedeEnviar('', 0, 1)).toBe(false)
    expect(puedeEnviar('   ', 0, 1)).toBe(false)
  })

  it('con texto o archivo, pero sin ninguna cuenta elegida, tampoco envía', () => {
    expect(puedeEnviar('Hola', 0, 0)).toBe(false)
    expect(puedeEnviar('', 1, 0)).toBe(false)
  })

  it('con algo que mandar y al menos una cuenta, envía: el resto lo dice el servidor', () => {
    expect(puedeEnviar('Hola', 0, 1)).toBe(true)
    expect(puedeEnviar('', 1, 1)).toBe(true)
    expect(puedeEnviar('Hola', 0, 2)).toBe(true)
  })
})
