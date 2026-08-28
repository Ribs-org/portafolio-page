import type { SocialAccount } from '@/db'
import { env } from '../env'
import {
  MAX_POSTS_PER_SYNC,
  NO_METRICS,
  type Connector,
  type FetchedBatch,
  type FetchedPost,
  type PostMetricValues,
} from './connector'
import { decryptToken } from './crypto'

// Instagram API with Facebook Login, not Instagram Login: the owner's app lives in a
// Meta business portfolio, and instagram.com/oauth/authorize only ever answered
// "rol de desarrollador insuficiente" for it. Everything — token exchange, account
// discovery, media, insights — goes through the Facebook Graph host instead.
const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_SIZE = 50
// Bounds page fetches independently of how many items a page actually yields: the Graph
// API can return an empty `data: []` while still handing back a `paging.next` cursor,
// which would otherwise starve the media.length check below and loop forever.
const MAX_MEDIA_PAGES = 50
const INSIGHTS_CHUNK_SIZE = 5
const REFRESH_WINDOW_MS = 7 * 864e5

export type InstagramMedia = {
  id: string
  caption?: string | null
  media_type?: string
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
}

export type InstagramInsights = {
  data?: Array<{ name?: string; values?: Array<{ value?: number }> }>
}

/** The `me/accounts?fields=name,instagram_business_account{id,username}` payload. */
export type FacebookPages = {
  data?: Array<{
    id?: string
    name?: string
    instagram_business_account?: { id?: string; username?: string } | null
  }>
}

export type InstagramAccount = { id: string; username: string | null }

/**
 * Why picking the account can fail loudly. `message` is always one of the fixed Spanish
 * sentences below — never upstream text — so the callback can show it as-is. The
 * candidates ride along separately for the server log: usernames come from Meta, and
 * upstream text does not belong in anything the browser renders.
 */
export class InstagramAccountError extends Error {
  constructor(
    message: string,
    public readonly candidates: InstagramAccount[] = [],
  ) {
    super(message)
  }
}

export const NO_INSTAGRAM_ACCOUNT =
  'Ninguna página de Facebook tiene una cuenta de Instagram asociada.'
export const AMBIGUOUS_INSTAGRAM_ACCOUNT =
  'Hay varias cuentas de Instagram disponibles. Define INSTAGRAM_IG_USER_ID con el id de la que quieres conectar.'
export const PINNED_INSTAGRAM_ACCOUNT_MISSING =
  'INSTAGRAM_IG_USER_ID no coincide con ninguna de las cuentas de Instagram disponibles.'

/**
 * Finds the Instagram account behind the owner's Facebook Pages.
 *
 * Facebook Login hands back Pages, not Instagram accounts: the Instagram user id the
 * whole sync is keyed on only exists as a nested field on whichever Page owns it, and
 * most Pages carry none at all.
 *
 * Taking the first candidate is only safe when there is exactly one. The owner has
 * several Instagram accounts, and the order Meta lists Pages in is not a promise —
 * a Page added or removed can change it. Silently connecting a different account than
 * last time is not a cosmetic error: `sync.ts` would fetch account B's media, find every
 * post of account A missing from it, and archive A's whole back catalogue in one
 * statement. Reconnecting to A afterwards only un-archives what still fits in the newest
 * `MAX_POSTS_PER_SYNC`; anything older stays archived for good. So when the answer is
 * ambiguous this throws instead of guessing, and `pinnedId` (from INSTAGRAM_IG_USER_ID)
 * is how the owner makes it unambiguous.
 */
export function pickInstagramAccount(
  pages: FacebookPages,
  pinnedId?: string,
): InstagramAccount {
  const candidates: InstagramAccount[] = []
  for (const page of pages.data ?? []) {
    const linked = page.instagram_business_account
    if (linked?.id) candidates.push({ id: linked.id, username: linked.username ?? null })
  }

  if (pinnedId) {
    const pinned = candidates.find((candidate) => candidate.id === pinnedId)
    if (!pinned) throw new InstagramAccountError(PINNED_INSTAGRAM_ACCOUNT_MISSING, candidates)
    return pinned
  }

  if (candidates.length === 0) throw new InstagramAccountError(NO_INSTAGRAM_ACCOUNT)
  if (candidates.length === 1) return candidates[0]!
  throw new InstagramAccountError(AMBIGUOUS_INSTAGRAM_ACCOUNT, candidates)
}

const METRIC_NAMES: Record<string, keyof PostMetricValues> = {
  views: 'views',
  reach: 'reach',
  likes: 'likes',
  comments: 'comments',
  saved: 'saves',
  shares: 'shares',
}

/** REELS and VIDEO both arrive as media_type VIDEO; only the product type separates them. */
function mediaType(media: InstagramMedia): string {
  if (media.media_product_type === 'REELS') return 'reel'
  if (media.media_type === 'CAROUSEL_ALBUM') return 'carousel'
  if (media.media_type === 'VIDEO') return 'video'
  return 'image'
}

export function normalizeInstagramMedia(
  media: InstagramMedia,
  insights: InstagramInsights,
): FetchedPost {
  const metrics: PostMetricValues = { ...NO_METRICS }
  for (const entry of insights.data ?? []) {
    const key = entry.name ? METRIC_NAMES[entry.name] : undefined
    const value = entry.values?.[0]?.value
    if (key && typeof value === 'number') metrics[key] = value
  }

  return {
    externalId: media.id,
    permalink: media.permalink ?? null,
    caption: media.caption ?? null,
    thumbnailUrl: media.thumbnail_url ?? media.media_url ?? null,
    mediaType: mediaType(media),
    publishedAt: new Date(media.timestamp ?? 0),
    metrics,
  }
}

// Carries the HTTP status alongside the message so callers can tell a 404 (a normal,
// expected answer for some Instagram endpoints) apart from anything else.
class InstagramHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new InstagramHttpError(
      response.status,
      `Instagram ${response.status}: ${(await response.text()).slice(0, 200)}`,
    )
  }
  return response.json()
}

export const instagramConnector: Connector = {
  network: 'instagram',

  /**
   * A long-lived Facebook token lasts about 60 days. There is no refresh token in this
   * flow: the only way to extend it is to hand it back through `fb_exchange_token`,
   * which returns a fresh 60-day token. Doing that a week early leaves room for a few
   * missed cron runs before the credential dies for good.
   */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    const token = decryptToken(account.accessToken)

    const expiresSoon =
      !account.expiresAt || account.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS
    if (!expiresSoon) return token

    // Unlike the Instagram Login refresh, this exchange is signed with the app
    // credentials. Missing ones can't be recovered from here, and the stored token is
    // still valid for up to a week, so hand it back rather than fail the whole sync.
    const appId = env('INSTAGRAM_APP_ID')
    const appSecret = env('INSTAGRAM_APP_SECRET')
    if (!appId || !appSecret) return token

    const exchange = new URL(`${GRAPH}/oauth/access_token`)
    exchange.searchParams.set('grant_type', 'fb_exchange_token')
    exchange.searchParams.set('client_id', appId)
    exchange.searchParams.set('client_secret', appSecret)
    exchange.searchParams.set('fb_exchange_token', token)

    let refreshed: { access_token?: string; expires_in?: number } = {}
    try {
      refreshed = (await getJson(exchange.toString())) as {
        access_token?: string
        expires_in?: number
      }
    } catch {
      // The current token isn't expired yet — only within the refresh window — so a
      // transient failure here (network blip, Graph 5xx) should fall back to it rather
      // than discard a perfectly usable credential, same as the case below where the
      // Graph API answers OK but omits access_token.
      return token
    }

    if (!refreshed.access_token) return token

    const { getDb, socialAccounts } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { encryptToken } = await import('./crypto')

    await getDb()
      .update(socialAccounts)
      .set({
        accessToken: encryptToken(refreshed.access_token),
        expiresAt: new Date(Date.now() + (refreshed.expires_in ?? 5184000) * 1000),
      })
      .where(eq(socialAccounts.id, account.id))

    return refreshed.access_token
  },

  async fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedBatch> {
    // Under Facebook Login the token belongs to the person, not to one Instagram
    // account, so there is no `me/media` to fall back on: without the id the callback
    // stored there is nothing to ask about.
    const igUserId = account.externalId
    if (!token || !igUserId) return { posts: [], windowWasCapped: false }

    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp'
    const media: InstagramMedia[] = []
    let next = `${GRAPH}/${igUserId}/media?fields=${fields}&limit=${PAGE_SIZE}&access_token=${token}`
    let pagesFetched = 0

    while (next && media.length < MAX_POSTS_PER_SYNC && pagesFetched < MAX_MEDIA_PAGES) {
      const page = (await getJson(next)) as {
        data?: InstagramMedia[]
        paging?: { next?: string }
      }
      pagesFetched++

      for (const item of page.data ?? []) {
        if (media.length >= MAX_POSTS_PER_SYNC) break
        media.push(item)
      }
      next = page.paging?.next ?? ''
    }

    const metrics = 'views,reach,likes,comments,saved,shares'
    const posts: FetchedPost[] = []
    // Sequential chunks rather than one Promise.all over every post: up to MAX_POSTS_PER_SYNC
    // concurrent requests risks a 429 from the Graph API, and since a non-404 insights
    // failure now aborts the whole sync (see below), keeping concurrency low keeps that
    // risk low. Wall-clock doesn't matter — this runs once a day from a cron.
    for (let i = 0; i < media.length; i += INSIGHTS_CHUNK_SIZE) {
      const chunk = media.slice(i, i + INSIGHTS_CHUNK_SIZE)
      const chunkPosts = await Promise.all(
        chunk.map(async (item) => {
          let insights: InstagramInsights = {}
          try {
            insights = (await getJson(
              `${GRAPH}/${item.id}/insights?metric=${metrics}&access_token=${token}`,
            )) as InstagramInsights
          } catch (error) {
            // A 404 means Instagram has no insights for this specific post (too old, or
            // a media type insights don't cover) — a normal answer, not a failure.
            // Anything else (expired token, rate limit, 5xx) is systemic: swallowing it
            // too would silently write NO_METRICS as if it were real data for every
            // remaining post, since fetchPosts reuses the same token throughout.
            if (error instanceof InstagramHttpError && error.status === 404) {
              insights = {}
            } else {
              throw error
            }
          }
          return normalizeInstagramMedia(item, insights)
        }),
      )
      posts.push(...chunkPosts)
    }

    // A cursor still in hand means the paging loop stopped at a ceiling, not at the end
    // of the account's media. Hitting exactly MAX_POSTS_PER_SYNC counts too: items from
    // the last page get dropped once the array is full, whatever the cursor says.
    return {
      posts,
      windowWasCapped: media.length >= MAX_POSTS_PER_SYNC || next !== '',
    }
  },
}
