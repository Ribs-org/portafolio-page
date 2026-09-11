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
  ): Promise<PostAjeno[]>
}

/** Lo único que el dueño llega a leer cuando una cuenta de su lista dejó de ser legible. */
export const AUTOR_ILEGIBLE = 'No se pudo leer esta cuenta.'

/** Lo único que el dueño llega a leer cuando el gasto del día llegó a su techo. */
export const TOPE_ALCANZADO = 'Se alcanzó el tope de lecturas de hoy.'
