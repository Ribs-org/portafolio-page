import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { leerTokenMovil, mintMobileToken } from './mobile-token'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
  delete process.env.MOBILE_TOKEN_VERSION
})

describe('mobile-token', () => {
  it('un token recién emitido devuelve su sujeto y su versión de sesión', async () => {
    expect(await leerTokenMovil(await mintMobileToken({ sub: 'u1', sv: 2 }))).toEqual({ sub: 'u1', sv: 2 })
  })

  it('basura, vacío y recortado no valen', async () => {
    expect(await leerTokenMovil('')).toBeNull()
    expect(await leerTokenMovil('no-es-un-jwt')).toBeNull()
    const real = await mintMobileToken({ sub: 'u1', sv: 1 })
    expect(await leerTokenMovil(real.slice(0, -3))).toBeNull()
  })

  it('subir la versión revoca los tokens ya emitidos', async () => {
    const antiguo = await mintMobileToken({ sub: 'u1', sv: 1 })
    process.env.MOBILE_TOKEN_VERSION = '2'
    expect(await leerTokenMovil(antiguo)).toBeNull()
    expect(await leerTokenMovil(await mintMobileToken({ sub: 'u1', sv: 1 }))).toEqual({ sub: 'u1', sv: 1 })
    delete process.env.MOBILE_TOKEN_VERSION
  })

  it('un token firmado con AUTH_SECRET pelado no vale: la llave se deriva', async () => {
    const impostor = await new SignJWT({ purpose: 'mobile', v: '1', sv: 1 })
      .setSubject('u1')
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))
    expect(await leerTokenMovil(impostor)).toBeNull()
  })

  it('un token de otro propósito o sin sujeto no vale aunque la firma calce', async () => {
    const { hkdfSync } = await import('node:crypto')
    const key = new Uint8Array(
      hkdfSync('sha256', process.env.AUTH_SECRET!, 'portafolio-mobile-v1', 'token', 32),
    )
    const otro = await new SignJWT({ purpose: 'social-oauth-state', v: '1', sv: 1 })
      .setSubject('u1')
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key)
    expect(await leerTokenMovil(otro)).toBeNull()
    // El token viejo de la app: propósito y versión correctos, pero sin sujeto.
    const viejo = await new SignJWT({ purpose: 'mobile', v: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key)
    expect(await leerTokenMovil(viejo)).toBeNull()
  })
})
