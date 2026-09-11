import 'server-only'
import { and, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb, postComments, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { connectorFor } from '../index'
import { comentaristaFor } from './index'
import { DIAS_VENTANA, postsAsondear } from './ventana'

export type SondeoReport = Array<{
  network: string
  handle: string | null
  posts: number
  nuevos: number
  error?: string
}>

async function sondearCuenta(
  account: SocialAccount,
  now: Date,
): Promise<{ posts: number; nuevos: number }> {
  const comentarista = comentaristaFor(account.network)
  if (!comentarista) return { posts: 0, nuevos: 0 }
  const db = getDb()

  // La credencial del comentarista cuando difiere de la de lectura, y si no la del
  // conector: el mismo molde que usa `attempt` en publish/run.ts.
  const ensure = comentarista.ensureCredential ?? connectorFor(account.network)?.ensureCredential
  const token = ensure ? await ensure(account) : null
  // Sin credencial no es un fallo: es una cuenta que el dueño desconectó, o una red
  // cuyo permiso nuevo todavía no autorizó. Se sale antes de tocar la red.
  if (!token) return { posts: 0, nuevos: 0 }

  // Las publicaciones ya están en la base: la sincronización diaria las trajo. El sondeo
  // no vuelve a preguntarle a la red cuáles son.
  const desde = new Date(now.getTime() - DIAS_VENTANA * 864e5)
  const recientes = await db
    .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.accountId, account.id),
        isNull(socialPosts.archivedAt),
        gte(socialPosts.publishedAt, desde),
      ),
    )
    .orderBy(desc(socialPosts.publishedAt))

  const ids = postsAsondear(recientes, now)
  if (ids.length === 0) return { posts: 0, nuevos: 0 }

  // Todos los comentarios ya conocidos de esta cuenta en esos posts, de una consulta:
  // preguntar por cada comentario sería una consulta por comentario y por pasada.
  const conocidos = new Set(
    (
      await db
        .select({ externalId: postComments.externalId })
        .from(postComments)
        .where(and(eq(postComments.accountId, account.id), inArray(postComments.postExternalId, ids)))
    ).map((fila) => fila.externalId),
  )

  let nuevos = 0
  for (const postExternalId of ids) {
    const leidos = await comentarista.listar(account, token, postExternalId)
    const frescos = leidos.filter((c) => !conocidos.has(c.externalId))
    if (frescos.length === 0) continue

    await db
      .insert(postComments)
      .values(
        frescos.map((c) => ({
          accountId: account.id,
          network: account.network,
          postExternalId: c.postExternalId,
          externalId: c.externalId,
          author: c.author,
          authorExternalId: c.authorExternalId,
          text: c.text,
          publishedAt: c.publishedAt,
          // Un comentario del propio dueño es su propia respuesta: entra al historial
          // pero nunca a la cola.
          state:
            c.authorExternalId && c.authorExternalId === account.externalId
              ? ('propio' as const)
              : ('pendiente' as const),
        })),
      )
      // Dos pasadas que se solapan verían los mismos comentarios; la unique decide y la
      // segunda no pisa nada.
      .onConflictDoNothing({ target: [postComments.externalId, postComments.accountId] })
    for (const c of frescos) conocidos.add(c.externalId)
    nuevos += frescos.length
  }

  return { posts: ids.length, nuevos }
}

/**
 * Una pasada de descubrimiento. Corre dentro de la corrida de publicación, después de
 * publicar: el fallo de una cuenta no detiene a las demás, y ninguno detiene la corrida.
 */
export async function sondearComentarios(now: Date = new Date()): Promise<SondeoReport> {
  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .where(isNotNull(socialAccounts.accessToken))

  const conComentarista = cuentas.filter((cuenta) => comentaristaFor(cuenta.network))
  const reporte: SondeoReport = []
  // En serie, como la sincronización: la casa nunca pega concurrente contra Meta.
  for (const cuenta of conComentarista) {
    try {
      const { posts, nuevos } = await sondearCuenta(cuenta, now)
      reporte.push({ network: cuenta.network, handle: cuenta.handle, posts, nuevos })
    } catch (error) {
      console.error(`[comentarios] ${cuenta.network}:`, String(error).slice(0, 300))
      reporte.push({
        network: cuenta.network,
        handle: cuenta.handle,
        posts: 0,
        nuevos: 0,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      })
    }
  }
  return reporte
}
