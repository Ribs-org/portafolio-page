import { hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

/**
 * La credencial que la app Android guarda en el almacén de claves del teléfono.
 *
 * No expira: pedirle la contraseña cada semana no compra seguridad, el candado
 * del dispositivo sí. Lo que sí existe es una forma de revocarla — `MOBILE_TOKEN_VERSION` —
 * porque un teléfono se pierde. El token lleva el sujeto (usuario) y su versión
 * de sesión, lo que permite revocar solo los tokens de una persona.
 *
 * La llave se deriva de `AUTH_SECRET` en vez de usarlo pelado, y esa distinción es
 * el punto: `AUTH_SECRET` también cifra los tokens de Instagram, Facebook y YouTube
 * guardados en la base (vía HKDF con otro `info`). Rotarlo para revocar un teléfono
 * dejaría esos tokens indescifrables y obligaría a reconectar las tres redes.
 * Derivando aparte, revocar cuesta subir un número.
 */
const PURPOSE = 'mobile'

function key(): Uint8Array {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new Uint8Array(hkdfSync('sha256', secret, 'portafolio-mobile-v1', 'token', 32))
}

function version(): string {
  return env('MOBILE_TOKEN_VERSION') ?? '1'
}

export function mintMobileToken(claims: { sub: string; sv: number }): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, v: version(), sv: claims.sv })
    .setSubject(claims.sub)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(key())
}

/** Null ante cualquier duda: firma ajena, propósito ajeno, versión revocada o sin sujeto. */
export async function leerTokenMovil(token: string): Promise<{ sub: string; sv: number } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    if (payload.purpose !== PURPOSE || payload.v !== version()) return null
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return null
    return { sub: payload.sub, sv: payload.sv }
  } catch {
    return null
  }
}
