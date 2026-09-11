import { instagramConnector } from '../instagram'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { GRAPH_OBJETO_AUSENTE, codigoGraph, pedirGraph } from './graph'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
/** El mismo tope que un caption: Graph rechaza más. */
const LIMITE = 2200
// Salvaguarda de cuota y de tiempo, no promesa de completitud: lo de la página seis se ve en la pasada siguiente.
const MAX_PAGINAS = 5

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
  const fecha = new Date(raw.timestamp ?? '')
  return {
    externalId: raw.id,
    postExternalId,
    author: usuario ? `@${usuario}` : null,
    authorExternalId: raw.from?.id ?? null,
    // La columna es NOT NULL y un comentario puede ser solo una imagen o un sticker.
    text: raw.text ?? '',
    // Sin fecha de la red, la del descubrimiento: 1970 hundiría la fila al fondo de la cola.
    publishedAt: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
  }
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
    // El borde de comentarios va del más viejo al más nuevo: con una sola página, una
    // publicación de más de cincuenta comentarios nunca dejaría ver los nuevos.
    let url = `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`
    const leidos: ComentarioLeido[] = []
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const data = (await pedirGraph('Instagram', url)) as {
        data?: InstagramCommentPayload[]
        paging?: { next?: string }
      }
      for (const raw of data.data ?? []) {
        const c = normalizeInstagramComment(raw, postExternalId)
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
    const response = await fetch(`${GRAPH}/${comentarioExternalId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: recortar(texto, LIMITE), access_token: token }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      // Se mira el código y no el estado: al objeto borrado Graph le contesta 400, no 404.
      if (codigoGraph(body) === GRAPH_OBJETO_AUSENTE) throw new Error(COMENTARIO_AUSENTE)
      throw new Error(`Instagram ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Instagram no devolvió el id de la respuesta')
    return body.id
  },
}
