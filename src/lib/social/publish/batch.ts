import { SITE_TIMEZONE } from '@/lib/analytics'
import { fromZonedInput } from '@/lib/utils'
import { validateScheduleDraft } from './validate'

export type BatchItem = { fecha: string; texto: string; redes: string[]; media: string[] }

export type BatchResult =
  | { index: number; ok: true; postId: string }
  | { index: number; ok: false; error: string }

export const MAX_BATCH_ITEMS = 50

// The five networks with a publisher; tiktok reads but cannot post yet.
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
  const isoDateTime = item.fecha.replace(' ', 'T')
  const scheduledAt = fromZonedInput(isoDateTime, SITE_TIMEZONE)
  if (!scheduledAt) return 'La fecha no se entendió (usa YYYY-MM-DD HH:MM).'

  for (const red of item.redes) {
    if (!PUBLISHABLE.has(red)) return `Red desconocida o sin publicación: ${red}.`
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
