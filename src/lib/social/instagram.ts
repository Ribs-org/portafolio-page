import type { SocialAccount } from '@/db'
import {
  MAX_POSTS_PER_SYNC,
  NO_METRICS,
  type Connector,
  type FetchedPost,
  type PostMetricValues,
} from './connector'
import { decryptToken } from './crypto'

const GRAPH = 'https://graph.instagram.com/v23.0'
const PAGE_SIZE = 50
// Bounds page fetches independently of how many items a page actually yields: Instagram
// can return an empty `data: []` while still handing back a `paging.next` cursor, which
// would otherwise starve the media.length check below and loop forever.
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
   * A long-lived token lasts 60 days and is refreshed by use, so the daily cron keeps
   * it alive on its own. Refreshing a week early leaves room for a few missed runs.
   */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    const token = decryptToken(account.accessToken)

    const expiresSoon =
      !account.expiresAt || account.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS
    if (!expiresSoon) return token

    let refreshed: { access_token?: string; expires_in?: number } = {}
    try {
      refreshed = (await getJson(
        `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
      )) as { access_token?: string; expires_in?: number }
    } catch {
      // The current token isn't expired yet — only within the refresh window — so a
      // transient failure here (network blip, Instagram 5xx) should fall back to it
      // rather than discard a perfectly usable credential, same as the case below where
      // Instagram answers OK but omits access_token.
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

  async fetchPosts(_account: SocialAccount, token: string | null): Promise<FetchedPost[]> {
    if (!token) return []

    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp'
    const media: InstagramMedia[] = []
    let next = `${GRAPH}/me/media?fields=${fields}&limit=${PAGE_SIZE}&access_token=${token}`
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
    return posts
  },
}
