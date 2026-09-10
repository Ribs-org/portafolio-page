// Pure pieces of GET /api/schedule/posts. The zone arrives as a parameter — this
// module must stay importable by vitest (no server-only imports).
import { isoInZone, parseRango } from '@/lib/metrics-api'
import { addDays, dayKey } from '@/lib/schedule-week'
import type { Atributos } from '@/lib/social/publish/atributos'

/** Un calendario mira hacia adelante: sin parámetros, de hoy a 30 días. */
const DIAS_ADELANTE = 30

/**
 * La ventana del calendario en días de Chile, ambos inclusive. A diferencia de
 * `parseRango` (métricas, que mira hacia atrás), el default parte hoy y va hacia
 * adelante: lo que el editor quiere ver es la parrilla que viene. Devuelve también las
 * claves de día para que la respuesta diga qué ventana aplicó.
 */
export function parseVentana(
  desde: string | null,
  hasta: string | null,
  now: Date,
  zone: string,
): { from: Date; to: Date; desde: string; hasta: string } | { error: string } {
  const hoy = dayKey(now, zone)
  const desdeKey = desde ?? hoy
  // Sin `hasta`, 30 días desde el inicio pedido — no desde hoy — para que
  // «desde el 1» signifique el mes que empieza el 1.
  const hastaKey = hasta ?? (/^\d{4}-\d{2}-\d{2}$/.test(desdeKey) ? addDays(desdeKey, DIAS_ADELANTE) : desdeKey)
  const rango = parseRango(desdeKey, hastaKey, now, zone)
  if ('error' in rango) return rango
  return { ...rango, desde: desdeKey, hasta: hastaKey }
}

export type FilaProgramada = {
  post: {
    id: string
    caption: string
    scheduledAt: Date
    coverUrl: string | null
    atributos: unknown
  }
  target: {
    network: string
    status: string
    lastError: string | null
    externalId: string | null
    attemptCount: number
  }
}

export type MediaProgramada = {
  postId: string
  blobUrl: string
  mediaType: 'image' | 'video'
  position: number
}

export type PostProgramadoApi = {
  id: string
  texto: string
  fecha: string
  portada: string | null
  media: Array<{ url: string; tipo: 'image' | 'video' }>
  atributos: Atributos | null
  redes: Array<{
    red: string
    estado: string
    error: string | null
    externalId: string | null
    intentos: number
  }>
}

/**
 * Una fila por (post, red) del join → un post con su lista de redes. El orden de los
 * posts es el de llegada (el query ordena por fecha); la media va por `position`, que
 * es el orden del carrusel.
 */
export function armarProgramados(
  filas: FilaProgramada[],
  medias: MediaProgramada[],
  zone: string,
): PostProgramadoApi[] {
  const mediaPorPost = new Map<string, MediaProgramada[]>()
  for (const media of medias) {
    const lista = mediaPorPost.get(media.postId) ?? []
    lista.push(media)
    mediaPorPost.set(media.postId, lista)
  }

  const posts = new Map<string, PostProgramadoApi>()
  for (const { post, target } of filas) {
    const entrada = posts.get(post.id) ?? {
      id: post.id,
      texto: post.caption,
      fecha: isoInZone(post.scheduledAt, zone),
      portada: post.coverUrl,
      media: (mediaPorPost.get(post.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((m) => ({ url: m.blobUrl, tipo: m.mediaType })),
      atributos: (post.atributos as Atributos | null) ?? null,
      redes: [],
    }
    entrada.redes.push({
      red: target.network,
      estado: target.status,
      error: target.lastError,
      externalId: target.externalId,
      intentos: target.attemptCount,
    })
    posts.set(post.id, entrada)
  }
  return [...posts.values()]
}
