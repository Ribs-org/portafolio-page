import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from '../env'

const VERSION = 'v1'
const IV_BYTES = 12

/**
 * Derived rather than used raw: AUTH_SECRET also signs the admin session, and a key
 * reused across two purposes turns one leak into two.
 */
function key(): Buffer {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', secret, 'portafolio-social-v1', 'token', 32))
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.')
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, body] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('Unrecognised token payload')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  // GCM throws here when the ciphertext or tag was altered, which is the point.
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
