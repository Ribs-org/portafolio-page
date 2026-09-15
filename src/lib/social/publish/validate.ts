export type ScheduleDraft = {
  caption: string
  imageCount: number
  videoCount: number
  networks: string[]
  scheduledAt: Date | null
  /**
   * Extensión de cada archivo en minúscula, `''` si no se conoce (una URL de Drive).
   * Solo TikTok la mira: es la única red que rechaza formatos que las demás aceptan.
   */
  formats?: string[]
}

export const MAX_CAROUSEL_ITEMS = 10
export const MAX_CAPTION_LENGTH = 2200
export const X_CAPTION_LIMIT = 280
export const THREADS_CAPTION_LIMIT = 500
export const TIKTOK_MAX_FOTOS = 35
export const TIKTOK_MEDIA = 'TikTok recibe un video, o hasta 35 fotos JPG o WebP.'

// Text-first networks publish with no file at all; these three never can.
const MEDIA_REQUIRED = new Set(['instagram', 'youtube', 'tiktok'])

const TIKTOK_VIDEO = new Set(['mp4', 'mov', 'webm'])
const TIKTOK_FOTO = new Set(['jpg', 'jpeg', 'webp'])

/** La extensión de un nombre de archivo o una URL, sin querystring, en minúscula. */
export function extensionDe(nombreOUrl: string): string {
  const path = nombreOUrl.split('?')[0] ?? ''
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot === -1 ? '' : last.slice(dot + 1).toLowerCase()
}

function tiktokMediaError(draft: ScheduleDraft): string | null {
  if (draft.videoCount > 1) return TIKTOK_MEDIA
  if (draft.videoCount === 1 && draft.imageCount > 0) return TIKTOK_MEDIA
  if (draft.imageCount > TIKTOK_MAX_FOTOS) return TIKTOK_MEDIA
  const permitidos = draft.videoCount === 1 ? TIKTOK_VIDEO : TIKTOK_FOTO
  for (const f of draft.formats ?? []) {
    // Extensión desconocida: el content-type de la descarga decide y re-valida.
    if (f !== '' && !permitidos.has(f)) return TIKTOK_MEDIA
  }
  return null
}

/**
 * The composer's whole rulebook, pure so it is testable and shared: the server action
 * runs it as the real gate. Returns a fixed sentence or null.
 */
export function validateScheduleDraft(
  draft: ScheduleDraft,
  now: Date,
  opts?: { allowPast?: boolean },
): string | null {
  const files = draft.imageCount + draft.videoCount
  if (files === 0 && draft.networks.some((n) => MEDIA_REQUIRED.has(n))) {
    return 'Instagram, YouTube y TikTok necesitan al menos un archivo.'
  }
  if (files === 0 && draft.caption.length === 0) {
    return 'Escribe un texto o adjunta un archivo.'
  }
  if (draft.networks.includes('tiktok')) {
    const error = tiktokMediaError(draft)
    if (error) return error
  }
  if (draft.networks.includes('x') && draft.videoCount > 0) {
    return 'X aún no recibe video desde el calendario.'
  }
  if (draft.networks.includes('x') && draft.imageCount > 4) {
    return 'X recibe hasta cuatro imágenes.'
  }
  if (draft.networks.includes('threads') && files > 1) {
    return 'Threads recibe un solo archivo por post.'
  }
  // TikTok sola llega a 35 fotos; cualquier otra red de compañía vuelve a imponer diez.
  if (files > MAX_CAROUSEL_ITEMS && draft.networks.some((n) => n !== 'tiktok')) {
    return 'Máximo diez archivos por publicación.'
  }
  if (draft.networks.length === 0) return 'Elige al menos una plataforma.'
  if (!draft.scheduledAt) return 'La fecha no se entendió.'
  // Editar un post cuya hora ya pasó (corregir el texto que X rechazó) no debe exigir
  // mover la fecha; guardar con fecha pasada re-armada publica en el próximo cron —
  // el "reintenta ahora" natural.
  if (!opts?.allowPast && draft.scheduledAt.getTime() <= now.getTime()) {
    return 'La hora debe estar en el futuro.'
  }
  if (draft.networks.includes('x') && draft.caption.length > X_CAPTION_LIMIT) {
    return 'El texto excede los 280 caracteres de X.'
  }
  if (draft.networks.includes('threads') && draft.caption.length > THREADS_CAPTION_LIMIT) {
    return 'El texto excede los 500 caracteres de Threads.'
  }
  if (draft.caption.length > MAX_CAPTION_LENGTH) return 'El texto es demasiado largo para Instagram.'
  return null
}
