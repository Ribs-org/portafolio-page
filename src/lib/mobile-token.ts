import { hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

/**
 * La credencial que la app Android guarda en el almacén de claves del teléfono.
 *
 * No expira: el dueño es el único usuario y pedirle la contraseña cada semana no
 * compra seguridad, el candado del dispositivo sí. Lo que sí existe es una forma de
 * revocarla — `MOBILE_TOKEN_VERSION` — porque un teléfono se pierde.
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

export function mintMobileToken(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, v: version() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(key())
}

/** Falso ante cualquier duda: firma ajena, propósito ajeno o versión revocada. */
export async function mobileTokenIsValid(token: string): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, key())
    return payload.purpose === PURPOSE && payload.v === version()
  } catch {
    return false
  }
}
