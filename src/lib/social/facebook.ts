import type { SocialAccount } from '@/db'
import {
  NO_ACCOUNT_METRICS,
  NO_METRICS,
  MAX_POSTS_PER_SYNC,
  type AccountMetricValues,
  type Connector,
  type FetchedBatch,
  type FetchedPost,
  type PostMetricValues,
} from './connector'
import { normalizeFacebookAccount } from './account-metrics'
import { decryptToken } from './crypto'

/** El `me/accounts?fields=id,name,access_token` payload. */
export type FacebookPageEntry = { id?: string; name?: string; access_token?: string }
export type FacebookPagesList = { data?: FacebookPageEntry[] }
export type FacebookPage = { id: string; name: string | null; accessToken: string | null }

/**
 * Why picking the page can fail loudly. `message` is always one of the fixed Spanish
 * sentences below — never upstream text — so the callback can show it as-is. The
 * candidates ride along separately for the server log: page names come from Meta, and
 * upstream text does not belong in anything the browser renders.
 */
export class FacebookPageError extends Error {
  constructor(
    message: string,
    public readonly candidates: FacebookPage[] = [],
  ) {
    super(message)
  }
}

// Carries the HTTP status alongside the message so callers can tell a 404 (a normal,
// per-post answer for insights) apart from anything systemic.
export class FacebookHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Whether Graph is telling us this one post has no insights, rather than that
 * something is wrong with the run. Anything that is not a 404 — expired token, rate
 * limit, 5xx — is systemic: swallowing it would silently write NO_METRICS as if it
 * were real data for every remaining post.
 */
export function isPostWithoutInsights(error: unknown): boolean {
  return error instanceof FacebookHttpError && error.status === 404
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new FacebookHttpError(
      response.status,
      `Facebook ${response.status}: ${body.slice(0, 200)}`,
    )
  }
  return response.json()
}

export const NO_FACEBOOK_PAGE = 'Esta cuenta no administra ninguna página de Facebook.'
export const AMBIGUOUS_FACEBOOK_PAGE =
  'Hay varias páginas de Facebook disponibles. Define FACEBOOK_PAGE_ID con el id de la que quieres conectar.'
export const PINNED_FACEBOOK_PAGE_MISSING =
  'FACEBOOK_PAGE_ID no coincide con ninguna de las páginas disponibles.'

/** Ids are numeric and assigned by Meta, so echoing them into the page is safe. */
export function pinnedPageMissingMessage(candidates: FacebookPage[]): string {
  const ids = candidates.map((candidate) => candidate.id).join(', ')
  return `${PINNED_FACEBOOK_PAGE_MISSING} Encontradas: ${ids}.`
}

/**
 * Taking the first page is only safe when there is exactly one: the order Meta lists
 * pages in is not a promise, and silently connecting a different page than last time
 * makes the next sync archive the previous page's whole catalogue (same argument as
 * `pickInstagramAccount`). When the answer is ambiguous this throws instead of
 * guessing, and `pinnedId` (from FACEBOOK_PAGE_ID) is how the owner disambiguates.
 */
export function pickFacebookPage(
  pages: FacebookPagesList,
  pinnedId?: string,
): FacebookPage {
  const candidates: FacebookPage[] = []
  for (const page of pages.data ?? []) {
    if (page.id) {
      candidates.push({
        id: page.id,
        name: page.name ?? null,
        accessToken: page.access_token ?? null,
      })
    }
  }

  if (pinnedId) {
    const pinned = candidates.find((candidate) => candidate.id === pinnedId)
    if (pinned) return pinned
    if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
    throw new FacebookPageError(pinnedPageMissingMessage(candidates), candidates)
  }

  if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
  if (candidates.length === 1) return candidates[0]!
  throw new FacebookPageError(AMBIGUOUS_FACEBOOK_PAGE, candidates)
}

export type FacebookPost = {
  id: string
  message?: string | null
  permalink_url?: string
  full_picture?: string
  created_time?: string
  attachments?: { data?: Array<{ media_type?: string }> }
  shares?: { count?: number }
  likes?: { summary?: { total_count?: number } }
  comments?: { summary?: { total_count?: number } }
}

export type FacebookInsights = {
  data?: Array<{
    name?: string
    values?: Array<{ value?: number | Record<string, number> }>
  }>
}

// post_impressions* died in the June 2026 deprecation — Graph now answers «must be a
// valid insights metric» — and these are their verified living successors.
const METRIC_NAMES: Record<string, keyof PostMetricValues> = {
  post_media_view: 'views',
  post_total_media_view_unique: 'reach',
}

// Reactions arrive as a by-type breakdown ({like, love, …}); their sum backs up the
// exact likes.summary count from the post object, which wins whenever both answer.
const REACTIONS_METRIC = 'post_reactions_by_type_total'

function mediaTypeOf(post: FacebookPost): string {
  const attached = post.attachments?.data?.[0]?.media_type
  if (attached === 'video') return 'video'
  if (attached === 'photo') return 'image'
  if (attached === 'album') return 'carousel'
  return 'link'
}

export function normalizeFacebookPost(
  post: FacebookPost,
  insights: FacebookInsights,
): FetchedPost {
  const metrics: PostMetricValues = { ...NO_METRICS }
  for (const entry of insights.data ?? []) {
    const value = entry.values?.[0]?.value
    if (entry.name === REACTIONS_METRIC && typeof value === 'object' && value !== null) {
      // A breakdown that came back empty is a post with zero reactions — a real zero.
      // The metric being absent altogether stays null: absent is not zero.
      metrics.likes = Object.values(value).reduce(
        (sum, count) => sum + (typeof count === 'number' ? count : 0),
        0,
      )
      continue
    }
    const key = entry.name ? METRIC_NAMES[entry.name] : undefined
    if (key && typeof value === 'number') metrics[key] = value
  }

  // The exact counts ride on the post object itself and override the insights-derived
  // reactions sum. `typeof` guards keep an absent count as null — absent is not zero.
  const likes = post.likes?.summary?.total_count
  const comments = post.comments?.summary?.total_count
  const shares = post.shares?.count
  if (typeof likes === 'number') metrics.likes = likes
  if (typeof comments === 'number') metrics.comments = comments
  if (typeof shares === 'number') metrics.shares = shares

  return {
    externalId: post.id,
    permalink: post.permalink_url ?? null,
    caption: post.message ?? null,
    thumbnailUrl: post.full_picture ?? null,
    mediaType: mediaTypeOf(post),
    publishedAt: new Date(post.created_time ?? 0),
    metrics,
  }
}

// Bounds page fetches independently of how many items a page actually yields: Graph
// can return an empty `data: []` while still handing back a `paging.next` cursor,
// which would otherwise starve the length check below and loop forever.
const MAX_POST_PAGES = 50

export async function collectPublishedPosts(
  firstUrl: string,
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
): Promise<{ posts: FacebookPost[]; windowWasCapped: boolean }> {
  const posts: FacebookPost[] = []
  let next = firstUrl
  let pagesFetched = 0

  while (next && posts.length < MAX_POSTS_PER_SYNC && pagesFetched < MAX_POST_PAGES) {
    const page = (await fetchJson(next)) as {
      data?: FacebookPost[]
      paging?: { next?: string }
    }
    pagesFetched++

    for (const item of page.data ?? []) {
      if (posts.length >= MAX_POSTS_PER_SYNC) break
      posts.push(item)
    }
    next = page.paging?.next ?? ''
  }

  // A cursor still in hand means the loop stopped at a ceiling, not at the end of the
  // page's posts. Hitting exactly MAX_POSTS_PER_SYNC counts too: items from the last
  // page get dropped once the array is full, whatever the cursor says.
  return { posts, windowWasCapped: posts.length >= MAX_POSTS_PER_SYNC || next !== '' }
}

const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_SIZE = 50
const INSIGHTS_CHUNK_SIZE = 5

export const facebookConnector: Connector = {
  network: 'facebook',

  /**
   * A page access token derived from a long-lived user token does not expire, so there
   * is nothing to refresh. If Meta invalidates it (password change, permissions
   * revoked), the Graph 190 lands in `lastSyncError`, the card turns red, and the
   * recovery path is reconnecting — same as every OAuth network here.
   */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    return decryptToken(account.accessToken)
  },

  async fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedBatch> {
    const pageId = account.externalId
    if (!token || !pageId) return { posts: [], windowWasCapped: false }

    // likes.summary/comments.summary answer (#10) unless the token carries
    // pages_read_user_content — granted since the Meta app gained the «Administrar
    // páginas» use case. A token from before that consent needs reconnecting.
    const fields =
      'id,message,permalink_url,full_picture,attachments{media_type},created_time,shares,likes.summary(true),comments.summary(true)'
    const first = `${GRAPH}/${pageId}/published_posts?fields=${fields}&limit=${PAGE_SIZE}&access_token=${token}`
    const { posts: fetched, windowWasCapped } = await collectPublishedPosts(first, getJson)

    const metrics = `post_media_view,post_total_media_view_unique,${REACTIONS_METRIC}`
    const posts: FetchedPost[] = []
    // Sequential chunks rather than one Promise.all over every post: up to 200
    // concurrent requests risks a 429, and a systemic insights failure aborts the whole
    // sync, so keeping concurrency low keeps that risk low. Wall-clock doesn't matter —
    // this runs once a day from a cron.
    for (let i = 0; i < fetched.length; i += INSIGHTS_CHUNK_SIZE) {
      const chunk = fetched.slice(i, i + INSIGHTS_CHUNK_SIZE)
      const chunkPosts = await Promise.all(
        chunk.map(async (item) => {
          let insights: FacebookInsights = {}
          try {
            insights = (await getJson(
              `${GRAPH}/${item.id}/insights?metric=${metrics}&access_token=${token}`,
            )) as FacebookInsights
          } catch (error) {
            if (isPostWithoutInsights(error)) {
              insights = {}
            } else {
              throw error
            }
          }
          return normalizeFacebookPost(item, insights)
        }),
      )
      posts.push(...chunkPosts)
    }

    return { posts, windowWasCapped }
  },

  /** Solo el nodo de la página: sus insights están deprecadas y responden vacío. */
  async fetchAccountMetrics(
    account: SocialAccount,
    token: string,
  ): Promise<AccountMetricValues> {
    const id = account.externalId
    if (!id) return NO_ACCOUNT_METRICS
    const profile = await getJson(
      `${GRAPH}/${id}?fields=followers_count,fan_count&access_token=${token}`,
    ).catch(() => ({}))
    return normalizeFacebookAccount(profile as never)
  },
}
