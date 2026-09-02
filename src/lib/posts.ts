import 'server-only'
import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { clicks, getDb, postMetrics, SOCIAL_NETWORKS, socialAccounts, socialPosts, visits } from '@/db'
import type { Filters, Granularity } from './analytics'
import { SITE_TIMEZONE, describe, granularityFor, localDay } from './analytics'
import {
  postKpisFrom,
  type ConnectionRow,
  type PostKpis,
  type PostRow,
} from './posts-kpis'
import { periodChange, type Snapshot } from './social/delta'

// Re-exported so server call sites only need one import line; the types and the pure
// summing function actually live in `posts-kpis.ts`, which stays free of
// `server-only` so a test file can import it without pulling in the DB layer.
// Client components must import them from there directly, not from here.
export type { ConnectionRow, PostKpis, PostRow }
export { postKpisFrom }

export type CampaignPost = {
  network: string
  caption: string | null
  thumbnailUrl: string | null
  permalink: string | null
}

const int = (fragment: SQL) => sql<number>`${fragment}`.mapWith(Number)

/**
 * The publication date as the table shows it. Formatted here rather than in the client
 * component: that component renders on the server first (in the runtime's zone, UTC on
 * Vercel) and then in the browser (in the viewer's), so a post published at 02:00 UTC
 * read "25 ago" on one side and "24 ago" on the other — a hydration mismatch, and a day
 * boundary drawn outside SITE_TIMEZONE either way.
 */
const PUBLISHED = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  timeZone: SITE_TIMEZONE,
})

export async function getPostRows(f: Filters, includeArchived = false): Promise<PostRow[]> {
  const db = getDb()
  const from = localDay(f.from)
  const to = localDay(f.to)

  const posts = await db
    .select()
    .from(socialPosts)
    .where(includeArchived ? undefined : isNull(socialPosts.archivedAt))
    .orderBy(desc(socialPosts.publishedAt))
    .limit(200)

  if (posts.length === 0) return []

  const ids = posts.map((p) => p.id)
  const campaigns = posts.map((p) => p.campaign)

  // Every snapshot from before the window too: the baseline for a period's growth is
  // the last reading *before* it, which by definition falls outside the range.
  const snapshots = await db
    .select()
    .from(postMetrics)
    .where(and(inArray(postMetrics.postId, ids), lte(postMetrics.day, to)))

  const byPost = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const list = byPost.get(snapshot.postId) ?? []
    list.push(snapshot)
    byPost.set(snapshot.postId, list)
  }

  const visitConds: SQL[] = [
    gte(visits.createdAt, f.from),
    lte(visits.createdAt, f.to),
    inArray(visits.campaign, campaigns),
  ]
  if (f.profileId) visitConds.push(eq(visits.profileId, f.profileId))
  if (!f.includeBots) visitConds.push(eq(visits.isBot, false))

  const visitRows = await db
    .select({
      campaign: sql<string>`${visits.campaign}`,
      total: int(sql`count(*)`),
      uniques: int(sql`count(distinct ${visits.visitorHash})`),
    })
    .from(visits)
    .where(and(...visitConds))
    .groupBy(visits.campaign)

  const clickConds: SQL[] = [
    gte(clicks.createdAt, f.from),
    lte(clicks.createdAt, f.to),
    inArray(visits.campaign, campaigns),
  ]
  if (f.profileId) clickConds.push(eq(clicks.profileId, f.profileId))
  if (!f.includeBots) clickConds.push(eq(clicks.isBot, false))

  const clickRows = await db
    .select({ campaign: sql<string>`${visits.campaign}`, total: int(sql`count(*)`) })
    .from(clicks)
    .innerJoin(visits, eq(clicks.visitId, visits.id))
    .where(and(...clickConds))
    .groupBy(visits.campaign)

  // A tag with no traffic *ever* means the link was never pasted, which reads as "—".
  // A tag with traffic before but none this period is a real zero.
  const everSeen = await db
    .selectDistinct({ campaign: sql<string>`${visits.campaign}` })
    .from(visits)
    .where(inArray(visits.campaign, campaigns))

  const seen = new Set(everSeen.map((r) => r.campaign))
  const visitMap = new Map(visitRows.map((r) => [r.campaign, r]))
  const clickMap = new Map(clickRows.map((r) => [r.campaign, r.total]))

  return posts.map((post) => {
    const list = byPost.get(post.id) ?? []
    const snapshotsOf = (key: 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach'): Snapshot[] =>
      list.map((s) => ({ day: s.day, value: s[key] }))

    const views = periodChange(snapshotsOf('views'), from, to)
    const likes = periodChange(snapshotsOf('likes'), from, to)
    const comments = periodChange(snapshotsOf('comments'), from, to)
    const shares = periodChange(snapshotsOf('shares'), from, to)
    const pasted = seen.has(post.campaign)
    const traffic = visitMap.get(post.campaign)
    const visitCount = pasted ? (traffic?.total ?? 0) : null
    const clickCount = pasted ? (clickMap.get(post.campaign) ?? 0) : null

    return {
      id: post.id,
      network: post.network,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedLabel: PUBLISHED.format(post.publishedAt),
      campaign: post.campaign,
      archived: post.archivedAt !== null,
      views: views.current,
      viewsChange: views.change,
      likesChange: likes.change,
      commentsChange: comments.change,
      sharesChange: shares.change,
      isNew: views.isNew,
      likes: likes.current,
      comments: comments.current,
      shares: shares.current,
      saves: periodChange(snapshotsOf('saves'), from, to).current,
      reach: periodChange(snapshotsOf('reach'), from, to).current,
      visits: visitCount,
      uniques: pasted ? (traffic?.uniques ?? 0) : null,
      clicks: clickCount,
      ctr:
        visitCount !== null && visitCount > 0 && clickCount !== null
          ? (clickCount / visitCount) * 100
          : null,
      // Against the views *gained* this period, never the lifetime counter: the
      // visits above are counted inside the window, so the divisor has to be too.
      // A post that gained nothing yields null, which is the honest answer.
      pull:
        views.change !== null && views.change > 0 && visitCount !== null
          ? (visitCount / views.change) * 100
          : null,
    }
  })
}

export type PostSeriesPoint = {
  bucket: string
  label: string
  fullLabel: string
  views: number
  visits: number
}

/**
 * Snapshots are captured once a day, so an hourly bucket has nothing to put in 23 of
 * every 24 slots — the day's whole gain would pile up at midnight and the rest of the
 * chart would read as a flat zero. A day is the finest this series can honestly draw,
 * whatever the range asks for.
 */
function seriesGranularity(f: Filters): Granularity {
  const unit = granularityFor(f)
  return unit === 'hour' ? 'day' : unit
}

/**
 * Views gained per bucket against the visits they drove.
 *
 * The `lag` window is what turns cumulative counters into daily gains, and the
 * `greatest(0, …)` absorbs the downward revisions Instagram occasionally publishes.
 *
 * Those daily gains are computed first and only then rolled up into the chosen bucket.
 * Subtracting a week's edge snapshots instead would look equivalent and isn't: a post
 * that grew and was then revised down inside the same week would come out understated,
 * or negative, because the `greatest(0, …)` would never see the individual days.
 */
export async function getPostSeries(f: Filters): Promise<PostSeriesPoint[]> {
  const tz = SITE_TIMEZONE
  const unit = seriesGranularity(f)
  const interval = unit === 'day' ? '1 day' : '1 week'
  const from = localDay(f.from)
  const to = localDay(f.to)

  const query = sql`
    with span as (
      select generate_series(
        date_trunc(${unit}, ${f.from}::timestamptz at time zone ${tz}),
        date_trunc(${unit}, ${f.to}::timestamptz at time zone ${tz}),
        ${interval}::interval
      ) as bucket
    ),
    gains as (
      select m.day,
             greatest(0, m.views - lag(m.views) over (partition by m.post_id order by m.day)) as gained
      from ${postMetrics} m
      join ${socialPosts} p on p.id = m.post_id
      where p.archived_at is null and m.views is not null and m.day <= ${to}
    ),
    g as (
      select date_trunc(${unit}, day::timestamp) as bucket, sum(gained)::int as total
      from gains where day >= ${from} group by 1
    ),
    v as (
      select date_trunc(${unit}, vi.created_at at time zone ${tz}) as bucket, count(*) as total
      from ${visits} vi
      join ${socialPosts} p on p.campaign = vi.campaign
      where vi.created_at >= ${f.from} and vi.created_at <= ${f.to}
        ${f.profileId ? sql`and vi.profile_id = ${f.profileId}` : sql``}
        ${f.includeBots ? sql`` : sql`and vi.is_bot = false`}
      group by 1
    )
    select to_char(span.bucket, 'YYYY-MM-DD') as bucket,
           coalesce(g.total, 0)::int as views,
           coalesce(v.total, 0)::int as visits
    from span
    left join g on g.bucket = span.bucket
    left join v on v.bucket = span.bucket
    order by span.bucket
  `

  const result = await getDb().execute(query)
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{
    bucket: string
    views: number
    visits: number
  }>

  return rows.map((row) => ({
    bucket: row.bucket,
    ...describe(row.bucket, unit),
    views: Number(row.views),
    visits: Number(row.visits),
  }))
}

// TikTok is the one network left without a publisher; YouTube reads by env but writes by OAuth.
const OAUTH_NETWORKS = new Set(['instagram', 'tiktok', 'facebook', 'youtube', 'threads', 'x'])

export async function getConnections(): Promise<ConnectionRow[]> {
  const accounts = await getDb().select().from(socialAccounts)
  const byNetwork = new Map(accounts.map((a) => [a.network, a]))

  // Derived from the schema so this phase and the next ones add networks in one place.
  return SOCIAL_NETWORKS.map((network) => {
    const account = byNetwork.get(network)
    const usesOAuth = OAUTH_NETWORKS.has(network)
    return {
      network,
      handle: account?.handle ?? null,
      externalId: account?.externalId ?? null,
      // The two kinds of network answer "connected?" differently, and the row existing
      // is no longer the answer for either reason it used to be.
      //
      // An OAuth network keeps its row through a disconnect on purpose — the identity has
      // to outlive the credentials so the callback can still refuse a different account —
      // so only a stored token means connected. All six networks are OAuth now: YouTube
      // reads by env (its API key) but writes by OAuth, so for it too `connected` means
      // the write credential — the access token — is on file, not just the row existing.
      connected: usesOAuth ? Boolean(account?.accessToken) : Boolean(account),
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: account?.lastSyncError ?? null,
      usesOAuth,
    }
  })
}

/** Lets the analytics campaign table show a post's caption instead of a bare tag. */
export async function getCampaignPosts(campaigns: string[]): Promise<Map<string, CampaignPost>> {
  if (campaigns.length === 0) return new Map()

  const rows = await getDb()
    .select({
      campaign: socialPosts.campaign,
      network: socialPosts.network,
      caption: socialPosts.caption,
      thumbnailUrl: socialPosts.thumbnailUrl,
      permalink: socialPosts.permalink,
    })
    .from(socialPosts)
    .where(inArray(socialPosts.campaign, campaigns))

  return new Map(rows.map((r) => [r.campaign, r]))
}
