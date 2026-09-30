import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * El `signed_request` de Meta: `<firma>.<payload>`, los dos en base64url; el payload es
 * JSON con `algorithm`, `user_id` (el id de usuario de la app, no el de la página ni el
 * de Instagram) e `issued_at`. La firma es HMAC-SHA256 del payload con el app secret. Se
 * compara en tiempo constante y se rechaza todo lo que no calce, sin decir qué.
 */
export function leerSignedRequest(raw: string, secret: string): { userId: string; issuedAt: number } | null {
  const punto = raw.indexOf('.')
  if (punto <= 0) return null
  const firma = raw.slice(0, punto)
  const cuerpo = raw.slice(punto + 1)
  let esperada: Buffer
  let recibida: Buffer
  try {
    esperada = createHmac('sha256', secret).update(cuerpo).digest()
    recibida = Buffer.from(firma, 'base64url')
  } catch {
    return null
  }
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null
  let payload: { algorithm?: unknown; user_id?: unknown; issued_at?: unknown }
  try {
    payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (payload.algorithm !== 'HMAC-SHA256') return null
  if (typeof payload.user_id !== 'string' || payload.user_id === '') return null
  if (typeof payload.issued_at !== 'number') return null
  return { userId: payload.user_id, issuedAt: payload.issued_at }
}
