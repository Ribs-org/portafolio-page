import { and, asc, eq, lte, or } from 'drizzle-orm'
import {
  getDb,
  scheduledPostMedia,
  scheduledPosts,
  scheduledPostTargets,
  socialAccounts,
} from '@/db'
import { CONNECTORS } from '@/lib/social'
import { PUBLISHERS } from './index'
import {
  NO_PUBLISH_TOKEN,
  PUBLISH_NETWORK_ERROR,
  STALE_PROCESSING,
  isStaleProcessing,
  resolveOutcome,
  type PublishOutcome,
} from './publisher'
import { sendFailureAlert } from './alert'

type Report = { published: number; processing: number; retried: number; failed: number }

/**
 * One cron run: advance every due target one step. Sequential on purpose — the volume
 * is one person's calendar, and the connectors already taught us that low concurrency
 * against Meta is the cheap way to never meet a 429.
 */
export async function publishDue(now: Date = new Date()): Promise<Report> {
  const db = getDb()
  const report: Report = { published: 0, processing: 0, retried: 0, failed: 0 }

  const due = await db
    .select({ target: scheduledPostTargets, post: scheduledPosts })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(
      or(
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
      outcome = await attempt(target.network, target.id, post.id, target.containerId, {
        caption: target.captionOverride ?? post.caption,
      })
    }

    const patch = resolveOutcome(outcome, target.attemptCount)
    await db
      .update(scheduledPostTargets)
      .set({ ...patch, updatedAt: now })
      .where(eq(scheduledPostTargets.id, target.id))

    if (patch.status === 'published') report.published++
    else if (patch.status === 'publishing') report.processing++
    else if (patch.status === 'scheduled') report.retried++
    else {
      report.failed++
      await sendFailureAlert(post.caption, target.network, patch.lastError ?? '')
    }
  }

  return report
}

async function attempt(
  network: string,
  targetId: string,
  postId: string,
  containerId: string | null,
  content: { caption: string },
): Promise<PublishOutcome> {
  const db = getDb()
  const publisher = PUBLISHERS.find((p) => p.network === network)
  if (!publisher) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }
  // The publisher's own credential wins: YouTube reads with an API key but writes
  // with OAuth, and the read connector must not learn about writing.
  const connector = CONNECTORS.find((c) => c.network === network)
  const ensure = publisher.ensureCredential ?? connector?.ensureCredential
  if (!ensure) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.network, network))
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
    })
  } catch (error) {
    // A publisher that throws (network hiccup, DNS, anything before Meta answered) is
    // a retryable failure, not a crash of the whole run.
    console.error(`Falló publicar el destino ${targetId}:`, error)
    return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
  }
}
