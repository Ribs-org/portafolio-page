import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { mintMobileToken, mobileTokenIsValid } from './mobile-token'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
  delete process.env.MOBILE_TOKEN_VERSION
})

describe('mobile-token', () => {
  it('un token recién emitido vale', async () => {
    expect(await mobileTokenIsValid(await mintMobileToken())).toBe(true)
  })

  it('basura, vacío y recortado no valen', async () => {
    expect(await mobileTokenIsValid('')).toBe(false)
    expect(await mobileTokenIsValid('no-es-un-jwt')).toBe(false)
    const real = await mintMobileToken()
    expect(await mobileTokenIsValid(real.slice(0, -3))).toBe(false)
  })

  it('subir la versión revoca los tokens ya emitidos', async () => {
    const antiguo = await mintMobileToken()
    process.env.MOBILE_TOKEN_VERSION = '2'
    expect(await mobileTokenIsValid(antiguo)).toBe(false)
    expect(await mobileTokenIsValid(await mintMobileToken())).toBe(true)
    delete process.env.MOBILE_TOKEN_VERSION
  })

  it('un token firmado con AUTH_SECRET pelado no vale: la llave se deriva', async () => {
    const impostor = await new SignJWT({ purpose: 'mobile', v: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))
    expect(await mobileTokenIsValid(impostor)).toBe(false)
  })

  it('un token de otro propósito no vale aunque la firma calce', async () => {
    // El mismo molde que separa el state de OAuth de la cookie de sesión.
    const { hkdfSync } = await import('node:crypto')
    const key = new Uint8Array(
      hkdfSync('sha256', process.env.AUTH_SECRET!, 'portafolio-mobile-v1', 'token', 32),
    )
    const otro = await new SignJWT({ purpose: 'social-oauth-state', v: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key)
    expect(await mobileTokenIsValid(otro)).toBe(false)
  })
})
