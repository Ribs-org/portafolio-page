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
/** La cadencia del cron que llama a esto: de ahí sale el desplazamiento de la rotación. */
const PASADA_MS = 5 * 60_000

/** Los ids a sondear, del más nuevo al más viejo, ya acotados por ventana y por tope. */
export function postsAsondear(
  posts: Array<{ externalId: string; publishedAt: Date }>,
  now: Date,
): string[] {
  const desde = now.getTime() - DIAS_VENTANA * 864e5
  const dentro = posts
    .filter((post) => post.publishedAt.getTime() >= desde)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  if (dentro.length <= MAX_POSTS_POR_PASADA) return dentro.map((post) => post.externalId)

  // Con más publicaciones que cupo, quedarse siempre con las más nuevas dejaría a la
  // número 21 sin sondear jamás. El desplazamiento sale del reloj —una pasada cada cinco
  // minutos— así que en pasadas sucesivas se recorre la ventana entera.
  const pasada = Math.floor(now.getTime() / PASADA_MS)
  const inicio = (pasada * MAX_POSTS_POR_PASADA) % dentro.length
  const rotadas = [...dentro.slice(inicio), ...dentro.slice(0, inicio)]
  return rotadas.slice(0, MAX_POSTS_POR_PASADA).map((post) => post.externalId)
}

/** Sin puntos suspensivos a propósito: esto se publica, no se muestra. */
export function recortar(texto: string, limite: number): string {
  // Por puntos de código y no por unidades UTF-16: cortar a la mitad de un emoji deja
  // medio carácter, y esto es lo último que pasa antes de publicar. El segundo trim es
  // para que un corte no deje un espacio colgando al final.
  return [...texto.trim()].slice(0, limite).join('').trim()
}
