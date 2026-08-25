import 'server-only'
import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { clicks, getDb, postMetrics, socialAccounts, socialPosts, visits } from '@/db'
import type { Filters } from './analytics'
import { SITE_TIMEZONE } from './analytics'
import { postKpisFrom, type PostKpis, type PostRow } from './posts-kpis'
import { periodChange, type Snapshot } from './social/delta'

// Re-exported so call sites only need one import line; the types and the pure
// summing function actually live in `posts-kpis.ts`, which stays free of
// `server-only` so a test file can import it without pulling in the DB layer.
export type { PostKpis, PostRow }
export { postKpisFrom }

export type ConnectionRow = {
  network: string
  handle: string | null
  connected: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  /** YouTube is configured by environment and has no button. */
  usesOAuth: boolean
}

export type CampaignPost = {
  network: string
  caption: string | null
  thumbnailUrl: string | null
  permalink: string | null
}

const int = (fragment: SQL) => sql<number>`${fragment}`.mapWith(Number)

function day(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export async function getPostRows(f: Filters, includeArchived = false): Promise<PostRow[]> {
  const db = getDb()
  const from = day(f.from)
  const to = day(f.to)

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
      publishedAt: post.publishedAt.toISOString(),
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

const TICK = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FULL = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/**
 * Views gained per day against the visits they drove.
 *
 * The `lag` window is what turns cumulative counters into daily gains, and the
 * `greatest(0, …)` absorbs the downward revisions Instagram occasionally publishes.
 */
export async function getPostSeries(f: Filters): Promise<PostSeriesPoint[]> {
  const tz = SITE_TIMEZONE
  const from = day(f.from)
  const to = day(f.to)

  const query = sql`
    with span as (
      select generate_series(
        date_trunc('day', ${f.from}::timestamptz at time zone ${tz}),
        date_trunc('day', ${f.to}::timestamptz at time zone ${tz}),
        '1 day'::interval
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
      select day, sum(gained)::int as total from gains where day >= ${from} group by 1
    ),
    v as (
      select date_trunc('day', vi.created_at at time zone ${tz}) as bucket, count(*) as total
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
    left join g on g.day = span.bucket::date
    left join v on v.bucket = span.bucket
    order by span.bucket
  `

  const result = await getDb().execute(query)
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{
    bucket: string
    views: number
    visits: number
  }>

  return rows.map((row) => {
    const at = new Date(`${row.bucket}T00:00:00Z`)
    return {
      bucket: row.bucket,
      label: TICK.format(at),
      fullLabel: FULL.format(at),
      views: Number(row.views),
      visits: Number(row.visits),
    }
  })
}

const OAUTH_NETWORKS = new Set(['instagram', 'tiktok'])

export async function getConnections(): Promise<ConnectionRow[]> {
  const accounts = await getDb().select().from(socialAccounts)
  const byNetwork = new Map(accounts.map((a) => [a.network, a]))

  return ['instagram', 'tiktok', 'youtube'].map((network) => {
    const account = byNetwork.get(network)
    return {
      network,
      handle: account?.handle ?? null,
      connected: Boolean(account),
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: account?.lastSyncError ?? null,
      usesOAuth: OAUTH_NETWORKS.has(network),
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
