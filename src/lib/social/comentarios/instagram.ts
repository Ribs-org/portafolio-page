import { instagramConnector } from '../instagram'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
/** El mismo tope que un caption: Graph rechaza más. */
const LIMITE = 2200

export type InstagramCommentPayload = {
  id?: string
  text?: string
  timestamp?: string
  username?: string
  from?: { id?: string; username?: string }
}

/** Null cuando el payload no trae id: sin identidad no hay fila que insertar. */
export function normalizeInstagramComment(
  raw: InstagramCommentPayload,
  postExternalId: string,
): ComentarioLeido | null {
  if (!raw.id) return null
  const usuario = raw.from?.username ?? raw.username ?? null
  return {
    externalId: raw.id,
    postExternalId,
    author: usuario ? `@${usuario}` : null,
    authorExternalId: raw.from?.id ?? null,
    // La columna es NOT NULL y un comentario puede ser solo una imagen o un sticker.
    text: raw.text ?? '',
    publishedAt: new Date(raw.timestamp ?? 0),
  }
}

async function pedir(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Instagram ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const instagramComentarista: Comentarista = {
  network: 'instagram',
  // Lee y comenta con la misma credencial; `instagram_manage_comments` es lo que
  // habilita ambas cosas sobre la propia cuenta. Envuelto en una flecha y no pasado por
  // referencia, para que el método conserve su `this` si algún día lo necesita.
  ensureCredential: (account) => instagramConnector.ensureCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const fields = 'id,text,timestamp,username,from'
    const data = (await pedir(
      `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`,
    )) as { data?: InstagramCommentPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.data ?? []) {
      const c = normalizeInstagramComment(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${GRAPH}/${comentarioExternalId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: recortar(texto, LIMITE), access_token: token }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Instagram ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Instagram no devolvió el id de la respuesta')
    return body.id
  },
}
