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

export type BatchItem = { fecha: string; texto: string; redes: string[]; media: string[] }

export type BatchResult =
  | { index: number; ok: true; postId: string }
  | { index: number; ok: false; error: string }

export const MAX_BATCH_ITEMS = 50

// The five networks with a publisher; tiktok reads but cannot post yet. Twin of
// ENABLED in the composer (schedule/composer.tsx) — update both together.
const PUBLISHABLE = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x'])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])

/** By extension, cheaply, before any download; the real content-type re-checks later. */
export function mediaTypeFromUrl(url: string): 'image' | 'video' | null {
  const path = url.split('?')[0] ?? ''
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
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

  let imageCount = 0
  let videoCount = 0
  for (const url of item.media) {
    const type = mediaTypeFromUrl(url)
    if (!type) return 'No puedo inferir el tipo de una media por su URL.'
    if (type === 'image') imageCount++
    else videoCount++
  }

  return validateScheduleDraft(
    { caption: item.texto, imageCount, videoCount, networks: item.redes, scheduledAt },
    now,
  )
}

async function mediaToBlob(
  url: string,
  expected: 'image' | 'video',
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
  // The extension promised one thing; the server must agree, or the row is refused —
  // a PDF renamed .jpg would otherwise reach Meta as an "image".
  if (!contentType.startsWith(`${expected}/`)) {
    console.error('Content-type inesperado en la media del lote:', contentType, url.slice(0, 200))
    return null
  }
  const extension = (url.split('?')[0] ?? '').split('.').pop()?.toLowerCase() ?? 'bin'
  const blob = await put(`scheduled/${randomUUID()}.${extension}`, await response.blob(), {
    access: 'public',
  })
  return { url: blob.url, mediaType: expected }
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
        const stored = await mediaToBlob(url, mediaTypeFromUrl(url)!)
        if (!stored) {
          results.push({ index, ok: false, error: 'No se pudo leer una media de la fila.' })
          mediaFailed = true
          break
        }
        uploaded.push(stored)
      }
      if (mediaFailed) continue

      const scheduledAt = parseFecha(item.fecha)!
      const [post] = await db
        .insert(scheduledPosts)
        .values({ caption: item.texto, scheduledAt })
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
