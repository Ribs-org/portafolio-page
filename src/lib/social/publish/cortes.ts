import 'server-only'
import { and, asc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm'
import {
  getDb,
  postMetrics,
  scheduledPostMedia,
  scheduledPosts,
  scheduledPostTargets,
  socialAccounts,
  socialPosts,
} from '@/db'
import { miradasDe } from '@/lib/fuego'
import { addDays, dayKey } from '@/lib/schedule-week'
import { fromZonedInput } from '@/lib/utils'

// Las lecturas de El Fuego, atadas al dueño en cada `where` — nunca en el `on` de un
// join, que es lo que vigila el arnés de aislamiento (`src/lib/aislamiento.test.ts`).

/** Un corte tal como lo arma el calendario: el post, sus destinos con handle, y su media. */
export type CorteCargado = {
  post: typeof scheduledPosts.$inferSelect
  targets: Array<(typeof scheduledPostTargets.$inferSelect) & { handle: string | null }>
  media: Array<typeof scheduledPostMedia.$inferSelect>
}

/**
 * Lo que el calendario (`schedule/page.tsx`) armaba con su propia consulta: posts +
 * destinos + el handle de la cuenta por `leftJoin`, y la media en una segunda consulta
 * aparte. Vive acá para que El Fuego la comparta; `condiciones` acota sin cambiar la forma.
 *
 * El `leftJoin` con `socialAccounts` es a propósito: un destino cuya cuenta ya no exista
 * no debe desaparecer, debe seguir mostrándose por su red (ver `nombreDestino` en
 * `schedule/etiqueta.ts`). El dueño va al final del `where`, nunca en el `on` de ese join:
 * el arnés mira lo que queda tras el último «where» del SQL, y una subconsulta en
 * `condiciones` trae el suyo.
 */
async function cargar(ownerId: string, ...condiciones: SQL[]): Promise<CorteCargado[]> {
  const db = getDb()
  const rows = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets, handle: socialAccounts.handle })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .leftJoin(socialAccounts, eq(socialAccounts.id, scheduledPostTargets.accountId))
    .where(and(...condiciones, eq(scheduledPosts.ownerId, ownerId)))
    .orderBy(asc(scheduledPosts.scheduledAt))

  const posts = new Map<string, CorteCargado>()
  for (const row of rows) {
    const entry = posts.get(row.post.id) ?? { post: row.post, targets: [], media: [] }
    entry.targets.push({ ...row.target, handle: row.handle })
    posts.set(row.post.id, entry)
  }

  // Media en su propia consulta: unirla arriba multiplicaría filas post×destino×media
  // para nada, y solo hace falta la primera miniatura de cada post. Va por los ids que la
  // consulta de arriba ya filtró por dueño, como `post_metrics` en `getPostRows`.
  const ids = [...posts.keys()]
  if (ids.length > 0) {
    const media = await db
      .select()
      .from(scheduledPostMedia)
      .where(inArray(scheduledPostMedia.postId, ids))
      .orderBy(asc(scheduledPostMedia.position))
    for (const m of media) posts.get(m.postId)?.media.push(m)
  }

  return [...posts.values()]
}

/** Todo lo programado del dueño, sin ventana: es lo que el calendario siempre mostró. */
export function todosLosCortes(ownerId: string): Promise<CorteCargado[]> {
  return cargar(ownerId)
}

/** Los cortes con `scheduledAt` en `[desde, hasta)`, en orden de hora. */
export function cortesEntre(ownerId: string, desde: Date, hasta: Date): Promise<CorteCargado[]> {
  return cargar(ownerId, gte(scheduledPosts.scheduledAt, desde), lt(scheduledPosts.scheduledAt, hasta))
}

/**
 * Los cortes con algún destino que se quemó, sin ventana de fecha: un fallo viejo sigue
 * pidiendo la acción hasta que alguien lo reprograma. El corte viene entero, con todos
 * sus destinos, para que El Fuego lo muestre como en la parrilla.
 */
export function quemadosDe(ownerId: string): Promise<CorteCargado[]> {
  const db = getDb()
  const conFallo = db
    .select({ postId: scheduledPostTargets.postId })
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.status, 'failed'))
  return cargar(ownerId, inArray(scheduledPosts.id, conFallo))
}

/**
 * El pie de ayer: cuántos destinos salieron y, si el sync ya trajo métricas, cuántas
 * miradas sumaron. «Ayer» se calcula en la zona del sitio con `dayKey`/`addDays`
 * (`schedule-week.ts`) y se convierte a instantes reales con `fromZonedInput`
 * (`utils.ts`), la misma pareja que ya usa el compositor para leer/escribir horas locales.
 */
export async function servidosAyer(
  ownerId: string,
  now: Date,
  zone: string,
): Promise<{ servidos: number; miradas: number | null }> {
  const db = getDb()
  const hoy = dayKey(now, zone)
  const ayer = addDays(hoy, -1)
  // No pueden ser null: `hoy`/`ayer` salen de `dayKey`/`addDays`, que siempre producen
  // una clave `YYYY-MM-DD` válida, y esa es la única forma que `fromZonedInput` rechaza.
  const desde = fromZonedInput(`${ayer}T00:00`, zone)!
  const hasta = fromZonedInput(`${hoy}T00:00`, zone)!

  const destinos = await db
    .select({
      postId: scheduledPostTargets.postId,
      network: scheduledPostTargets.network,
      externalId: scheduledPostTargets.externalId,
    })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPosts.id, scheduledPostTargets.postId))
    .where(
      and(
        eq(scheduledPostTargets.status, 'published'),
        gte(scheduledPosts.scheduledAt, desde),
        lt(scheduledPosts.scheduledAt, hasta),
        eq(scheduledPosts.ownerId, ownerId),
      ),
    )

  // Cortes, no destinos: un corte a tres redes salió una vez, y el pie dice «cortes».
  const servidos = new Set(destinos.map((destino) => destino.postId)).size
  // Mismo cruce que `attributesFor` en `post-attributes.ts`: un id externo solo es único
  // dentro de su red, así que la llave es `red:externalId` y no el id a secas.
  const conId = destinos.filter((destino): destino is typeof destino & { externalId: string } => destino.externalId !== null)
  if (conId.length === 0) return { servidos, miradas: null }
  const llaves = new Set(conId.map((destino) => `${destino.network}:${destino.externalId}`))

  const posts = await db
    .select({ id: socialPosts.id, network: socialPosts.network, externalId: socialPosts.externalId })
    .from(socialPosts)
    .where(
      and(
        inArray(socialPosts.externalId, [...new Set(conId.map((destino) => destino.externalId))]),
        eq(socialPosts.ownerId, ownerId),
      ),
    )
  const postIds = posts.filter((post) => llaves.has(`${post.network}:${post.externalId}`)).map((post) => post.id)
  if (postIds.length === 0) return { servidos, miradas: null }

  const metricas = await db
    .select({ postId: postMetrics.postId, day: postMetrics.day, views: postMetrics.views })
    .from(postMetrics)
    .where(inArray(postMetrics.postId, postIds))

  return { servidos, miradas: miradasDe(metricas) }
}
