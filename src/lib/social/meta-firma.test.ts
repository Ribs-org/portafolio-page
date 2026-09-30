import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { leerSignedRequest, VENTANA_FIRMA_SEGUNDOS } from './meta-firma'

const SECRETO = 'secreto-de-prueba'
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
function firmar(payload: object, secreto = SECRETO): string {
  const cuerpo = b64url(JSON.stringify(payload))
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url')
  return `${firma}.${cuerpo}`
}
const EMITIDO = 1790000000
const PAYLOAD = { algorithm: 'HMAC-SHA256', user_id: '10201234567890', issued_at: EMITIDO }

// El reloj va fijo en todo el archivo: si dependiera de `Date.now()`, estos casos
// empezarían a fallar solos un día después de escribirlos.
const AHORA = EMITIDO * 1000

describe('leerSignedRequest', () => {
  it('con la firma correcta devuelve el usuario y la fecha', () => {
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO, AHORA)).toEqual({
      userId: '10201234567890',
      issuedAt: EMITIDO,
    })
  })
  it('rechaza otra firma, otro secreto, otro algoritmo, sin punto o sin user_id', () => {
    expect(leerSignedRequest(firmar(PAYLOAD, 'otro'), SECRETO, AHORA)).toBeNull()
    const [firma, cuerpo] = firmar(PAYLOAD).split('.')
    expect(leerSignedRequest(`${firma}.${b64url(JSON.stringify({ ...PAYLOAD, user_id: 'x' }))}`, SECRETO, AHORA)).toBeNull()
    expect(leerSignedRequest(`${firma}x.${cuerpo}`, SECRETO, AHORA)).toBeNull()
    expect(leerSignedRequest(firmar({ ...PAYLOAD, algorithm: 'HMAC-SHA1' }), SECRETO, AHORA)).toBeNull()
    expect(leerSignedRequest('sinpunto', SECRETO, AHORA)).toBeNull()
    expect(leerSignedRequest(firmar({ algorithm: 'HMAC-SHA256', issued_at: 1 }), SECRETO, AHORA)).toBeNull()
    expect(leerSignedRequest('', SECRETO, AHORA)).toBeNull()
  })

  it('acepta dentro de la ventana, por viejo y por nuevo', () => {
    const casi = (VENTANA_FIRMA_SEGUNDOS - 1) * 1000
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO, AHORA + casi)).not.toBeNull()
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO, AHORA - casi)).not.toBeNull()
  })

  it('rechaza un cuerpo viejo aunque la firma sea buena', () => {
    // El caso que importa: un `signed_request` capturado y reenviado meses después. La
    // firma sigue siendo válida —el secreto no cambió—, así que lo único que lo para es
    // la fecha. Reenviado, un borrado vuelve a borrar y eso no se deshace.
    const dosDias = 2 * 24 * 3600 * 1000
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO, AHORA + dosDias)).toBeNull()
  })

  it('rechaza un cuerpo fechado en el futuro', () => {
    // Tan sospechoso como uno viejo, y peor: un `issued_at` adelantado sería un cuerpo
    // que no caduca nunca.
    const dosDias = 2 * 24 * 3600 * 1000
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO, AHORA - dosDias)).toBeNull()
  })
})
