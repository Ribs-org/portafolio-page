import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  CUENTA_AJENA,
  CUENTA_DESCONECTADA,
  RED_AMBIGUA,
  CuentaInvalida,
  SinCuenta,
  decidirVerificacion,
  decidirCuentaUnica,
} = await import('./cuentas')

describe('los mensajes nombran lo que hay que arreglar', () => {
  it('una cuenta ajena no revela si existe', () => {
    // Mismo texto para «no es tuya» y «no existe»: distinguirlos dejaría averiguar
    // qué identificadores son reales probando de a uno.
    expect(CUENTA_AJENA).toMatch(/no es tuya/i)
  })

  it('una cuenta desconectada se nombra por su handle', () => {
    expect(CUENTA_DESCONECTADA('@vicente', 'instagram')).toContain('@vicente')
  })

  it('una cuenta desconectada sin handle cae en la red', () => {
    const frase = CUENTA_DESCONECTADA(null, 'instagram')
    expect(frase).toContain('instagram')
    // Sin este `.not`, una implementación que pegue siempre "La cuenta null (instagram)…"
    // pasaría igual: lo que prueba que el `??` sostiene algo es que "null" no aparezca.
    expect(frase).not.toContain('null')
  })

  it('una red ambigua lista las candidatas', () => {
    const frase = RED_AMBIGUA('instagram', ['@vicente', '@vicenteclips'])
    expect(frase).toContain('@vicente')
    expect(frase).toContain('@vicenteclips')
    expect(frase).toMatch(/2/)
  })

  it('una red ambigua cuenta las candidatas, no un número fijo', () => {
    // El caso de arriba solo prueba con dos: por sí solo, /2/ lo satisface cualquier
    // implementación que pegue "2" a fuego. Este caso, con tres, obliga a que el número
    // salga de `handles.length` y no de una constante.
    const frase = RED_AMBIGUA('instagram', ['@a', '@b', '@c'])
    expect(frase).toMatch(/\b3\b/)
    expect(frase).not.toMatch(/\b2\b/)
  })
})

describe('SinCuenta es una CuentaInvalida', () => {
  it('un solo instanceof CuentaInvalida cubre los dos motivos', () => {
    expect(new SinCuenta('instagram')).toBeInstanceOf(CuentaInvalida)
  })
})

describe('decidirVerificacion: la decisión de verificarCuentas, sin consultar', () => {
  const FILAS = [{ id: 'cuenta-1', network: 'instagram', handle: '@vicente', accessToken: 'token-cifrado' }]

  it('un identificador que no aparece entre las filas lanza CUENTA_AJENA', () => {
    expect(() => decidirVerificacion(['cuenta-fantasma'], FILAS)).toThrow(CUENTA_AJENA)
  })

  it('ajena (de otro dueño) e inexistente dan exactamente el mismo mensaje', () => {
    // Al nivel de la decisión pura, "es de otro dueño" y "no existe" son indistinguibles:
    // la consulta ya filtró por dueño, así que un id ausente de `filas` puede ser
    // cualquiera de las dos, y por diseño da el mismo mensaje en ambos casos.
    let mensajeInexistente = ''
    let mensajeAjena = ''
    try {
      decidirVerificacion(['cuenta-nunca-existio'], FILAS)
    } catch (e) {
      mensajeInexistente = (e as Error).message
    }
    try {
      decidirVerificacion(['cuenta-de-otro-dueno'], FILAS)
    } catch (e) {
      mensajeAjena = (e as Error).message
    }
    expect(mensajeInexistente).toBe(mensajeAjena)
    expect(mensajeInexistente).toBe(CUENTA_AJENA)
  })

  it('un token en cadena vacía se rechaza como desconectada', () => {
    const filas = [{ id: 'cuenta-1', network: 'instagram', handle: '@vicente', accessToken: '' }]
    expect(() => decidirVerificacion(['cuenta-1'], filas)).toThrow(CUENTA_DESCONECTADA('@vicente', 'instagram'))
  })

  it('con las filas correctas, devuelve las cuentas verificadas en el orden pedido, sin repetir', () => {
    const filas = [
      { id: 'cuenta-2', network: 'facebook', handle: '@vicente-fb', accessToken: 'tok-2' },
      { id: 'cuenta-1', network: 'instagram', handle: '@vicente', accessToken: 'tok-1' },
    ]
    expect(decidirVerificacion(['cuenta-1', 'cuenta-2', 'cuenta-1'], filas)).toEqual([
      { id: 'cuenta-1', network: 'instagram', handle: '@vicente' },
      { id: 'cuenta-2', network: 'facebook', handle: '@vicente-fb' },
    ])
  })
})

describe('decidirCuentaUnica: la decisión de cuentaUnicaPorRed, sin consultar', () => {
  it('con dos cuentas conectadas en una red, lanza en vez de elegir', () => {
    const filas = [
      { id: 'cuenta-1', network: 'instagram', handle: '@vicente' },
      { id: 'cuenta-2', network: 'instagram', handle: '@vicente-clips' },
    ]
    expect(() => decidirCuentaUnica(['instagram'], filas)).toThrow(
      RED_AMBIGUA('instagram', ['@vicente', '@vicente-clips']),
    )
  })

  it('con una sola cuenta en la red, la resuelve', () => {
    const filas = [{ id: 'cuenta-1', network: 'instagram', handle: '@vicente' }]
    expect(decidirCuentaUnica(['instagram'], filas)).toEqual(
      new Map([['instagram', { id: 'cuenta-1', network: 'instagram', handle: '@vicente' }]]),
    )
  })

  it('sin ninguna cuenta en la red, lanza SinCuenta', () => {
    expect(() => decidirCuentaUnica(['instagram'], [])).toThrow(SinCuenta)
  })
})
