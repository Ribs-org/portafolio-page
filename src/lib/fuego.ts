import { dayKey } from '@/lib/schedule-week'
import { formatNumber } from '@/lib/utils'

// Lo que El Fuego decide, sin tocar la base: qué es «hoy», cuál es el siguiente corte, qué
// se quemó, y qué dice el pie (cuántos cortes y cuántas miradas). La página solo compone;
// esto se prueba con fixtures.

/**
 * Lo mínimo que estas funciones necesitan de un corte. Las tres que seleccionan son
 * genéricas sobre esta forma y devuelven lo que recibieron: la lectura real
 * (`CorteCargado`, en `social/publish/cortes.ts`) trae además la media y el handle de cada
 * destino, y la pantalla los pinta. Estrechar a `Corte` en la salida obligaría a la página
 * a volver a ensanchar con un cast.
 */
export type Corte = {
  post: { id: string; caption: string; scheduledAt: Date }
  targets: Array<{
    id: string
    network: string
    handle: string | null
    status: string
    externalId: string | null
    opciones: unknown
    lastError: string | null
  }>
}

/** Lo programado para hoy en la zona del sitio, salido o no, en orden de hora. */
export function cortesDeHoy<T extends Corte>(cortes: T[], now: Date, zone: string): T[] {
  const hoy = dayKey(now, zone)
  return cortes
    .filter((c) => dayKey(c.post.scheduledAt, zone) === hoy)
    .sort((a, b) => a.post.scheduledAt.getTime() - b.post.scheduledAt.getTime())
}

/** El primer corte después de ahora, o null: «la parrilla está fría» hacia adelante. */
export function siguienteCorte<T extends Corte>(cortes: T[], now: Date): T | null {
  const futuros = cortes
    .filter((c) => c.post.scheduledAt.getTime() > now.getTime())
    .sort((a, b) => a.post.scheduledAt.getTime() - b.post.scheduledAt.getTime())
  return futuros[0] ?? null
}

/** Cada destino que se quemó, con su corte: es lo único de El Fuego que pide una acción. */
export function quemados<T extends Corte>(cortes: T[]): Array<{ corte: T; destino: T['targets'][number] }> {
  return cortes.flatMap((corte) =>
    corte.targets.filter((t) => t.status === 'failed').map((destino) => ({ corte, destino })),
  )
}

/**
 * El pie de la pantalla. Las miradas solo cuando el sync ya las trajo: un cero inventado
 * diría «nadie miró» cuando lo cierto es «todavía no se sabe».
 */
export function pieDeAyer(servidos: number, miradas: number | null): string {
  if (servidos === 0) return 'Ayer no salió nada.'
  const cortes = servidos === 1 ? '1 corte servido' : `${servidos} cortes servidos`
  return miradas === null ? `Ayer: ${cortes}` : `Ayer: ${cortes} · ${formatNumber(miradas)} miradas`
}

/**
 * Las miradas de ayer a partir de las filas de `post_metrics` de esos posts: el último
 * día disponible por post, sumado. `day` es un `date` de Postgres, que Drizzle entrega
 * como texto `YYYY-MM-DD` — comparable con `>` tal cual, como ya hace `social/delta.ts`.
 * Un cero inventado es distinto de «no se sabe»: solo hay número si al menos un post trajo
 * uno de verdad (la red puede no reportar vistas y dejarlo en null).
 */
export function miradasDe(metricas: Array<{ postId: string; day: string; views: number | null }>): number | null {
  const ultimoPorPost = new Map<string, { day: string; views: number | null }>()
  for (const fila of metricas) {
    const actual = ultimoPorPost.get(fila.postId)
    if (!actual || fila.day > actual.day) ultimoPorPost.set(fila.postId, { day: fila.day, views: fila.views })
  }
  let miradas = 0
  let algunaMetrica = false
  for (const { views } of ultimoPorPost.values()) {
    if (views !== null) {
      miradas += views
      algunaMetrica = true
    }
  }
  return algunaMetrica ? miradas : null
}
