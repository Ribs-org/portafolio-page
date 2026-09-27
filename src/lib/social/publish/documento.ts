import { randomUUID } from 'node:crypto'
import { guardar } from '@/lib/storage'
import { MAX_DOCUMENTO_BYTES } from '../comentarios/reglas'
import { descargarSeguro } from './descarga-segura'

const TIPO = 'application/pdf'

/**
 * Lee el cuerpo en streaming sin bufferear más que `tope` bytes: si el total supera el
 * tope antes de terminar, cancela la lectura y devuelve `null` sin haber acumulado el
 * resto. Es la comprobación que de verdad protege — `response.blob()` bufferea el
 * cuerpo entero antes de que cualquier chequeo sobre su tamaño pueda mirarlo, así que un
 * origen que sirve 500 MB los sirve igual aunque la fila termine rechazada; en una
 * función serverless eso es memoria contra el límite del proceso, no solo bytes de más
 * en el almacén.
 *
 * También devuelve `null`, sin lanzar, si `lector.read()` lanza a mitad del cuerpo: el
 * presupuesto de tiempo compartido de `descargarSeguro` puede vencer (`TimeoutError`)
 * después de que ya se leyeron algunos chunks, o la conexión puede cortarse sola.
 */
async function leerConTope(response: Response, tope: number): Promise<Blob | null> {
  const cuerpo = response.body
  if (!cuerpo) return new Blob([])
  const lector = cuerpo.getReader()
  const partes: Buffer[] = []
  let total = 0
  while (true) {
    let resultado: ReadableStreamReadResult<Uint8Array>
    try {
      resultado = await lector.read()
    } catch (error) {
      // No hace falta `lector.cancel()` acá: cuando `read()` lanza, el stream ya quedó
      // en estado "errored" por su cuenta (fue el timeout o el corte de red lo que lo
      // dejó así) y el socket ya se cerró como parte de ese error, no como consecuencia
      // de algo que hagamos después. Cancelar un stream ya "errored" solo repite la
      // misma excepción (WHATWG Streams: `ReadableStreamCancel` devuelve la promesa
      // rechazada con el mismo `storedError`), no libera nada nuevo.
      console.error('El documento: la descarga se cortó a mitad del cuerpo:', String(error).slice(0, 200))
      return null
    }
    const { done, value } = resultado
    if (done) break
    total += value.byteLength
    if (total > tope) {
      await lector.cancel()
      return null
    }
    partes.push(Buffer.from(value))
  }
  // El tipo de lib.dom (`BlobPart`) exige un `ArrayBuffer`, no el `ArrayBufferLike` con
  // el que TS tipa genéricamente un `Buffer`/`Uint8Array`; en tiempo de ejecución estos
  // siempre son `ArrayBuffer` (los creó `Buffer.from`, nunca un `SharedArrayBuffer`).
  return new Blob(partes as BlobPart[])
}

/**
 * El PDF de una regla, copiado a R2. Devuelve su URL pública, o `null` si no se pudo —
 * nunca lanza: una fila mala del lote se rechaza con su frase, no revienta el lote.
 *
 * Se copia en vez de enlazar la URL del que llama por dos razones: un enlace de Drive
 * sirve una página HTML, no el PDF; y entre programar y comentar pasan días, en los que
 * esa URL puede morir.
 */
export async function documentoToBlob(url: string): Promise<string | null> {
  // `descargarSeguro` es la comprobación de red interna compartida con `mediaToBlob`
  // (batch.ts): rechaza la URL antes de cada intento, incluida cada redirección.
  const response = await descargarSeguro(url, 'el documento')
  if (!response) return null
  // El content-type manda sobre la extensión: es lo que atrapa la página intermedia de
  // Drive, que llegaría como `text/html` con una URL que termina en .pdf.
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (contentType !== TIPO) {
    console.error('El documento no es un PDF:', contentType, url.slice(0, 200))
    return null
  }
  // Un `content-length` que ya declara de más ahorra abrir el streaming para nada, pero
  // no es la comprobación que protege: puede faltar (`Number(null) → 0`), venir `-1` o
  // `abc` (`NaN`, y `NaN > tope` es falso) o mentir hacia abajo — los cuatro pasan de
  // largo este chequeo. La que protege de verdad es `leerConTope`, más abajo, que corta
  // el streaming en cuanto se pasa del tope en vez de bufferear el cuerpo entero primero.
  const declarado = Number(response.headers.get('content-length') ?? '0')
  if (declarado > MAX_DOCUMENTO_BYTES) {
    console.error('El documento declara', declarado, 'bytes y el tope es', MAX_DOCUMENTO_BYTES)
    return null
  }
  const blob = await leerConTope(response, MAX_DOCUMENTO_BYTES)
  if (!blob) {
    console.error('El documento supera el tope de', MAX_DOCUMENTO_BYTES, 'bytes (streaming):', url.slice(0, 200))
    return null
  }
  try {
    return await guardar(`reglas/${randomUUID()}.pdf`, blob, TIPO)
  } catch (error) {
    console.error('El documento: no se pudo guardar en el almacén:', String(error).slice(0, 200))
    return null
  }
}
