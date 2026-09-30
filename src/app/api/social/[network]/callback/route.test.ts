import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `route.ts` llega a `@/lib/auth` y de ahí a módulos con `server-only`, que no resuelve
// bajo Vitest. Mismo motivo y mismo arreglo que `mobile/overview/route.test.ts`.
vi.mock('server-only', () => ({}))

const { fetchCredential } = await import('./route')

/**
 * Las respuestas del Graph que un login de Instagram recorre, en orden: token corto,
 * token largo, páginas con su cuenta de Instagram, y `/me` — que es el que esta prueba
 * hace fallar o responder.
 */
function respuestasDeInstagram(me: { ok: boolean; body?: unknown }): Response[] {
  return [
    Response.json({ access_token: 'CORTO' }),
    Response.json({ access_token: 'LARGO', expires_in: 5184000 }),
    Response.json({
      data: [{ name: 'Ribs', instagram_business_account: { id: '17841400000000001', username: 'ribs' } }],
    }),
    me.ok ? Response.json(me.body) : new Response('nope', { status: 400 }),
  ]
}

/** Responde la cola en orden y deja a la vista las URL pedidas, en ese mismo orden. */
function doblarFetch(respuestas: Response[]): string[] {
  const cola = [...respuestas]
  const pedidas: string[] = []
  vi.stubGlobal('fetch', async (entrada: URL | string) => {
    pedidas.push(String(entrada))
    return cola.shift() ?? new Response('sin respuesta', { status: 500 })
  })
  return pedidas
}

beforeEach(() => {
  process.env.INSTAGRAM_APP_ID = 'app-id'
  process.env.INSTAGRAM_APP_SECRET = 'app-secret'
  // El fallo de `/me` se registra con console.error como el resto del archivo: acá solo
  // estorba la salida de la suite.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchCredential (Meta)', () => {
  it('trae el id de usuario de Meta que devolvió /me', async () => {
    const pedidas = doblarFetch(respuestasDeInstagram({ ok: true, body: { id: '10201234567890' } }))

    const credential = await fetchCredential('instagram', 'CODE', 'https://ejemplo.cl/cb')

    expect(credential.metaUserId).toBe('10201234567890')
    expect(credential.candidatas).toEqual([{ externalId: '17841400000000001', handle: '@ribs' }])
    // El id se pide con el token largo, que es el que se guarda.
    expect(pedidas[3]).toContain('/me?fields=id&access_token=LARGO')
  })

  it('si /me falla la conexión sigue, con el id vacío', async () => {
    doblarFetch(respuestasDeInstagram({ ok: false }))

    const credential = await fetchCredential('instagram', 'CODE', 'https://ejemplo.cl/cb')

    expect(credential.metaUserId).toBeUndefined()
    expect(credential.accessToken).toBe('LARGO')
    expect(credential.candidatas).toHaveLength(1)
  })
})
