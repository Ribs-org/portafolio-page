import 'server-only'
import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { accountMetrics, getDb, postMetrics, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { localDay } from '../analytics'
import { env } from '../env'
import { postsToArchive } from './archive'
import { campaignTagFor, type CuentaTag } from './campaign'
import type { FetchedPost } from './connector'
import { primariaDe } from './cuenta'
import { connectorFor } from './index'

export type SyncReport = Array<{ network: string; handle: string | null; ok: boolean; posts: number; error?: string }>

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
      target: [socialAccounts.network, socialAccounts.externalId],
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
function disambiguatedCampaignTag(network: string, externalId: string, cuenta?: CuentaTag): string {
  const base = campaignTagFor(network, externalId, cuenta)
  const suffix = createHash('sha256').update(`${network}:${externalId}`).digest('hex').slice(0, 6)
  return `${base.slice(0, base.length - suffix.length - 1)}-${suffix}`
}

async function insertOrUpdatePost(
  post: FetchedPost,
  account: SocialAccount,
  campaign: string,
): Promise<string> {
  const [row] = await getDb()
    .insert(socialPosts)
    .values({
      network: account.network,
      accountId: account.id,
      externalId: post.externalId,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedAt: post.publishedAt,
      campaign,
    })
    .onConflictDoUpdate({
      target: [socialPosts.accountId, socialPosts.externalId],
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

async function upsertPost(post: FetchedPost, account: SocialAccount, cuenta: CuentaTag): Promise<string> {
  try {
    return await insertOrUpdatePost(post, account, campaignTagFor(account.network, post.externalId, cuenta))
  } catch (error) {
    // A unique violation on `campaign` specifically is the one failure mode worth a
    // retry — see `disambiguatedCampaignTag`. Anything else (a dropped connection, a
    // constraint this doesn't anticipate) must still propagate and fail the sync.
    if (!isCampaignUniqueViolation(error)) throw error
    return await insertOrUpdatePost(
      post,
      account,
      disambiguatedCampaignTag(account.network, post.externalId, cuenta),
    )
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

export async function syncAccount(account: SocialAccount, primaria: boolean): Promise<number> {
  const db = getDb()
  const connector = connectorFor(account.network)
  if (!connector) throw new Error(`Unknown network ${account.network}`)
  const cuenta: CuentaTag = { primaria, handle: account.handle, externalId: account.externalId }

  try {
    const token = await connector.ensureCredential(account)

    // No credential is not a failure, it is an account the owner disconnected: the row
    // outlives the token on purpose, so a disconnected account still has one to find.
    // Leaving before the writes below is what keeps its card from reading
    // "Sincronizado recién" under a Conectar button.
    if (token === null) return 0

    const { posts: fetched, windowWasCapped } = await connector.fetchPosts(account, token)

    const day = localDay(new Date())
    for (const post of fetched) {
      const id = await upsertPost(post, account, cuenta)
      await writeSnapshot(id, post, day)
    }

    // Extra deliberado: las métricas de cuenta nunca deben tumbar la sincronización
    // de publicaciones que sí funcionó, así que su fallo muere acá mismo.
    if (connector.fetchAccountMetrics) {
      try {
        const values = await connector.fetchAccountMetrics(account, token)
        await db
          .insert(accountMetrics)
          .values({ network: account.network, accountId: account.id, day, ...values })
          .onConflictDoUpdate({
            target: [accountMetrics.accountId, accountMetrics.day],
            set: { ...values, capturedAt: new Date() },
          })
      } catch (error) {
        console.error(`[sync] métricas de cuenta de ${account.network}:`, String(error).slice(0, 300))
      }
    }

    // Solo los posts de ESTA cuenta: con dos cuentas en la misma red, comparar contra
    // toda la red archivaría el catálogo de la otra, que nunca aparece en este fetch.
    const known = await db
      .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(and(eq(socialPosts.accountId, account.id), isNull(socialPosts.archivedAt)))

    // A truncated window is the connector's own answer, not something counted from here:
    // a known post that didn't come back can only be judged deleted once it falls inside
    // the window, and only the connector knows where that edge really is.
    const gone = postsToArchive(known, fetched, windowWasCapped)
    if (gone.length > 0) {
      await db
        .update(socialPosts)
        .set({ archivedAt: new Date() })
        .where(and(eq(socialPosts.accountId, account.id), inArray(socialPosts.externalId, gone)))
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
 * Every account runs on its own. One that throws leaves its error on its own row and
 * the others still finish and store their snapshot — which is the whole reason it was
 * defensible to take on several integrations at once.
 */
export async function syncAll(): Promise<SyncReport> {
  // Antes del resto y por su cuenta: una base inalcanzable acá no debe costarle el
  // snapshot del día a las demás, así que su fallo se registra y se sigue.
  try {
    await ensureYouTubeAccount()
  } catch (error) {
    console.error('[sync] no se pudo asegurar la cuenta de YouTube:', String(error).slice(0, 300))
  }

  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .orderBy(asc(socialAccounts.createdAt))
  // Solo las redes con conector: una fila de threads o x se sincroniza el día que
  // exista su conector, no antes.
  const conConector = cuentas.filter((c) => connectorFor(c.network))
  const porRed = new Map<string, SocialAccount[]>()
  for (const cuenta of conConector) porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta])

  const results = await Promise.allSettled(
    conConector.map((cuenta) => syncAccount(cuenta, primariaDe(porRed.get(cuenta.network)!) === cuenta.id)),
  )

  return conConector.map((cuenta, i) => {
    const result = results[i]!
    return result.status === 'fulfilled'
      ? { network: cuenta.network, handle: cuenta.handle, ok: true, posts: result.value }
      : {
          network: cuenta.network,
          handle: cuenta.handle,
          ok: false,
          posts: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
  })
}
