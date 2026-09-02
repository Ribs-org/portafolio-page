import { env } from '@/lib/env'
import { fromZonedInput } from '@/lib/utils'
import { validateScheduleDraft } from './validate'
import { put } from '@vercel/blob'
import { getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets } from '@/db'
import { randomUUID } from 'node:crypto'

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
  redes: string[]
  media: string[]
  /** URL pública de imagen; vacía o ausente = sin portada. Solo válida con video. */
  portada?: string
}

export type BatchResult =
  | { index: number; ok: true; postId: string }
  | { index: number; ok: false; error: string }

export const MAX_BATCH_ITEMS = 50

export const PORTADA_NEEDS_VIDEO = 'La portada requiere un video en media.'
export const PORTADA_NOT_IMAGE = 'La portada debe ser una imagen.'

// The five networks with a publisher; tiktok reads but cannot post yet. Twin of
// ENABLED in the composer (schedule/composer.tsx) — update both together.
const PUBLISHABLE = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x'])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])

/** By extension, cheaply, before any download; null means the content-type decides. */
export function mediaTypeFromUrl(url: string): 'image' | 'video' | null {
  const path = url.split('?')[0] ?? ''
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

// Subtypes whose conventional extension is not the subtype itself.
const EXTENSION_BY_SUBTYPE: Record<string, string> = { jpeg: 'jpg', quicktime: 'mov' }

/** The download's content-type, resolved to a media type and a blob-name extension. */
export function typeFromContentType(
  contentType: string,
): { mediaType: 'image' | 'video'; extension: string } | null {
  const [type, subtype = ''] = (contentType.split(';')[0] ?? '').trim().toLowerCase().split('/')
  if (type !== 'image' && type !== 'video') return null
  return { mediaType: type, extension: EXTENSION_BY_SUBTYPE[subtype] ?? (subtype || 'bin') }
}

/**
 * The batch item's whole rulebook: its own shape first, then the composer's exact
 * rules via validateScheduleDraft — one source of truth for limits and media shapes.
 */
export function validateBatchItem(item: BatchItem, now: Date): string | null {
  const scheduledAt = parseFecha(item.fecha)
  if (!scheduledAt) return 'La fecha no se entendió (usa YYYY-MM-DD HH:MM).'

  for (const red of item.redes) {
    if (!PUBLISHABLE.has(red)) return `Red desconocida o sin publicación: ${red}.`
  }

  if (new Set(item.redes).size !== item.redes.length) {
    return 'Hay redes repetidas en la fila.'
  }

  // A URL with no recognizable extension (a Drive link) counts as an image here and
  // gets its real type from the download's content-type, which re-runs these rules.
  // Image is the safe guess: the only type-dependent rules are X's, and for X any
  // count that fails as images fails as videos too — so nothing valid is rejected
  // early, and nothing invalid slips past the re-check.
  let imageCount = 0
  let videoCount = 0
  for (const url of item.media) {
    if (mediaTypeFromUrl(url) === 'video') videoCount++
    else imageCount++
  }

  const portada = item.portada?.trim()
  if (portada) {
    if (mediaTypeFromUrl(portada) === 'video') return PORTADA_NOT_IMAGE
    // Un tipo diferido en media puede resultar video (un link de Drive), así que
    // solo se rechaza aquí cuando TODA la media es imagen segura; la re-validación
    // post-descarga da el veredicto final con los tipos reales.
    const videoPossible = item.media.some((url) => mediaTypeFromUrl(url) !== 'image')
    if (!videoPossible) return PORTADA_NEEDS_VIDEO
  }

  return validateScheduleDraft(
    { caption: item.texto, imageCount, videoCount, networks: item.redes, scheduledAt },
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
  const blob = await put(`scheduled/${randomUUID()}.${detected.extension}`, await response.blob(), {
    access: 'public',
  })
  return { url: blob.url, mediaType: detected.mediaType }
}

/**
 * One batch, sequential on purpose: fifty concurrent downloads against third-party
 * hosting is how you meet rate limits. A failed row records its fixed sentence and
 * the loop keeps going — partial success is the contract, Buffer-style.
 */
export async function scheduleBatch(items: BatchItem[]): Promise<BatchResult[]> {
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

      const scheduledAt = parseFecha(item.fecha)!

      // Deferred types are now real: re-run the composer's rules with the true
      // image/video split — a Drive link that turned out to be a video where only
      // images fit fails here, with the same fixed sentence the composer would use.
      const shapeError = validateScheduleDraft(
        {
          caption: item.texto,
          imageCount: uploaded.filter((m) => m.mediaType === 'image').length,
          videoCount: uploaded.filter((m) => m.mediaType === 'video').length,
          networks: item.redes,
          scheduledAt,
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
        const stored = await mediaToBlob(portada, mediaTypeFromUrl(portada))
        if (!stored) {
          results.push({ index, ok: false, error: 'No se pudo leer una media de la fila.' })
          continue
        }
        if (stored.mediaType !== 'image') {
          results.push({ index, ok: false, error: PORTADA_NOT_IMAGE })
          continue
        }
        coverUrl = stored.url
      }

      const [post] = await db
        .insert(scheduledPosts)
        .values({ caption: item.texto, scheduledAt, coverUrl })
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
      await db
        .insert(scheduledPostTargets)
        .values(item.redes.map((network) => ({ postId: post!.id, network })))

      results.push({ index, ok: true, postId: post!.id })
    } catch (error) {
      console.error(`Falló el item ${index} del lote:`, error)
      results.push({ index, ok: false, error: 'No se pudo guardar la fila. Inténtalo de nuevo.' })
    }
  }

  return results
}
