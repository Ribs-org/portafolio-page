import { beforeAll, describe, expect, it } from 'vitest'
import { firmarSesion, leerSesion } from './sesion-token'
import { signOAuthState } from './social/oauth-state'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-largo-largo'
})

describe('sesión', () => {
  it('firma y lee sub, rol y sv', async () => {
    const t = await firmarSesion({ sub: 'u1', rol: 'admin', sv: 3 })
    expect(await leerSesion(t)).toEqual({ sub: 'u1', rol: 'admin', sv: 3 })
  })

  it('rechaza basura y tokens de otro propósito', async () => {
    expect(await leerSesion('')).toBeNull()
    expect(await leerSesion('no.es.jwt')).toBeNull()
    // El state de OAuth viaja por la URL de instagram.com: jamás debe valer como sesión.
    expect(await leerSesion(await signOAuthState('instagram'))).toBeNull()
  })
})
