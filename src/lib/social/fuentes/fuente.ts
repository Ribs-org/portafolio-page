/** Un post ajeno ya normalizado. Sin media: la ficha es texto y su enlace al original. */
export type PostAjeno = {
  externalId: string
  url: string
  authorHandle: string
  text: string
  publishedAt: Date
}

/**
 * Una plataforma de la que se leen ideas ajenas. Misma forma que CONNECTORS, PUBLISHERS y
 * COMENTARISTAS: agregar YouTube o Reddit es un archivo y una línea en el índice.
 *
 * `traer` recibe el tope de cuántas publicaciones puede leer en esta llamada, porque quien
 * llama lleva la cuenta del gasto del día y la fuente no tiene por qué conocerla. Recibe
 * también el username además del id: la llamada va por id, pero el enlace al original se
 * arma con el nombre, y quien llama tiene los dos a mano.
 */
export type Fuente = {
  network: string
  resolverAutor(username: string): Promise<string>
  traer(
    externalId: string,
    username: string,
    sinceId: string | null,
    tope: number,
  ): Promise<Traida>
}

/** Lo que una fuente entrega en una pasada. `leidas` es lo que la red cobró, que no es lo
 * mismo que lo que sobrevivió al normalizador; `masNuevo` permite avanzar la marca aunque
 * no sobreviviera ninguna. */
export type Traida = {
  posts: PostAjeno[]
  leidas: number
  masNuevo: string | null
}

/** Lo único que el dueño llega a leer cuando una cuenta de su lista dejó de ser legible. */
export const AUTOR_ILEGIBLE = 'No se pudo leer esta cuenta.'

/** Menos de esto X no entrega: una página recortada haría saltar la marca sobre lo no visto. */
export const MIN_LECTURAS = 5
