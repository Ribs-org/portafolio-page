import { env } from '@/lib/env'
import { fromZonedInput } from '@/lib/utils'
import { extensionDe, validateScheduleDraft } from './validate'
import { validateAtributos } from './atributos'
import { validarOpcionesPorCuenta, OPCIONES_ERROR, type OpcionesDestino } from './opciones'
import { guardar } from '@/lib/storage'
import { getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets, reglasClave } from '@/db'
import { randomUUID } from 'node:crypto'
import { CuentaInvalida, cuentaUnicaPorRed, verificarCuentas, type CuentaDestino } from '../cuentas'
import { validarRegla } from '../comentarios/reglas'

// Same derivation as SITE_TIMEZONE in lib/analytics — duplicated here because that
// module is server-only and this one must stay importable by vitest.
const ZONE = env('SITE_TIMEZONE') ?? 'America/Santiago'

/**
 * Parse a fecha string (YYYY-MM-DD HH:MM format) to a Date in the site timezone.
 * Returns null if the date cannot be parsed.
 */
function parseFecha(fecha: string): Date | null {
  // fromZonedInput slices to 16 chars, which would silently discard a Z or seconds
  // an API caller sent — reinterpreting their UTC instant as site wall-clock time.
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(fecha.trim())) return null
  const isoDateTime = fecha.replace(' ', 'T')
  return fromZonedInput(isoDateTime, ZONE)
}

export type BatchItem = {
  fecha: string
  texto: string
  /** Identificadores de cuenta elegidos como destino. Si hay alguno, manda sobre `redes`. */
  cuentas: string[]
  redes: string[]
  media: string[]
  /** URL pública de imagen; vacía o ausente = sin portada. Solo válida con video. */
  portada?: string
  /** JSON plano libre del editor-LLM; se valida con validateAtributos. */
  atributos?: unknown
  /**
   * Lo que cada destino exige elegir, llaveado por clave: `{ "<clave>": { … } }`. Cada
   * clave se busca primero entre los identificadores de cuenta de los destinos de la
   * fila; si no coincide con ninguno se acepta como nombre de red y se resuelve a su
   * destino solo si la fila tiene exactamente uno. Se valida con validarOpcionesPorCuenta.
   */
  opciones?: unknown
  /** { palabra, mensaje, respuestaPublica? }; se valida con validarRegla. */
  regla?: unknown
}

export type BatchResult =
  | { index: number; ok: true; postId: string }
  | { index: number; ok: false; error: string }

export const MAX_BATCH_ITEMS = 50

export const PORTADA_NEEDS_VIDEO = 'La portada requiere un video en media.'
export const PORTADA_NOT_IMAGE = 'La portada debe ser una imagen.'
export const PORTADA_FORMAT = 'La portada debe ser JPG o PNG.'

// The six networks with a publisher.
// Twin of ENABLED in the composer (schedule/composer.tsx) — update both together.
export const PUBLISHABLE = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])
// Graph puede rechazar un thumb gif/webp, y como en FB/IG la portada viaja en el POST
// del video, un formato indigesto tumba el video entero tras los 3 reintentos.
const COVER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png'])

function extensionFromUrl(url: string): string {
  const path = url.split('?')[0] ?? ''
  return path.split('.').pop()?.toLowerCase() ?? ''
}

/** By extension, cheaply, before any download; null means the content-type decides. */
export function mediaTypeFromUrl(url: string): 'image' | 'video' | null {
  const extension = extensionFromUrl(url)
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

// A URL with no recognizable extension (a Drive link) counts as an image here and gets
// its real type from the download's content-type, which re-runs these rules. Image is
// the safe guess: the only type-dependent rules are X's, and for X any count that fails
// as images fails as videos too — so nothing valid is rejected early, and nothing
// invalid slips past the re-check.
/** Por extensión declarada, antes de descargar nada — el mismo criterio en los dos sitios que lo necesitan. */
export function contarMedia(media: string[]): { imageCount: number; videoCount: number } {
  let imageCount = 0
  let videoCount = 0
  for (const url of media) {
    if (mediaTypeFromUrl(url) === 'video') videoCount++
    else imageCount++
  }
  return { imageCount, videoCount }
}

/**
 * Portada verdict by extension alone, before any download: a video extension is
 * always rejected, and a recognized image extension outside JPG/PNG (gif/webp) is
 * rejected too. An unrecognized extension returns null — still deferred, same as
 * mediaTypeFromUrl.
 */
export function portadaExtensionError(url: string): string | null {
  const type = mediaTypeFromUrl(url)
  if (type === 'video') return PORTADA_NOT_IMAGE
  if (type === 'image' && !COVER_EXTENSIONS.has(extensionFromUrl(url))) return PORTADA_FORMAT
  return null
}

/**
 * Same verdict once the download is in hand: the real media type first, then the
 * extension typeFromContentType derived — stored.url ends in it, so no need to widen
 * mediaToBlob's public shape just to carry it separately.
 */
export function portadaTypeError(stored: { url: string; mediaType: 'image' | 'video' }): string | null {
  if (stored.mediaType !== 'image') return PORTADA_NOT_IMAGE
  if (!COVER_EXTENSIONS.has(extensionFromUrl(stored.url))) return PORTADA_FORMAT
  return null
}

// Subtypes whose conventional extension is not the subtype itself.
const EXTENSION_BY_SUBTYPE: Record<string, string> = { jpeg: 'jpg', quicktime: 'mov' }
// Inverse, for the extension → MIME subtype direction (tipoArchivo, below).
const SUBTYPE_BY_EXTENSION: Record<string, string> = { jpg: 'jpeg', mov: 'quicktime' }

/**
 * El content-type de la descarga, resuelto a un tipo de media, una extensión para el
 * nombre del blob, y `tipo` — el `tipo/subtipo` canónico, sin parámetros como
 * `; charset=…`, listo para pasarle a Meta o YouTube como content-type del objeto.
 */
export function typeFromContentType(
  contentType: string,
): { mediaType: 'image' | 'video'; extension: string; tipo: string } | null {
  const [type, subtype = ''] = (contentType.split(';')[0] ?? '').trim().toLowerCase().split('/')
  if (type !== 'image' && type !== 'video') return null
  return {
    mediaType: type,
    extension: EXTENSION_BY_SUBTYPE[subtype] ?? (subtype || 'bin'),
    tipo: `${type}/${subtype}`,
  }
}

/**
 * `file.type` real, o el que corresponde a su extensión cuando el navegador no lo dio
 * (pasa con algunos .mov y con archivos que llegan por apps que no lo setean). Sin
 * esto `guardar` recibía un content-type vacío y el archivo terminaba sirviéndose sin
 * uno. Reutiliza las extensiones que este módulo ya reconoce en vez de mantener una
 * segunda lista.
 */
export function tipoDesdeNombre(nombre: string): string {
  const extension = extensionFromUrl(nombre)
  if (IMAGE_EXTENSIONS.has(extension)) return `image/${SUBTYPE_BY_EXTENSION[extension] ?? extension}`
  if (VIDEO_EXTENSIONS.has(extension)) return `video/${SUBTYPE_BY_EXTENSION[extension] ?? extension}`
  return ''
}

/**
 * Igual, pero para un `File`. La ruta que firma las subidas recibe nombre y tipo sueltos,
 * no un `File`, así que la regla vive arriba y acá solo se aplica.
 */
export function tipoArchivo(file: File): string {
  return file.type || tipoDesdeNombre(file.name)
}

/**
 * Qué destinos pide una fila. Nombrar la cuenta manda sobre nombrar la red: lo primero es
 * siempre inequívoco, y lo segundo solo se puede resolver cuando no hay dos candidatas.
 */
export function destinoPedido(item: BatchItem): { cuentas: string[] } | { redes: string[] } {
  return item.cuentas.length > 0 ? { cuentas: item.cuentas } : { redes: item.redes }
}

/** Con dos destinos de la misma red, una clave de `opciones` que nombra la red no alcanza. */
export function opcionesClaveAmbigua(network: string, handles: Array<string | null>): string {
  const lista = handles.map((h) => h ?? 'sin nombre').join(', ')
  return `«${network}» en opciones es ambiguo: la fila tiene ${handles.length} cuentas de esa red (${lista}). Usa el id de cada cuenta como clave.`
}

/** Dos claves de `opciones` que, resueltas, nombran el mismo destino: una pisaría a la otra. */
export function opcionesClaveDuplicada(clave1: string, clave2: string): string {
  return `«${clave1}» y «${clave2}» en opciones nombran el mismo destino. Deja una sola clave por destino.`
}

/**
 * Reescribe las claves crudas de `opciones` a identificadores de cuenta, listas para
 * `validarOpcionesPorCuenta`. Cada clave se busca primero entre los identificadores de
 * `destinos`; si no coincide con ninguno se acepta como nombre de red y se resuelve al
 * destino de esa red solo si la fila tiene exactamente uno — con dos, la clave es
 * ambigua y la fila falla nombrando las candidatas y sus handles. Una clave que no es ni
 * un identificador de la fila ni una de sus redes se ignora, igual que antes ignoraba
 * una red no pedida.
 *
 * Dos claves que resuelven al mismo destino (el id de una cuenta y el nombre de su
 * única red, por ejemplo) no se dejan pisar en silencio con la última que trae el
 * JSON: la fila falla nombrando las dos claves. El sistema no elige entre dos.
 */
export function clavesDeOpciones(
  destinos: CuentaDestino[],
  raw: Record<string, unknown>,
): { raw: Record<string, unknown> } | { error: string } {
  const idsConocidos = new Set(destinos.map((d) => d.id))
  const porRed = new Map<string, CuentaDestino[]>()
  for (const destino of destinos) {
    const lista = porRed.get(destino.network) ?? []
    lista.push(destino)
    porRed.set(destino.network, lista)
  }

  const resultado: Record<string, unknown> = {}
  // Clave cruda que ya resolvió cada destino, para detectar dos claves distintas
  // pisándose sobre el mismo id.
  const claveDe = new Map<string, string>()
  for (const [clave, valor] of Object.entries(raw)) {
    let destinoId: string
    if (idsConocidos.has(clave)) {
      destinoId = clave
    } else {
      const candidatas = porRed.get(clave)
      if (!candidatas || candidatas.length === 0) continue
      if (candidatas.length > 1) {
        return { error: opcionesClaveAmbigua(clave, candidatas.map((c) => c.handle)) }
      }
      destinoId = candidatas[0]!.id
    }
    const claveAnterior = claveDe.get(destinoId)
    if (claveAnterior !== undefined) {
      return { error: opcionesClaveDuplicada(claveAnterior, clave) }
    }
    claveDe.set(destinoId, clave)
    resultado[destinoId] = valor
  }
  return { raw: resultado }
}

/**
 * Las opciones de la fila ya limpias, o la frase. Un valor que no es objeto se rechaza
 * entero, aunque `destinos` no se conozca todavía.
 *
 * `destinos` es `null` en la comprobación previa a la base para una fila que nombró
 * cuentas: sin ir a la base no se sabe la red de cada una, así que ahí solo se
 * comprueba la forma y la resolución completa queda para cuando `scheduleBatch` ya
 * tenga los destinos verificados.
 */
export function opcionesDeFila(
  item: BatchItem,
  destinos: CuentaDestino[] | null,
): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const raw = item.opciones
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return { error: OPCIONES_ERROR }
  }
  if (!destinos) return { opciones: {} }

  const claves = clavesDeOpciones(destinos, (raw ?? {}) as Record<string, unknown>)
  if ('error' in claves) return claves
  return validarOpcionesPorCuenta(destinos, claves.raw)
}

/**
 * The batch item's whole rulebook: its own shape first, then the composer's exact
 * rules via validateScheduleDraft — one source of truth for limits and media shapes.
 */
export function validateBatchItem(item: BatchItem, now: Date): string | null {
  const scheduledAt = parseFecha(item.fecha)
  if (!scheduledAt) return 'La fecha no se entendió (usa YYYY-MM-DD HH:MM).'

  const pedido = destinoPedido(item)
  if ('redes' in pedido && pedido.redes.length === 0) {
    return 'Elige al menos una cuenta o una red.'
  }

  for (const red of item.redes) {
    if (!PUBLISHABLE.has(red)) return `Red desconocida o sin publicación: ${red}.`
  }

  if (new Set(item.redes).size !== item.redes.length) {
    return 'Hay redes repetidas en la fila.'
  }

  const { imageCount, videoCount } = contarMedia(item.media)

  const portada = item.portada?.trim()
  if (portada) {
    const extensionError = portadaExtensionError(portada)
    if (extensionError) return extensionError
    // Un tipo diferido en media puede resultar video (un link de Drive), así que
    // solo se rechaza aquí cuando TODA la media es imagen segura; la re-validación
    // post-descarga da el veredicto final con los tipos reales.
    const videoPossible = item.media.some((url) => mediaTypeFromUrl(url) !== 'image')
    if (!videoPossible) return PORTADA_NEEDS_VIDEO
  }

  const atributosCheck = validateAtributos(item.atributos)
  if ('error' in atributosCheck) return atributosCheck.error

  // Con redes nombradas, cada una implica un único destino conceptual: se arma un
  // destino de mentira por red (su id es el propio nombre) para poder pasar por
  // `validarOpcionesPorCuenta` sin tocar la base. Con cuentas nombradas no hay con qué
  // armarlo — la red real de cada cuenta solo la sabe la base — así que aquí solo se
  // comprueba la forma; `scheduleBatch` hace la comprobación completa ya con los
  // destinos verificados, antes de subir nada.
  const destinosParaOpciones = 'redes' in pedido
    ? pedido.redes.map((network) => ({ id: network, network, handle: null }))
    : null
  const opcionesCheck = opcionesDeFila(item, destinosParaOpciones)
  if ('error' in opcionesCheck) return opcionesCheck.error

  const reglaCheck = validarRegla(item.regla)
  if ('error' in reglaCheck) return reglaCheck.error

  // Igual que con las opciones: las reglas de forma por red (TikTok, X, Threads, el
  // tope del carrusel) solo se pueden aplicar cuando la fila nombra redes. Con cuentas
  // nombradas, `scheduleBatch` las vuelve a correr con las redes reales de los destinos
  // verificados.
  if (!('redes' in pedido)) return null

  return validateScheduleDraft(
    {
      caption: item.texto,
      imageCount,
      videoCount,
      networks: pedido.redes,
      scheduledAt,
      formats: item.media.map(extensionDe),
    },
    now,
  )
}

export async function mediaToBlob(
  url: string,
  expected: 'image' | 'video' | null,
): Promise<{ url: string; mediaType: 'image' | 'video' } | null> {
  let response: Response
  try {
    // Third-party hosting named in a spreadsheet cell: a host that stalls must cost
    // this row thirty seconds, not the whole batch's 240s budget.
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    console.error('No se pudo descargar la media del lote:', String(error).slice(0, 200), url.slice(0, 200))
    return null
  }
  if (!response.ok) {
    console.error('No se pudo descargar la media del lote:', response.status, url.slice(0, 200))
    return null
  }
  const contentType = response.headers.get('content-type') ?? ''
  // The server's content-type is the truth: with an extension it must agree (a PDF
  // renamed .jpg would otherwise reach Meta as an "image"); without one — a Drive
  // link — it decides the type. Anything but image/* or video/* refuses the row,
  // which is also what catches Drive's HTML interstitial pages.
  const detected = typeFromContentType(contentType)
  if (!detected || (expected && detected.mediaType !== expected)) {
    console.error('Content-type inesperado en la media del lote:', contentType, url.slice(0, 200))
    return null
  }
  const publicUrl = await guardar(
    `scheduled/${randomUUID()}.${detected.extension}`,
    await response.blob(),
    // El canónico que typeFromContentType ya parseó, no el header crudo: sin sus
    // parámetros (`; charset=binary` y similares) para que Meta y YouTube lean un
    // tipo limpio al descargar la media desde acá.
    detected.tipo,
  )
  return { url: publicUrl, mediaType: detected.mediaType }
}

/**
 * One batch, sequential on purpose: fifty concurrent downloads against third-party
 * hosting is how you meet rate limits. A failed row records its fixed sentence and
 * the loop keeps going — partial success is the contract, Buffer-style.
 */
export async function scheduleBatch(ownerId: string, items: BatchItem[]): Promise<BatchResult[]> {
  const db = getDb()
  const now = new Date()
  const results: BatchResult[] = []

  for (const [index, item] of items.entries()) {
    const invalid = validateBatchItem(item, now)
    if (invalid) {
      results.push({ index, ok: false, error: invalid })
      continue
    }

    try {
      // Antes de subir nada: un destino sin cuenta se rechaza acá, no después de gastar
      // la subida de toda la media de la fila.
      const pedido = destinoPedido(item)
      const destinos =
        'cuentas' in pedido
          ? await verificarCuentas(ownerId, pedido.cuentas)
          : [...(await cuentaUnicaPorRed(ownerId, pedido.redes)).values()]

      // Igual de temprano: con cuentas nombradas, `validateBatchItem` solo comprobó la
      // forma de `opciones` (no conocía la red de cada cuenta sin ir a la base). Ahora
      // que los destinos están verificados, esta es la comprobación completa.
      const opcionesCheck = opcionesDeFila(item, destinos)
      if ('error' in opcionesCheck) {
        results.push({ index, ok: false, error: opcionesCheck.error })
        continue
      }
      const opciones = opcionesCheck.opciones

      // Las reglas de forma por red (TikTok exige video, X no admite más de 4 fotos, …)
      // usaban `item.redes`, que con cuentas nombradas puede venir vacío: la red real
      // de cada destino solo se sabe acá. `validateScheduleDraft` se vuelve a correr
      // más abajo, siempre con las redes de `destinos`.
      const networks = [...new Set(destinos.map((d) => d.network))]
      const scheduledAt = parseFecha(item.fecha)!

      // Todavía antes de subir nada: con redes nombradas, `validateBatchItem` ya corrió
      // estas mismas reglas de forma (TikTok exige video, X hasta 4 fotos, Threads un
      // solo archivo, el tope del carrusel, los límites de caption, la fecha futura…).
      // Con cuentas nombradas, esta es la primera vez que `networks` existe — sin este
      // chequeo, una fila con fecha pasada o sin texto se descargaba y subía entera
      // antes de rechazarse.
      const { imageCount: imageCountDeclarado, videoCount: videoCountDeclarado } = contarMedia(item.media)
      const preUploadError = validateScheduleDraft(
        {
          caption: item.texto,
          imageCount: imageCountDeclarado,
          videoCount: videoCountDeclarado,
          networks,
          scheduledAt,
          formats: item.media.map(extensionDe),
        },
        now,
      )
      if (preUploadError) {
        results.push({ index, ok: false, error: preUploadError })
        continue
      }

      const uploaded: Array<{ url: string; mediaType: 'image' | 'video' }> = []
      let mediaFailed = false
      for (const url of item.media) {
        const stored = await mediaToBlob(url, mediaTypeFromUrl(url))
        if (!stored) {
          results.push({ index, ok: false, error: 'No se pudo leer una media de la fila.' })
          mediaFailed = true
          break
        }
        uploaded.push(stored)
      }
      if (mediaFailed) continue

      // Deferred types are now real: re-run the composer's rules with the true
      // image/video split — a Drive link that turned out to be a video where only
      // images fit fails here, with the same fixed sentence the composer would use.
      const shapeError = validateScheduleDraft(
        {
          caption: item.texto,
          imageCount: uploaded.filter((m) => m.mediaType === 'image').length,
          videoCount: uploaded.filter((m) => m.mediaType === 'video').length,
          networks,
          scheduledAt,
          formats: uploaded.map((m) => extensionDe(m.url)),
        },
        now,
      )
      if (shapeError) {
        results.push({ index, ok: false, error: shapeError })
        continue
      }

      // La portada sigue la misma tubería que la media, con dos veredictos propios:
      // los tipos reales deben incluir un video, y la portada misma debe ser imagen.
      const portada = item.portada?.trim()
      let coverUrl: string | null = null
      if (portada) {
        if (!uploaded.some((m) => m.mediaType === 'video')) {
          results.push({ index, ok: false, error: PORTADA_NEEDS_VIDEO })
          continue
        }
        // expected=null: deja que el content-type decida, así un .jpg cuyo content-type
        // real es video cae en PORTADA_NOT_IMAGE en vez de heredar la sospecha por
        // extensión.
        const stored = await mediaToBlob(portada, null)
        if (!stored) {
          results.push({ index, ok: false, error: 'No se pudo leer una media de la fila.' })
          continue
        }
        const typeError = portadaTypeError(stored)
        if (typeError) {
          results.push({ index, ok: false, error: typeError })
          continue
        }
        coverUrl = stored.url
      }

      const atributosCheck = validateAtributos(item.atributos)
      const atributos = 'error' in atributosCheck ? null : atributosCheck.atributos
      const reglaCheck = validarRegla(item.regla)

      const [post] = await db
        .insert(scheduledPosts)
        .values({ ownerId, caption: item.texto, scheduledAt, coverUrl, atributos })
        .returning()
      if (uploaded.length > 0) {
        await db.insert(scheduledPostMedia).values(
          uploaded.map((m, position) => ({
            postId: post!.id,
            blobUrl: m.url,
            mediaType: m.mediaType,
            position,
          })),
        )
      }
      // Dos caminos crean posts programados y no comparten código: este, y
      // `crearPostProgramado` (`./crear.ts`), que usan el compositor y la ruta móvil.
      // Ese no sirve acá porque no sabe de `coverUrl` ni de `atributos` — el lote es
      // hoy el único llamador que los necesita al crear. Un cambio en cómo se escribe
      // un target (esta forma de `scheduledPostTargets.values`) hay que replicarlo ahí.
      await db.insert(scheduledPostTargets).values(
        destinos.map((cuenta) => ({
          postId: post!.id,
          network: cuenta.network,
          accountId: cuenta.id,
          opciones: opciones[cuenta.id] ?? null,
        })),
      )

      if (!('error' in reglaCheck) && reglaCheck.regla) {
        await db.insert(reglasClave).values({ postId: post!.id, ...reglaCheck.regla })
      }

      results.push({ index, ok: true, postId: post!.id })
    } catch (error) {
      if (error instanceof CuentaInvalida) {
        results.push({ index, ok: false, error: error.message })
        continue
      }
      console.error(`Falló el item ${index} del lote:`, error)
      results.push({ index, ok: false, error: 'No se pudo guardar la fila. Inténtalo de nuevo.' })
    }
  }

  return results
}
