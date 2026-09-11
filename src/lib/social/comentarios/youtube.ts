import { ensureYoutubeCredential } from '../publish/youtube'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const API = 'https://www.googleapis.com/youtube/v3'
const LIMITE = 10000

export type YouTubeThreadPayload = {
  id?: string
  snippet?: {
    topLevelComment?: {
      id?: string
      snippet?: {
        textOriginal?: string
        authorDisplayName?: string
        authorChannelId?: { value?: string }
        publishedAt?: string
        // Lo devuelve la API aunque acá no se use: quien sondea ya sabe de qué video vino.
        videoId?: string
      }
    }
  }
}

export function normalizeYouTubeThread(
  raw: YouTubeThreadPayload,
  postExternalId: string,
): ComentarioLeido | null {
  const top = raw.snippet?.topLevelComment
  const snippet = top?.snippet
  const id = top?.id ?? raw.id
  if (!id || !snippet) return null
  const fecha = new Date(snippet.publishedAt ?? '')
  return {
    externalId: id,
    postExternalId,
    author: snippet.authorDisplayName ?? null,
    authorExternalId: snippet.authorChannelId?.value ?? null,
    text: snippet.textOriginal ?? '',
    // Sin fecha de la red, la del descubrimiento: 1970 hundiría la fila al fondo de la cola.
    publishedAt: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
  }
}

export const youtubeComentarista: Comentarista = {
  network: 'youtube',
  // OAuth, no la API key: el conector lee con `key=` y comentar exige `youtube.force-ssl`.
  ensureCredential: (account) => ensureYoutubeCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const response = await fetch(
      `${API}/commentThreads?part=snippet&videoId=${postExternalId}&maxResults=50&order=time`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!response.ok) {
      const body = await response.text()
      // 403 con `commentsDisabled` es una respuesta normal: ese video no recibe
      // comentarios y no hay nada que sondear.
      if (response.status === 403 && body.includes('commentsDisabled')) return []
      throw new Error(`YouTube ${response.status}: ${body.slice(0, 200)}`)
    }
    const data = (await response.json()) as { items?: YouTubeThreadPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.items ?? []) {
      const c = normalizeYouTubeThread(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${API}/comments?part=snippet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { parentId: comentarioExternalId, textOriginal: recortar(texto, LIMITE) },
      }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`YouTube ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('YouTube no devolvió el id de la respuesta')
    return body.id
  },
}
