import { and, asc, eq, inArray, lte, or } from 'drizzle-orm'
import {
  getDb,
  scheduledPostMedia,
  scheduledPosts,
  scheduledPostTargets,
  socialAccounts,
  users,
} from '@/db'
import { CONNECTORS } from '@/lib/social'
import { PUBLISHERS } from './index'
import { borrar } from '@/lib/storage'
import {
  NO_PUBLISH_TOKEN,
  PUBLISH_NETWORK_ERROR,
  STALE_PROCESSING,
  isStaleProcessing,
  mediaParaBorrar,
  resolveOutcome,
  type PublishOutcome,
} from './publisher'
import { sendFailureAlert } from './alert'
import type { OpcionesDestino } from './opciones'

export type Report = { published: number; processing: number; retried: number; deferred: number; failed: number }

/**
 * One cron run: advance every due target one step. Sequential on purpose — the volume
 * is one person's calendar, and the connectors already taught us that low concurrency
 * against Meta is the cheap way to never meet a 429.
 *
 * `soloPost` es el botón «Subir ahora» del calendario: restringe la corrida a los destinos
 * de ese post y no mira la hora, para publicar antes de lo programado. Pasa por aquí y no
 * por un camino propio a propósito — así hereda el reclamo de fila, los reintentos, el
 * aviso al dueño y, sobre todo, las opciones guardadas de cada destino.
 */
export async function publishDue(now: Date = new Date(), soloPost?: string): Promise<Report> {
  const db = getDb()
  const report: Report = { published: 0, processing: 0, retried: 0, deferred: 0, failed: 0 }
  const correoPorOwner = new Map<string, string | undefined>()

  const due = await db
    .select({ target: scheduledPostTargets, post: scheduledPosts })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(
      soloPost
        ? and(
            eq(scheduledPosts.id, soloPost),
            inArray(scheduledPostTargets.status, ['scheduled', 'publishing']),
          )
        : or(
            and(eq(scheduledPostTargets.status, 'scheduled'), lte(scheduledPosts.scheduledAt, now)),
            eq(scheduledPostTargets.status, 'publishing'),
          ),
    )
    .orderBy(asc(scheduledPosts.scheduledAt))

  for (const { target, post } of due) {
    let outcome: PublishOutcome

    // A cron run can outlive its own 5-minute interval (Meta hanging, cold DB), and
    // Vercel does not serialize invocations. Claiming the row first — an optimistic
    // update keyed on the updatedAt this run read — makes the loser skip instead of
    // double-publishing to the owner's real account.
    const claimed = await db
      .update(scheduledPostTargets)
      .set({ updatedAt: now })
      .where(
        and(
          eq(scheduledPostTargets.id, target.id),
          eq(scheduledPostTargets.updatedAt, target.updatedAt),
        ),
      )
      .returning({ id: scheduledPostTargets.id })
    if (claimed.length === 0) continue

    if (target.status === 'publishing' && isStaleProcessing(post.scheduledAt, now)) {
      // A video is stale when 24 hours have passed since its scheduled moment — an
      // anchor no poll refreshes (updatedAt now doubles as the claim token above).
      // Skipping the publisher counts the stale check itself as the failed attempt.
      outcome = { kind: 'failed', reason: STALE_PROCESSING }
    } else {
      outcome = await attempt(target, target.id, post.id, target.containerId, {
        caption: target.captionOverride ?? post.caption,
        coverUrl: post.coverUrl,
        opciones: (target.opciones as OpcionesDestino | null) ?? null,
      })
    }

    const patch = resolveOutcome(outcome, target.attemptCount)
    await db
      .update(scheduledPostTargets)
      .set({ ...patch, updatedAt: now })
      .where(eq(scheduledPostTargets.id, target.id))

    if (patch.status === 'published') {
      report.published++
      await limpiarMedia(post.id)
    } else if (patch.status === 'publishing') report.processing++
    else if (patch.status === 'scheduled') {
      // Mismo attemptCount que antes = la red pidió esperar (deferred): no es un reintento.
      if (patch.attemptCount === target.attemptCount) report.deferred++
      else report.retried++
    } else {
      report.failed++
      // Al dueño del post, no al del despliegue: el fallo es de su publicación.
      let correoDueno: string | undefined
      if (post.ownerId) {
        if (!correoPorOwner.has(post.ownerId)) {
          correoPorOwner.set(post.ownerId, await correoDelDueno(post.ownerId))
        }
        correoDueno = correoPorOwner.get(post.ownerId)
      }
      await sendFailureAlert(correoDueno, post.caption, target.network, patch.lastError ?? '')
    }
  }

  return report
}

/** El correo del dueño del post, para la alerta de fallo. Undefined si no existe la fila del dueño (post sin adoptar). */
async function correoDelDueno(ownerId: string): Promise<string | undefined> {
  const [fila] = await getDb().select({ correo: users.correo }).from(users).where(eq(users.id, ownerId)).limit(1)
  return fila?.correo ?? undefined
}

/**
 * Devuelve al almacenamiento el espacio del video cuando el post ya salió en todas
 * sus redes. Se llama tras cada destino publicado porque solo entonces puede haberse
 * completado el último; la regla de qué borrar vive en `mediaParaBorrar`.
 *
 * Falla en silencio a propósito: no poder borrar un archivo no es motivo para
 * arruinar una publicación que sí funcionó. Lo que quede se recupera la próxima vez
 * que el post pase por acá, o a mano.
 */
async function limpiarMedia(postId: string): Promise<void> {
  try {
    const db = getDb()
    const [targets, media] = await Promise.all([
      db
        .select({ status: scheduledPostTargets.status })
        .from(scheduledPostTargets)
        .where(eq(scheduledPostTargets.postId, postId)),
      db.select().from(scheduledPostMedia).where(eq(scheduledPostMedia.postId, postId)),
    ])

    for (const item of mediaParaBorrar(targets, media)) {
      await borrar(item.blobUrl)
      await db.delete(scheduledPostMedia).where(eq(scheduledPostMedia.id, item.id))
    }
  } catch (error) {
    console.error('No se pudo liberar la media publicada:', String(error).slice(0, 300))
  }
}

async function attempt(
  target: { network: string; accountId: string },
  targetId: string,
  postId: string,
  containerId: string | null,
  content: { caption: string; coverUrl: string | null; opciones: OpcionesDestino | null },
): Promise<PublishOutcome> {
  const db = getDb()
  const network = target.network
  const publisher = PUBLISHERS.find((p) => p.network === network)
  if (!publisher) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }
  // The publisher's own credential wins: YouTube reads with an API key but writes
  // with OAuth, and the read connector must not learn about writing.
  const connector = CONNECTORS.find((c) => c.network === network)
  const ensure = publisher.ensureCredential ?? connector?.ensureCredential
  if (!ensure) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }

  // Por la cuenta del destino: con dos páginas de Facebook, la red no dice cuál.
  const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, target.accountId))
  const token = account ? await ensure(account) : null
  if (!token || !account?.externalId) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }

  const media = await db
    .select()
    .from(scheduledPostMedia)
    .where(eq(scheduledPostMedia.postId, postId))
    .orderBy(asc(scheduledPostMedia.position))

  try {
    return await publisher.publish({
      caption: content.caption,
      media: media.map((m) => ({ url: m.blobUrl, mediaType: m.mediaType, position: m.position })),
      containerId,
      token,
      accountExternalId: account.externalId,
      coverUrl: content.coverUrl,
      opciones: content.opciones,
    })
  } catch (error) {
    // A publisher that throws (network hiccup, DNS, anything before Meta answered) is
    // a retryable failure, not a crash of the whole run.
    console.error(`Falló publicar el destino ${targetId}:`, error)
    return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
  }
}
