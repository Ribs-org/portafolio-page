export type ScheduleDraft = {
  caption: string
  imageCount: number
  videoCount: number
  networks: string[]
  scheduledAt: Date | null
}

export const MAX_CAROUSEL_ITEMS = 10
export const MAX_CAPTION_LENGTH = 2200
export const X_CAPTION_LIMIT = 280
export const THREADS_CAPTION_LIMIT = 500

// Text-first networks publish with no file at all; these two never can.
const MEDIA_REQUIRED = new Set(['instagram', 'youtube'])

/**
 * The composer's whole rulebook, pure so it is testable and shared: the server action
 * runs it as the real gate. Returns a fixed sentence or null.
 */
export function validateScheduleDraft(draft: ScheduleDraft, now: Date): string | null {
  const files = draft.imageCount + draft.videoCount
  if (files === 0 && draft.networks.some((n) => MEDIA_REQUIRED.has(n))) {
    return 'Instagram y YouTube necesitan al menos un archivo.'
  }
  if (files > MAX_CAROUSEL_ITEMS) return 'Máximo diez archivos por publicación.'
  if (draft.networks.length === 0) return 'Elige al menos una plataforma.'
  if (!draft.scheduledAt) return 'La fecha no se entendió.'
  if (draft.scheduledAt.getTime() <= now.getTime()) return 'La hora debe estar en el futuro.'
  if (draft.networks.includes('x') && draft.caption.length > X_CAPTION_LIMIT) {
    return 'El texto excede los 280 caracteres de X.'
  }
  if (draft.networks.includes('threads') && draft.caption.length > THREADS_CAPTION_LIMIT) {
    return 'El texto excede los 500 caracteres de Threads.'
  }
  if (draft.caption.length > MAX_CAPTION_LENGTH) return 'El texto es demasiado largo para Instagram.'
  return null
}
