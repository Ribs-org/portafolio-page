import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { leerSignedRequest } from './meta-firma'

const SECRETO = 'secreto-de-prueba'
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
function firmar(payload: object, secreto = SECRETO): string {
  const cuerpo = b64url(JSON.stringify(payload))
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url')
  return `${firma}.${cuerpo}`
}
const PAYLOAD = { algorithm: 'HMAC-SHA256', user_id: '10201234567890', issued_at: 1790000000 }

describe('leerSignedRequest', () => {
  it('con la firma correcta devuelve el usuario y la fecha', () => {
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO)).toEqual({ userId: '10201234567890', issuedAt: 1790000000 })
  })
  it('rechaza otra firma, otro secreto, otro algoritmo, sin punto o sin user_id', () => {
    expect(leerSignedRequest(firmar(PAYLOAD, 'otro'), SECRETO)).toBeNull()
    const [firma, cuerpo] = firmar(PAYLOAD).split('.')
    expect(leerSignedRequest(`${firma}.${b64url(JSON.stringify({ ...PAYLOAD, user_id: 'x' }))}`, SECRETO)).toBeNull()
    expect(leerSignedRequest(`${firma}x.${cuerpo}`, SECRETO)).toBeNull()
    expect(leerSignedRequest(firmar({ ...PAYLOAD, algorithm: 'HMAC-SHA1' }), SECRETO)).toBeNull()
    expect(leerSignedRequest('sinpunto', SECRETO)).toBeNull()
    expect(leerSignedRequest(firmar({ algorithm: 'HMAC-SHA256', issued_at: 1 }), SECRETO)).toBeNull()
    expect(leerSignedRequest('', SECRETO)).toBeNull()
  })
})
