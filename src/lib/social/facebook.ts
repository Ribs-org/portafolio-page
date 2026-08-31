import {
  NO_METRICS,
  type FetchedPost,
  type PostMetricValues,
} from './connector'

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
  data?: Array<{ name?: string; values?: Array<{ value?: number }> }>
}

const METRIC_NAMES: Record<string, keyof PostMetricValues> = {
  post_impressions: 'views',
  post_impressions_unique: 'reach',
}

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
    const key = entry.name ? METRIC_NAMES[entry.name] : undefined
    const value = entry.values?.[0]?.value
    if (key && typeof value === 'number') metrics[key] = value
  }

  // Unlike Instagram, the engagement counts ride on the post object itself, not on
  // insights. `typeof` guards keep an absent count as null — absent is not zero.
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
