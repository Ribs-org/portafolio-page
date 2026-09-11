// Qué publicaciones entran en una pasada del sondeo, y cómo se recorta un texto al
// límite de su red. Puro: sin base, sin red.

/** Coincide con el plazo del mensaje privado de Meta, que es lo que viene después. */
export const DIAS_VENTANA = 7
/**
 * El sondeo corre dentro de la corrida de publicación, que tiene 240 segundos y una
 * cadencia de cinco minutos: el tope es lo que impide que responder a tiempo le quite
 * el turno a publicar a tiempo.
 */
export const MAX_POSTS_POR_PASADA = 20

/** Los ids a sondear, del más nuevo al más viejo, ya acotados por ventana y por tope. */
export function postsAsondear(
  posts: Array<{ externalId: string; publishedAt: Date }>,
  now: Date,
): string[] {
  const desde = now.getTime() - DIAS_VENTANA * 864e5
  return posts
    .filter((post) => post.publishedAt.getTime() >= desde)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, MAX_POSTS_POR_PASADA)
    .map((post) => post.externalId)
}

/** Sin puntos suspensivos a propósito: esto se publica, no se muestra. */
export function recortar(texto: string, limite: number): string {
  return texto.trim().slice(0, limite)
}
