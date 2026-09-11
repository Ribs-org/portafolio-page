import { env } from '@/lib/env'
import type { Fuente, PostAjeno } from './fuente'
import { idMayor } from './tope'

const API = 'https://api.x.com/2'

export type XTweetPayload = {
  id?: string
  text?: string
  created_at?: string
}

/** Null cuando no hay id o no hay texto: sin identidad no hay fila, y sin texto no hay idea. */
export function normalizeXTweet(
  raw: XTweetPayload,
  username: string,
  ahora: Date,
): PostAjeno | null {
  if (!raw.id) return null
  const text = (raw.text ?? '').trim()
  if (text.length === 0) return null
  const fecha = raw.created_at ? new Date(raw.created_at) : null
  return {
    externalId: raw.id,
    url: `https://x.com/${username}/status/${raw.id}`,
    authorHandle: username,
    text,
    // Sin fecha de la red, la del descubrimiento: 1970 hundiría la ficha al fondo de una
    // baraja ordenada por fecha, y un Date inválido reventaría el insert.
    publishedAt: fecha && !Number.isNaN(fecha.getTime()) ? fecha : ahora,
  }
}

async function pedir(ruta: string): Promise<Record<string, unknown>> {
  const token = env('X_BEARER_TOKEN')
  if (!token) throw new Error('X_BEARER_TOKEN is not set')
  const response = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`X ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const xFuente: Fuente = {
  network: 'x',

  async resolverAutor(username) {
    const body = (await pedir(`/users/by/username/${encodeURIComponent(username)}`)) as {
      data?: { id?: string }
    }
    const id = body.data?.id
    if (!id) throw new Error('X no devolvió el id de la cuenta')
    return id
  },

  async traer(externalId, username, sinceId, tope) {
    // `exclude` deja fuera respuestas y retuits: una respuesta fuera de su hilo no se
    // entiende, y un retuit es contenido ajeno dentro de contenido ajeno.
    const params = new URLSearchParams({
      'tweet.fields': 'created_at',
      exclude: 'replies,retweets',
      // La API acepta entre 5 y 100; el tope del día puede pedir menos que el mínimo.
      max_results: String(Math.min(Math.max(tope, 5), 100)),
    })
    if (sinceId) params.set('since_id', sinceId)
    const body = (await pedir(`/users/${externalId}/tweets?${params}`)) as {
      data?: XTweetPayload[]
      meta?: { newest_id?: string }
    }
    const crudos = body.data ?? []
    // Una sola hora de descubrimiento para toda la página: dos tuits traídos juntos no
    // tienen por qué diferir en milisegundos cuando ninguno trajo fecha.
    const ahora = new Date()
    const posts: PostAjeno[] = []
    for (const raw of crudos) {
      const c = normalizeXTweet(raw, username, ahora)
      if (c) posts.push(c)
    }
    // La marca sale de lo que X entregó y no de lo que sobrevivió: una página entera de
    // descartes dejaría la marca quieta y se volvería a pedir, y a pagar, en cada corrida.
    let masNuevo = body.meta?.newest_id ?? null
    if (!masNuevo) {
      for (const raw of crudos) masNuevo = idMayor(masNuevo, raw.id ?? null)
    }
    return { posts, leidas: crudos.length, masNuevo }
  },
}
