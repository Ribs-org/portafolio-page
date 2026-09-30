import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Se dobla solo el módulo que toca la base: lo que se prueba acá es la puerta —la firma,
// y el mapeo de cada resultado a su código—, no el borrado, que tiene su propio test.
const baja = vi.fn()
const borrado = vi.fn()
vi.mock('@/lib/social/meta-bajas', () => ({
  darDeBaja: (...args: unknown[]) => baja(...args),
  borrarDatosDe: (...args: unknown[]) => borrado(...args),
}))

const { POST: POST_baja } = await import('./baja/route')
const { POST: POST_borrado } = await import('./borrado/route')

const SECRETO = 'secreto-de-prueba'
const USUARIO = '10201234567890'

// El mismo `firmar()` de `meta-firma.test.ts`: la firma se construye acá para no depender
// de la implementación que se está probando.
const b64url = (s: string) => Buffer.from(s).toString('base64url')
function firmar(payload: object, secreto = SECRETO): string {
  const cuerpo = b64url(JSON.stringify(payload))
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url')
  return `${firma}.${cuerpo}`
}
// Recién emitido: las rutas llaman a `leerSignedRequest` con el reloj de verdad, y un
// `issued_at` fijo quedaría fuera de la ventana de 24 h al día siguiente de escribir esto.
const emitidoAhora = () => Math.floor(Date.now() / 1000)
const FIRMADO = firmar({ algorithm: 'HMAC-SHA256', user_id: USUARIO, issued_at: emitidoAhora() })

function peticion(ruta: string, signedRequest: string | null): Request {
  return new Request(`https://ejemplo.cl/api/social/meta/${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: signedRequest === null ? '' : new URLSearchParams({ signed_request: signedRequest }).toString(),
  })
}

beforeEach(() => {
  vi.stubEnv('INSTAGRAM_APP_SECRET', SECRETO)
  baja.mockReset()
  borrado.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/social/meta/baja', () => {
  it('sin signed_request, o con una firma que no calza, es 400 y no toca nada', async () => {
    expect((await POST_baja(peticion('baja', null))).status).toBe(400)
    expect((await POST_baja(peticion('baja', firmar({ algorithm: 'HMAC-SHA256', user_id: USUARIO, issued_at: 1 }, 'otro')))).status).toBe(400)
    expect(baja).not.toHaveBeenCalled()
  })

  it('sin el secreto configurado la ruta queda cerrada, aunque la firma venga bien', async () => {
    vi.stubEnv('INSTAGRAM_APP_SECRET', '')
    expect((await POST_baja(peticion('baja', FIRMADO))).status).toBe(400)
    expect(baja).not.toHaveBeenCalled()
  })

  it('con la firma correcta da de baja ese id de usuario y responde 200', async () => {
    baja.mockResolvedValueOnce(2)
    const r = await POST_baja(peticion('baja', FIRMADO))
    expect(r.status).toBe(200)
    expect(baja).toHaveBeenCalledTimes(1)
    expect(baja).toHaveBeenCalledWith(USUARIO)
  })

  it('si la base falla es 500, para que Meta reintente', async () => {
    baja.mockRejectedValueOnce(new Error('sin base'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST_baja(peticion('baja', FIRMADO))).status).toBe(500)
    vi.restoreAllMocks()
  })
})

describe('POST /api/social/meta/borrado', () => {
  it('sin signed_request, o con una firma que no calza, es 400 y no toca nada', async () => {
    expect((await POST_borrado(peticion('borrado', null))).status).toBe(400)
    expect((await POST_borrado(peticion('borrado', `${FIRMADO}x`))).status).toBe(400)
    expect(borrado).not.toHaveBeenCalled()
  })

  it('sin el secreto configurado la ruta queda cerrada, aunque la firma venga bien', async () => {
    vi.stubEnv('INSTAGRAM_APP_SECRET', '')
    expect((await POST_borrado(peticion('borrado', FIRMADO))).status).toBe(400)
    expect(borrado).not.toHaveBeenCalled()
  })

  it('un cuerpo viejo, aunque bien firmado, es 400 y no borra nada', async () => {
    // El camino destructivo es el que hace falta cerrar: reenviar el mismo cuerpo
    // capturado volvería a borrar, y eso no se deshace. La ventana la impone
    // `leerSignedRequest`; acá se comprueba que la ruta la respeta con el reloj de verdad.
    const viejo = firmar({ algorithm: 'HMAC-SHA256', user_id: USUARIO, issued_at: emitidoAhora() - 48 * 3600 })
    expect((await POST_borrado(peticion('borrado', viejo))).status).toBe(400)
    expect(borrado).not.toHaveBeenCalled()
  })

  it('con la firma correcta borra y responde el código y la URL de estado', async () => {
    borrado.mockResolvedValueOnce({ codigo: 'abcdefghijklmnop', cuentas: 2 })
    const r = await POST_borrado(peticion('borrado', FIRMADO))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      url: 'https://ejemplo.cl/borrado/abcdefghijklmnop',
      confirmation_code: 'abcdefghijklmnop',
    })
    expect(borrado).toHaveBeenCalledTimes(1)
    expect(borrado).toHaveBeenCalledWith(USUARIO)
  })

  it('si la base falla es 500, para que Meta reintente', async () => {
    borrado.mockRejectedValueOnce(new Error('sin base'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST_borrado(peticion('borrado', FIRMADO))).status).toBe(500)
    vi.restoreAllMocks()
  })
})

describe('un cuerpo que no es formulario', () => {
  // Meta manda formulario; cualquier otra cosa es basura o un sondeo, y no merece un 500.
  const json = (ruta: string) =>
    new Request(`https://ejemplo.cl/api/social/meta/${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signed_request: FIRMADO }),
    })
  it('es 400 en las dos rutas, y no toca nada', async () => {
    expect((await POST_baja(json('baja'))).status).toBe(400)
    expect((await POST_borrado(json('borrado'))).status).toBe(400)
    expect(baja).not.toHaveBeenCalled()
    expect(borrado).not.toHaveBeenCalled()
  })
})
