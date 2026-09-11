import { facebookConnector } from '../facebook'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
const LIMITE = 8000

export type FacebookCommentPayload = {
  id?: string
  message?: string
  created_time?: string
  from?: { id?: string; name?: string }
}

export function normalizeFacebookComment(
  raw: FacebookCommentPayload,
  postExternalId: string,
): ComentarioLeido | null {
  if (!raw.id) return null
  return {
    externalId: raw.id,
    postExternalId,
    // `from` viene vacío sin el permiso de identidad del comentarista; el comentario
    // sigue sirviendo, solo que sin nombre.
    author: raw.from?.name ?? null,
    authorExternalId: raw.from?.id ?? null,
    text: raw.message ?? '',
    publishedAt: new Date(raw.created_time ?? 0),
  }
}

async function pedir(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Facebook ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const facebookComentarista: Comentarista = {
  network: 'facebook',
  ensureCredential: (account) => facebookConnector.ensureCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const fields = 'id,message,created_time,from'
    const data = (await pedir(
      `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`,
    )) as { data?: FacebookCommentPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.data ?? []) {
      const c = normalizeFacebookComment(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${GRAPH}/${comentarioExternalId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: recortar(texto, LIMITE), access_token: token }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Facebook ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Facebook no devolvió el id de la respuesta')
    return body.id
  },
}
