import 'server-only'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { getDb, postComments, reglasClave, scheduledPostTargets, socialAccounts, socialPosts } from '@/db'
import type { CommentState, DmState } from '@/db/schema'

const int = (fragment: SQL) => sql<number>`${fragment}`.mapWith(Number)

export const ESTADOS_COLA = ['pendientes', 'enviados', 'automaticas', 'descartados', 'todos'] as const
export type EstadoCola = (typeof ESTADOS_COLA)[number]

/** Lo pendiente incluye lo fallido: las dos cosas esperan un toque del dueño. */
const POR_ESTADO: Record<EstadoCola, CommentState[]> = {
  pendientes: ['pendiente', 'fallido'],
  enviados: ['enviado'],
  automaticas: ['pendiente', 'fallido', 'enviado', 'descartado'],
  descartados: ['descartado'],
  todos: ['pendiente', 'fallido', 'enviado', 'descartado'],
}

/** Tope de la cola en pantalla: más que esto no se revisa de una sentada. */
const MAX_FILAS = 200

export type ComentarioFila = {
  id: string
  network: string
  accountHandle: string | null
  author: string | null
  text: string
  publishedAt: Date
  draft: string | null
  draftError: string | null
  state: CommentState
  error: string | null
  replyExternalId: string | null
  dmState: DmState
  dmError: string | null
  postExternalId: string
  postCaption: string | null
  postThumbnailUrl: string | null
  postPermalink: string | null
  automatico: boolean
  reglaPalabra: string | null
}

export async function getCola(filtro: { estado: EstadoCola; red: string | null }): Promise<ComentarioFila[]> {
  const condiciones = [inArray(postComments.state, POR_ESTADO[filtro.estado])]
  if (filtro.red) condiciones.push(eq(postComments.network, filtro.red))
  if (filtro.estado === 'automaticas') condiciones.push(eq(postComments.automatico, true))
  const filas = await getDb()
    .select({
      id: postComments.id,
      network: postComments.network,
      accountHandle: socialAccounts.handle,
      author: postComments.author,
      text: postComments.text,
      publishedAt: postComments.publishedAt,
      draft: postComments.draft,
      draftError: postComments.draftError,
      state: postComments.state,
      error: postComments.error,
      replyExternalId: postComments.replyExternalId,
      dmState: postComments.dmState,
      dmError: postComments.dmError,
      postExternalId: postComments.postExternalId,
      postCaption: socialPosts.caption,
      postThumbnailUrl: socialPosts.thumbnailUrl,
      postPermalink: socialPosts.permalink,
      automatico: postComments.automatico,
      reglaPalabra: reglasClave.palabra,
    })
    .from(postComments)
    .leftJoin(socialAccounts, eq(socialAccounts.id, postComments.accountId))
    .leftJoin(
      socialPosts,
      and(eq(socialPosts.accountId, postComments.accountId), eq(socialPosts.externalId, postComments.postExternalId)),
    )
    .leftJoin(
      scheduledPostTargets,
      and(eq(scheduledPostTargets.accountId, postComments.accountId), eq(scheduledPostTargets.externalId, postComments.postExternalId)),
    )
    .leftJoin(reglasClave, eq(reglasClave.postId, scheduledPostTargets.postId))
    .where(and(...condiciones))
    .orderBy(desc(postComments.publishedAt))
    .limit(MAX_FILAS)
  return filas
}

export async function contarPendientes(red: string | null): Promise<number> {
  const condiciones = [inArray(postComments.state, POR_ESTADO.pendientes)]
  if (red) condiciones.push(eq(postComments.network, red))
  const [fila] = await getDb()
    .select({ total: int(sql`count(*)`) })
    .from(postComments)
    .where(and(...condiciones))
  return fila?.total ?? 0
}
