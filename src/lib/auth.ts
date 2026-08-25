import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

const COOKIE_NAME = 'pf_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30
/** The claim that marks a token as a session cookie and nothing else. See `isAuthenticated`. */
const SESSION_ROLE = 'admin'

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

/** Constant-time compare so a wrong password cannot be found byte by byte. */
export function passwordMatches(candidate: string): boolean {
  const expected = env('ADMIN_PASSWORD')
  if (!expected) return false

  const a = new TextEncoder().encode(candidate)
  const b = new TextEncoder().encode(expected)
  // Length still leaks, but comparing padded buffers keeps content comparison flat.
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export async function createSession(): Promise<void> {
  const token = await new SignJWT({ role: SESSION_ROLE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/**
 * A valid signature is not enough. `AUTH_SECRET` also signs the short-lived OAuth
 * `state` token, which travels through a query string to instagram.com and lands in
 * browser history and their logs — so accepting any token this key verifies would make
 * that value a ten-minute admin session for whoever read it off a URL. Requiring the
 * `role` claim that only `createSession` mints is what keeps the two apart.
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload.role === SESSION_ROLE
  } catch {
    return false
  }
}

export { COOKIE_NAME }
