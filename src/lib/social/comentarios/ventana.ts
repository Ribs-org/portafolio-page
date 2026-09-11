// Qué publicaciones entran en una pasada del sondeo, a qué redes les toca, con qué estado
// entra un comentario y cómo se recorta un texto al límite de su red. Puro: sin base, sin
// red.

import type { CommentState } from '@/db/schema'

/** Coincide con el plazo del mensaje privado de Meta, que es lo que viene después. */
export const DIAS_VENTANA = 7
/**
 * El sondeo corre dentro de la corrida de publicación, que tiene 240 segundos y una
 * cadencia de cinco minutos: el tope es lo que impide que responder a tiempo le quite
 * el turno a publicar a tiempo.
 */
export const MAX_POSTS_POR_PASADA = 20
/** El cron publica antes de sondear y `maxDuration` son 240 s: al sondeo le toca la mitad, porque publicar a tiempo manda. */
export const MAX_MS_POR_CORRIDA = 120_000
/** La cadencia del cron que llama a esto: de ahí sale el desplazamiento de la rotación. */
const PASADA_MS = 5 * 60_000
/**
 * Cada cuántas pasadas le toca a YouTube: una de cada seis, o sea media hora.
 * `commentThreads.list` no acepta varios videoId, así que son veinte llamadas por pasada;
 * en las 288 pasadas del día eso es casi 6.000 unidades de una cuota diaria de 10.000 que
 * el sondeo comparte con el sync de métricas de `social/youtube.ts`. Agotarla no solo
 * dejaría la cola sin comentarios: también tumbaría las métricas del día siguiente. Y
 * como el dueño aprueba cada respuesta a mano, media hora de espera no le cuesta nada.
 */
export const PASADAS_YOUTUBE = 6

/**
 * Los ids a sondear, ya acotados por ventana y por tope: de la más nueva a la más vieja y,
 * cuando hay más publicaciones que tope, con el punto de partida rotado por pasada para que
 * ninguna se quede sin mirar.
 */
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

/**
 * Si la corrida ya gastó su mitad del presupuesto y lo que falta queda para la pasada
 * siguiente. Las cuentas se recorren siempre en el mismo orden, así que un corte deja
 * afuera siempre a las mismas: por eso el reporte lleva cuántas quedaron sin sondear.
 */
export function seAcaboElTiempo(inicioMs: number, ahoraMs: number): boolean {
  return ahoraMs - inicioMs >= MAX_MS_POR_CORRIDA
}

/** Si a esta red le toca sondeo en la pasada en que cae `now`. */
export function tocaSondear(network: string, now: Date): boolean {
  if (network !== 'youtube') return true
  return Math.floor(now.getTime() / PASADA_MS) % PASADAS_YOUTUBE === 0
}

/**
 * Con qué estado entra un comentario recién leído. Un comentario del propio dueño es su
 * propia respuesta: entra al historial, pero nunca a la cola.
 */
export function estadoInicial(
  autorExternalId: string | null,
  cuentaExternalId: string | null,
): CommentState {
  // Si a alguno de los dos la red no le dio id, no hay con qué reconocer al dueño: a la
  // cola, que es donde el error se ve y se descarta a mano.
  if (!autorExternalId || !cuentaExternalId) return 'pendiente'
  return autorExternalId === cuentaExternalId ? 'propio' : 'pendiente'
}

/** Sin puntos suspensivos a propósito: esto se publica, no se muestra. */
export function recortar(texto: string, limite: number): string {
  // Por puntos de código y no por unidades UTF-16: cortar a la mitad de un emoji deja
  // medio carácter, y esto es lo último que pasa antes de publicar. El segundo trim es
  // para que un corte no deje un espacio colgando al final.
  return [...texto.trim()].slice(0, limite).join('').trim()
}
