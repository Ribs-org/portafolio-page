// Kept free of `server-only` on purpose: these are the pieces of the posts module that
// a unit test — and the two client components under `admin/content` — can import
// directly, without dragging in the DB layer that the rest of `posts.ts` depends on.

export type ConnectionRow = {
  network: string
  handle: string | null
  /**
   * The account the sync actually fetches for. Shown on the card because a handle looks
   * right even when the id underneath belongs to a different account, and that mismatch
   * is what archives a catalogue.
   */
  externalId: string | null
  connected: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  /** YouTube is configured by environment and has no button. */
  usesOAuth: boolean
}

export type PostRow = {
  id: string
  network: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  /**
   * Already formatted, in SITE_TIMEZONE. A raw timestamp would be formatted twice by
   * the client component that renders it — once on the server, once in the browser —
   * in two different zones, and the day boundary belongs to neither of them.
   */
  publishedLabel: string
  campaign: string
  /** Deleted on the network. Hidden unless the view asks for them. */
  archived: boolean
  /** Cumulative at the end of the period — the lifetime counter the table shows. */
  views: number | null
  /** How much each cumulative counter grew inside the period. */
  viewsChange: number | null
  likesChange: number | null
  commentsChange: number | null
  sharesChange: number | null
  isNew: boolean
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  reach: number | null
  /** null when the tag has never been seen in a visit — the link was never pasted. */
  visits: number | null
  uniques: number | null
  clicks: number | null
  ctr: number | null
  /**
   * Period visits over the views *gained* in that same period: the fraction of the
   * audience a post reached this period that actually arrived. Dividing by the
   * lifetime counter instead would compare a window against a total, so a reel from
   * six months ago would always understate and would move whenever the range changed.
   */
  pull: number | null
}

export type PostKpis = {
  /** Views gained inside the period, not the lifetime total. */
  views: number
  engagement: number
  visits: number
  pull: number | null
}

/**
 * Sums the rows behind the KPI tiles above the table. Pure and synchronous so the
 * page can derive both the tiles and the table from a single `getPostRows` call —
 * summing separately would run the whole query set twice, and could disagree with
 * the table whenever the archived filter differs between the two calls.
 *
 * Everything here is period-scoped, and deliberately so: visits are counted inside
 * the window, so the platform side has to be too. Summing the lifetime counters
 * instead would put a six-month-old reel's whole history against thirty days of
 * traffic, and the arrastre that comes out of that division means nothing.
 *
 * Nulls contribute nothing to the sums: a metric the network never reported must
 * not become a zero that drags a total down.
 */
export function postKpisFrom(rows: PostRow[]): PostKpis {
  const sum = (pick: (row: PostRow) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0)

  const views = sum((r) => r.viewsChange)
  const visitTotal = sum((r) => r.visits)

  return {
    views,
    engagement:
      sum((r) => r.likesChange) + sum((r) => r.commentsChange) + sum((r) => r.sharesChange),
    visits: visitTotal,
    pull: views > 0 ? (visitTotal / views) * 100 : null,
  }
}

/**
 * The rows still live on the network. Everything the notices count is scoped through
 * here: telling someone to paste a link into a post they already deleted, or that a
 * deleted post is missing metrics, is advice they cannot act on.
 */
export function activeRows(rows: PostRow[]): PostRow[] {
  return rows.filter((row) => !row.archived)
}

/**
 * Posts whose tag has never appeared in a visit. `null` is the query layer's way of
 * saying "never seen"; a pasted tag that nobody clicked comes back as `0`, and that
 * post needs no nudge — the link is already where it belongs.
 */
export function unpastedCount(rows: PostRow[]): number {
  return activeRows(rows).filter((row) => row.visits === null).length
}

/**
 * True when the network reported none of the three metrics the table shows. Instagram
 * withholds insights for anything published before the account became professional, so
 * whole stretches of an older catalogue land here at once.
 *
 * Only `views`, `likes` and `comments` are consulted: no column renders `shares`,
 * `saves` or `reach`, so a row carrying one of those and nothing else would still read
 * as blank to the person looking at it.
 */
export function hasNoPlatformMetrics(row: PostRow): boolean {
  return row.views === null && row.likes === null && row.comments === null
}

export function withoutPlatformMetricsCount(rows: PostRow[]): number {
  return activeRows(rows).filter(hasNoPlatformMetrics).length
}

/**
 * Drops the rows the network reported nothing about, keeping archived state alone —
 * the metrics filter answers "can I compare this row against the others", which is a
 * different question from whether the post still exists.
 */
export function withPlatformMetrics(rows: PostRow[]): PostRow[] {
  return rows.filter((row) => !hasNoPlatformMetrics(row))
}

/**
 * The posts that gained the most views inside the period, best first.
 *
 * Strictly greater than zero: a post that gained nothing is not a top post, and `null`
 * (no reading at all) is not a zero — neither belongs in a ranking of growth. Ties keep
 * the order they arrived in, which is `getPostRows`' own recency ordering.
 */
export function topPostsByGain(rows: PostRow[], limit: number): PostRow[] {
  if (limit <= 0) return []

  return activeRows(rows)
    .filter((row) => row.viewsChange !== null && row.viewsChange > 0)
    .sort((a, b) => (b.viewsChange ?? 0) - (a.viewsChange ?? 0))
    .slice(0, limit)
}
