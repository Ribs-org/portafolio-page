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
  views: number | null
  viewsChange: number | null
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
  /** Visits over views: the fraction of the audience that actually arrived. */
  pull: number | null
}

export type PostKpis = {
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
 * Nulls contribute nothing to the sums: a metric the network never reported must
 * not become a zero that drags a total down.
 */
export function postKpisFrom(rows: PostRow[]): PostKpis {
  const sum = (pick: (row: PostRow) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0)

  const views = sum((r) => r.views)
  const visitTotal = sum((r) => r.visits)

  return {
    views,
    engagement: sum((r) => r.likes) + sum((r) => r.comments) + sum((r) => r.shares),
    visits: visitTotal,
    pull: views > 0 ? (visitTotal / views) * 100 : null,
  }
}
