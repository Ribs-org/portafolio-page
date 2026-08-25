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

export type FetchedBatch = {
  posts: FetchedPost[]
  /**
   * The connector stopped at a ceiling of its own instead of reaching the end of the
   * catalogue, so what it returned is a window, not everything. `postsToArchive` needs
   * this to tell "deleted" from "beyond the edge of what we asked for".
   *
   * Only the connector can answer it. The orchestrator used to infer it from
   * `posts.length >= MAX_POSTS_PER_SYNC`, which YouTube quietly broke: it collects up to
   * 200 *ids* from `playlistItems` and then builds posts from `videos.list`, which omits
   * private and deleted videos. One unavailable video in the newest 200 returned 199,
   * read as an exhaustive fetch, and archived every older post — permanently, since
   * those posts sit beyond the cap and never come back to clear `archivedAt`.
   */
  windowWasCapped: boolean
}

/**
 * The only thing the orchestrator knows about a network. Everything network-specific —
 * field names, pagination, auth dance — stays inside the implementation.
 */
export type Connector = {
  network: string
  /** Returns the usable credential, refreshing it first when it is close to expiring. */
  ensureCredential(account: SocialAccount): Promise<string | null>
  fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedBatch>
}

/** The shared ceiling every connector pages up to. */
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
