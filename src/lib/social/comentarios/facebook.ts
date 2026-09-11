import { facebookConnector } from '../facebook'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { GRAPH_OBJETO_AUSENTE, codigoGraph, pedirGraph } from './graph'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
const LIMITE = 8000
// Salvaguarda de cuota y de tiempo, no promesa de completitud: lo de la página seis se ve en la pasada siguiente.
const MAX_PAGINAS = 5

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
  const fecha = new Date(raw.created_time ?? '')
  return {
    externalId: raw.id,
    postExternalId,
    // `from` viene vacío sin el permiso de identidad del comentarista; el comentario
    // sigue sirviendo, solo que sin nombre.
    author: raw.from?.name ?? null,
    authorExternalId: raw.from?.id ?? null,
    text: raw.message ?? '',
    // Sin fecha de la red, la del descubrimiento: 1970 hundiría la fila al fondo de la cola.
    publishedAt: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
  }
}

export const facebookComentarista: Comentarista = {
  network: 'facebook',
  ensureCredential: (account) => facebookConnector.ensureCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const fields = 'id,message,created_time,from'
    // El borde de comentarios va del más viejo al más nuevo: con una sola página, una
    // publicación de más de cincuenta comentarios nunca dejaría ver los nuevos.
    let url = `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`
    const leidos: ComentarioLeido[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const data = (await pedirGraph('Facebook', url)) as {
        data?: FacebookCommentPayload[]
        paging?: { next?: string }
      }
      for (const raw of data.data ?? []) {
        const c = normalizeFacebookComment(raw, postExternalId)
        if (c) leidos.push(c)
      }
      // La url del cursor ya viene firmada y con los campos: se usa tal cual.
      const siguiente = data.paging?.next
      if (!siguiente) break
      url = siguiente
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
      // Se mira el código y no el estado: al objeto borrado Graph le contesta 400, no 404.
      if (codigoGraph(body) === GRAPH_OBJETO_AUSENTE) throw new Error(COMENTARIO_AUSENTE)
      throw new Error(`Facebook ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Facebook no devolvió el id de la respuesta')
    return body.id
  },
}
