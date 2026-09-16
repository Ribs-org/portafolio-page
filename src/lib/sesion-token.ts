// El JWT de la cookie de sesión. Clave derivada de AUTH_SECRET con un `info` propio: el
// mismo secreto firma el `state` de OAuth y cifra los tokens sociales, y las tres cosas
// deben ser indistinguibles de basura entre sí.
import { hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Rol } from '@/db/schema'
import { ROLES } from '@/db/schema'
import { env } from './env'

const PURPOSE = 'session'
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type SesionClaims = { sub: string; rol: Rol; sv: number }

function key(): Uint8Array {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new Uint8Array(hkdfSync('sha256', secret, 'parrilla-session-v1', 'session', 32))
}

export function firmarSesion(claims: SesionClaims): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, rol: claims.rol, sv: claims.sv })
    .setSubject(claims.sub)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key())
}

/** Null ante cualquier duda: firma ajena, propósito ajeno, claims que no son lo que dicen. */
export async function leerSesion(token: string): Promise<SesionClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    if (payload.purpose !== PURPOSE || typeof payload.sub !== 'string') return null
    if (!(ROLES as readonly unknown[]).includes(payload.rol)) return null
    if (typeof payload.sv !== 'number') return null
    return { sub: payload.sub, rol: payload.rol as Rol, sv: payload.sv }
  } catch {
    return null
  }
}
