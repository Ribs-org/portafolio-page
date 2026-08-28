import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, postMetrics, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { localDay } from '../analytics'
import { env } from '../env'
import { postsToArchive } from './archive'
import { campaignTagFor } from './campaign'
import type { FetchedPost } from './connector'
import { CONNECTORS, connectorFor } from './index'

export type SyncReport = Array<{ network: string; ok: boolean; posts: number; error?: string }>

/**
 * YouTube has no OAuth to complete, so its account row is born the first time a sync
 * runs with the two variables present. The other two arrive through the callback.
 */
async function ensureYouTubeAccount(): Promise<void> {
  const channelId = env('YOUTUBE_CHANNEL_ID')
  if (!channelId || !env('YOUTUBE_API_KEY')) return

  await getDb()
    .insert(socialAccounts)
    .values({ network: 'youtube', externalId: channelId, handle: channelId })
    .onConflictDoUpdate({
      target: socialAccounts.network,
      set: { externalId: channelId },
    })
}

// The Postgres name drizzle-kit generates for `campaign: text().unique()` with no
// explicit name — confirmed against the live schema (see `pg_constraint`). Matching on
// it, not just the unique-violation code, is what keeps this fallback from swallowing an
// unrelated unique violation (e.g. a future constraint on the table) that should propagate.
const CAMPAIGN_UNIQUE_CONSTRAINT = 'social_posts_campaign_unique'

export function isCampaignUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const withPgFields = error as Error & { code?: string; constraint?: string }
  return withPgFields.code === '23505' && withPgFields.constraint === CAMPAIGN_UNIQUE_CONSTRAINT
}

/**
 * `campaignTagFor` collapses separators and truncates at 48 chars, so two different
 * native ids can — astronomically unlikely, but not structurally impossible — mint the
 * same tag; an owner can also hand-edit one post's tag onto a value another post already
 * generated. Either way, the fallback carves a short, deterministic suffix out of the
 * same 48-char budget so the retry lands on a tag nothing else already holds.
 */
function disambiguatedCampaignTag(network: string, externalId: string): string {
  const base = campaignTagFor(network, externalId)
  const suffix = createHash('sha256').update(`${network}:${externalId}`).digest('hex').slice(0, 6)
  return `${base.slice(0, base.length - suffix.length - 1)}-${suffix}`
}

async function insertOrUpdatePost(
  post: FetchedPost,
  network: string,
  campaign: string,
): Promise<string> {
  const [row] = await getDb()
    .insert(socialPosts)
    .values({
      network,
      externalId: post.externalId,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedAt: post.publishedAt,
      campaign,
    })
    .onConflictDoUpdate({
      target: [socialPosts.network, socialPosts.externalId],
      // `campaign` is deliberately absent: once the owner edits the tag, it is theirs.
      set: {
        permalink: post.permalink,
        caption: post.caption,
        thumbnailUrl: post.thumbnailUrl,
        mediaType: post.mediaType,
        publishedAt: post.publishedAt,
        archivedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: socialPosts.id })

  return row!.id
}

async function upsertPost(post: FetchedPost, network: string): Promise<string> {
  try {
    return await insertOrUpdatePost(post, network, campaignTagFor(network, post.externalId))
  } catch (error) {
    // A unique violation on `campaign` specifically is the one failure mode worth a
    // retry — see `disambiguatedCampaignTag`. Anything else (a dropped connection, a
    // constraint this doesn't anticipate) must still propagate and fail the sync.
    if (!isCampaignUniqueViolation(error)) throw error
    return await insertOrUpdatePost(post, network, disambiguatedCampaignTag(network, post.externalId))
  }
}

async function writeSnapshot(postId: string, post: FetchedPost, day: string): Promise<void> {
  await getDb()
    .insert(postMetrics)
    .values({ postId, day, ...post.metrics })
    .onConflictDoUpdate({
      target: [postMetrics.postId, postMetrics.day],
      set: { ...post.metrics, capturedAt: new Date() },
    })
}

export async function syncNetwork(network: string): Promise<number> {
  const db = getDb()
  const connector = connectorFor(network)
  if (!connector) throw new Error(`Unknown network ${network}`)

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.network, network))
  if (!account) return 0

  try {
    const token = await connector.ensureCredential(account as SocialAccount)

    // No credential is not a failure, it is a network the owner disconnected: the row
    // now outlives the token on purpose, so a disconnected network still has one to
    // find. Leaving before the writes below is what keeps its card from reading
    // "Sincronizado recién" under a Conectar button. YouTube reaches this the same way
    // when its API key is missing, and it had nothing to fetch in that case either.
    if (token === null) return 0

    const { posts: fetched, windowWasCapped } = await connector.fetchPosts(
      account as SocialAccount,
      token,
    )

    const day = localDay(new Date())
    for (const post of fetched) {
      const id = await upsertPost(post, network)
      await writeSnapshot(id, post, day)
    }

    const known = await db
      .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(and(eq(socialPosts.network, network), isNull(socialPosts.archivedAt)))

    // A truncated window is the connector's own answer, not something counted from here:
    // a known post that didn't come back can only be judged deleted once it falls inside
    // the window, and only the connector knows where that edge really is.
    const gone = postsToArchive(known, fetched, windowWasCapped)
    if (gone.length > 0) {
      await db
        .update(socialPosts)
        .set({ archivedAt: new Date() })
        .where(and(eq(socialPosts.network, network), inArray(socialPosts.externalId, gone)))
    }

    await db
      .update(socialAccounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: null })
      .where(eq(socialAccounts.id, account.id))

    return fetched.length
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // `lastSyncedAt` deliberately untouched: this run fetched nothing, and stamping it
    // would leave the card reading "Sincronizado recién" over an empty day.
    await db
      .update(socialAccounts)
      .set({ lastSyncError: message.slice(0, 500) })
      .where(eq(socialAccounts.id, account.id))
    throw error
  }
}

/**
 * Every network runs on its own. A connector that throws leaves its error on its own
 * account row and the others still finish and store their snapshot — which is the whole
 * reason it was defensible to take on three integrations at once.
 */
export async function syncAll(): Promise<SyncReport> {
  const results = await Promise.allSettled(
    CONNECTORS.map(async (connector) => {
      // Inside the settled slot, not before it: awaited outside, an unreachable DB or a
      // constraint surprise here would reject syncAll and cost Instagram and TikTok the
      // day's snapshot too, over a row neither of them uses.
      if (connector.network === 'youtube') await ensureYouTubeAccount()
      return syncNetwork(connector.network)
    }),
  )

  return CONNECTORS.map((connector, i) => {
    const result = results[i]!
    return result.status === 'fulfilled'
      ? { network: connector.network, ok: true, posts: result.value }
      : {
          network: connector.network,
          ok: false,
          posts: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
  })
}
