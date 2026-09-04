import type { TargetStatus } from '@/db/schema'
import type { SocialAccount } from '@/db'

export type PublishMedia = { url: string; mediaType: 'image' | 'video'; position: number }

export type PublishInput = {
  caption: string
  media: PublishMedia[]
  containerId: string | null
  token: string
  accountExternalId: string
  /** Imagen de portada (URL del Blob) para los caminos de video; null si no hay. */
  coverUrl: string | null
}

export type PublishOutcome =
  | { kind: 'published'; externalId: string }
  | { kind: 'processing'; containerId: string }
  | { kind: 'failed'; reason: string }

/** Adding a network in later phases is a file plus a line, same as Connector. */
export type Publisher = {
  network: string
  /** Write credential, when it differs from the connector's read credential. */
  ensureCredential?(account: SocialAccount): Promise<string | null>
  publish(input: PublishInput): Promise<PublishOutcome>
}

export type TargetPatch = {
  status: TargetStatus
  containerId: string | null
  externalId: string | null
  attemptCount: number
  lastError: string | null
}

// Every sentence the owner can see. Upstream detail goes to the server log only.
export const PUBLISH_REJECTED = 'Instagram rechazó la publicación.'
export const PUBLISH_NETWORK_ERROR = 'No se pudo hablar con la red. Se reintentará.'
export const NO_PUBLISH_TOKEN = 'La cuenta no está conectada. Reconéctala y reprograma.'
export const STALE_PROCESSING = 'La red no terminó de procesar el video.'

export const MAX_PUBLISH_ATTEMPTS = 3
export const STALE_PROCESSING_HOURS = 24

/**
 * The whole state machine in one pure spot. Waiting on Meta ('processing') spends no
 * attempt — attempts are for things that went wrong. Only the last allowed failure
 * lands on 'failed', which is also what makes the alert email fire exactly once.
 */
export function resolveOutcome(outcome: PublishOutcome, attemptCount: number): TargetPatch {
  if (outcome.kind === 'published') {
    return {
      status: 'published',
      containerId: null,
      externalId: outcome.externalId,
      attemptCount,
      lastError: null,
    }
  }
  if (outcome.kind === 'processing') {
    return {
      status: 'publishing',
      containerId: outcome.containerId,
      externalId: null,
      attemptCount,
      lastError: null,
    }
  }
  const attempts = attemptCount + 1
  return {
    status: attempts >= MAX_PUBLISH_ATTEMPTS ? 'failed' : 'scheduled',
    containerId: null,
    externalId: null,
    attemptCount: attempts,
    lastError: outcome.reason,
  }
}

/**
 * Qué media dejó de tener razón de existir en nuestro almacenamiento.
 *
 * La copia en el Blob existe para una sola cosa: entregarle el archivo a la red. Una
 * vez que TODOS los destinos publicaron, el video vive en Instagram, Facebook y
 * YouTube, y la nuestra solo ocupa espacio — el plan tiene 1 GB y un mes de parrilla
 * lo llena, que es exactamente cómo se cayó la carga masiva el 4 de septiembre.
 *
 * Las fotos y la portada se conservan a propósito: pesan cientos de kilobytes contra
 * decenas de megabytes, y son la miniatura que el calendario muestra hacia atrás.
 * Mientras un solo destino siga pendiente, no se toca nada: podría reintentarse.
 */
export function mediaParaBorrar<T extends { mediaType: string }>(
  targets: Array<{ status: string }>,
  media: T[],
): T[] {
  const publicado = targets.length > 0 && targets.every((t) => t.status === 'published')
  return publicado ? media.filter((m) => m.mediaType === 'video') : []
}

/** A target parked in 'publishing' must never wait forever: 24 hours is a verdict. */
export function isStaleProcessing(updatedAt: Date, now: Date): boolean {
  return now.getTime() - updatedAt.getTime() >= STALE_PROCESSING_HOURS * 60 * 60 * 1000
}
