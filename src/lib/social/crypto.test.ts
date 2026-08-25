import { beforeAll, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from './crypto'

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-do-not-use-in-production'
})

describe('token encryption', () => {
  it('devuelve el valor original', () => {
    const token = 'IGQVJYc0hBbUxxx-long-lived-token'
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it('produce un texto cifrado distinto cada vez', () => {
    expect(encryptToken('mismo')).not.toBe(encryptToken('mismo'))
  })

  it('rechaza un texto cifrado manipulado en vez de devolver basura', () => {
    const payload = encryptToken('token')
    const parts = payload.split('.')
    parts[3] = Buffer.from('otra-cosa').toString('base64url')
    expect(() => decryptToken(parts.join('.'))).toThrow()
  })

  it('rechaza un formato desconocido', () => {
    expect(() => decryptToken('no-es-un-payload')).toThrow()
  })
})
