import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cuánto vale un `signed_request` desde que Meta lo firmó, en segundos.
 *
 * Meta no manda nonce, así que sin esto el mismo cuerpo capturado sirve para siempre: una
 * baja es idempotente, pero un borrado reenviado meses después vuelve a borrar, y eso no
 * se deshace. La ventana es generosa —un día— porque nada obliga a Meta a entregar rápido
 * y un reintento suyo tiene que seguir valiendo; lo que cierra es el replay de un cuerpo
 * viejo, no el de un minuto.
 */
export const VENTANA_FIRMA_SEGUNDOS = 24 * 60 * 60

/**
 * El `signed_request` de Meta: `<firma>.<payload>`, los dos en base64url; el payload es
 * JSON con `algorithm`, `user_id` (el id de usuario de la app, no el de la página ni el
 * de Instagram) e `issued_at`. La firma es HMAC-SHA256 del payload con el app secret. Se
 * compara en tiempo constante y se rechaza todo lo que no calce, sin decir qué.
 *
 * `now` existe para el test; las rutas usan el default. La ventana se mira en valor
 * absoluto: un `issued_at` en el futuro es tan sospechoso como uno viejo, y tolerarlo
 * dejaría entrar un cuerpo fabricado para no caducar nunca.
 */
export function leerSignedRequest(
  raw: string,
  secret: string,
  now: number = Date.now(),
): { userId: string; issuedAt: number } | null {
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
  if (Math.abs(now / 1000 - payload.issued_at) > VENTANA_FIRMA_SEGUNDOS) return null
  return { userId: payload.user_id, issuedAt: payload.issued_at }
}
