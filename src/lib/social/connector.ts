import type { SocialAccount } from '@/db'

export type PostMetricValues = {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  reach: number | null
}

export type FetchedPost = {
  externalId: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: Date
  metrics: PostMetricValues
}

/**
 * The only thing the orchestrator knows about a network. Everything network-specific —
 * field names, pagination, auth dance — stays inside the implementation.
 */
export type Connector = {
  network: string
  /** Returns the usable credential, refreshing it first when it is close to expiring. */
  ensureCredential(account: SocialAccount): Promise<string | null>
  fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedPost[]>
}

/**
 * The shared ceiling every connector pages up to. One place so the orchestrator can
 * compare a fetch's length against it to tell a truncated window from a full one —
 * see `postsToArchive`, which needs that distinction to judge deletions safely.
 */
export const MAX_POSTS_PER_SYNC = 200

/** Every metric absent — the starting point a connector fills in with what it has. */
export const NO_METRICS: PostMetricValues = {
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  reach: null,
}
