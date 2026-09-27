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
 * después de que ya se leyeron algunos chunks, o la conexión puede cortarse sola. Y
 * devuelve `null` si el cuerpo está vacío, con o sin `body` (un 2xx sin contenido, o un
 * stream que se cierra sin haber entregado nada): un PDF de 0 bytes no es un documento
 * válido.
 */
async function leerConTope(response: Response, tope: number, url: string): Promise<Blob | null> {
  const cuerpo = response.body
  // Un 2xx sin cuerpo (p. ej. un 204, o un origen que declara `content-type:
  // application/pdf` sin escribir nada) no es un PDF de 0 bytes válido: antes de este
  // arreglo salía `ok: true` con un Blob vacío, y el comentarista recibía el enlace a un
  // PDF de 0 bytes. La validación ocurre al programar, no al enviar — así que se
  // rechaza acá, no cuando alguien comente la palabra.
  if (!cuerpo) {
    console.error('El documento: la respuesta no tiene cuerpo (2xx vacío):', url.slice(0, 200))
    return null
  }
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
      // A diferencia del `catch` de arriba, acá el stream normalmente sigue "readable"
      // — cancelamos nosotros, no algo que ya lo rompió. Pero puede que no: la señal de
      // tiempo compartida de `descargarSeguro` puede vencer justo entre el último
      // `read()` y este `cancel()`, dejando el stream "errored" antes de que lleguemos
      // acá. `cancel()` sobre un stream así devuelve la promesa rechazada con ese mismo
      // error (misma semántica que el comentario de arriba) — el `.catch` es lo que
      // sostiene que esta función nunca lanza.
      await lector.cancel().catch(() => {})
      return null
    }
    partes.push(Buffer.from(value))
  }
  if (total === 0) {
    console.error('El documento: la respuesta llegó vacía:', url.slice(0, 200))
    return null
  }
  // El tipo de lib.dom (`BlobPart`) exige un `ArrayBuffer`, no el `ArrayBufferLike` con
  // el que TS tipa genéricamente un `Buffer`/`Uint8Array`; en tiempo de ejecución estos
  // siempre son `ArrayBuffer` (los creó `Buffer.from`, nunca un `SharedArrayBuffer`).
  return new Blob(partes as BlobPart[])
}

/** Los cinco primeros bytes de un PDF real, sea cual sea su versión declarada. */
const CABECERA_PDF = '%PDF-'

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
  const blob = await leerConTope(response, MAX_DOCUMENTO_BYTES, url)
  if (!blob) {
    // El motivo específico (cuerpo vacío, corte a mitad, tope superado por streaming)
    // ya quedó registrado dentro de `leerConTope`; este solo dice que la fila se rechaza.
    console.error('El documento: se rechazó el cuerpo descargado:', url.slice(0, 200))
    return null
  }
  // El `content-type` es la cabecera que manda un tercero, y miente: la spec dice que
  // atrapa la página intermedia de Drive, pero esa página también podría venir marcada
  // `application/pdf` a mano. Los cinco primeros bytes son el propio archivo, no lo que
  // alguien declaró sobre él — por eso se comprueban antes de guardar, no en vez del
  // content-type de arriba (que sigue rechazando de una vez lo que ni se anuncia PDF).
  const cabecera = Buffer.from(await blob.slice(0, CABECERA_PDF.length).arrayBuffer()).toString('latin1')
  if (cabecera !== CABECERA_PDF) {
    console.error('El documento no empieza con la cabecera de un PDF:', url.slice(0, 200))
    return null
  }
  try {
    return await guardar(`reglas/${randomUUID()}.pdf`, blob, TIPO)
  } catch (error) {
    console.error('El documento: no se pudo guardar en el almacén:', String(error).slice(0, 200))
    return null
  }
}
