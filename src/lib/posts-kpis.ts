// Kept free of `server-only` on purpose: this is the one piece of the posts module
// that a unit test — and the client table's row type — can import directly, without
// dragging in the DB layer that the rest of `posts.ts` depends on.

export type PostRow = {
  id: string
  network: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: string
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
