import 'server-only'
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import {
  clicks,
  getDb,
  postMetrics,
  profiles,
  scheduledPosts,
  socialAccounts,
  socialPosts,
  visits,
} from '@/db'
import type { Filters, Granularity } from './analytics'
import { SITE_TIMEZONE, describe, granularityFor, localDay } from './analytics'
import {
  postKpisFrom,
  type CuentaRow,
  type PostKpis,
  type PostRow,
} from './posts-kpis'
import { contarPorDia } from './schedule-week'
import { periodChange, type Snapshot } from './social/delta'

// Re-exported so server call sites only need one import line; the types and the pure
// summing function actually live in `posts-kpis.ts`, which stays free of
// `server-only` so a test file can import it without pulling in the DB layer.
// Client components must import them from there directly, not from here.
export type { CuentaRow, PostKpis, PostRow }
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

/**
 * `opts` exists for the metrics API: the panel wants the latest 200 posts whatever
 * their date, but an API caller asking for a month needs the window pushed into the
 * query — otherwise the newest 200 rows are all it can ever see, and a request for
 * an older month comes back empty with no way to tell that from "nothing happened".
 */
export async function getPostRows(
  f: Filters,
  includeArchived = false,
  opts: { publishedFrom?: Date; publishedTo?: Date; limit?: number } = {},
): Promise<PostRow[]> {
  const db = getDb()
  const from = localDay(f.from)
  const to = localDay(f.to)

  const postConds: SQL[] = [eq(socialPosts.ownerId, f.ownerId)]
  if (!includeArchived) postConds.push(isNull(socialPosts.archivedAt))
  if (opts.publishedFrom) postConds.push(gte(socialPosts.publishedAt, opts.publishedFrom))
  if (opts.publishedTo) postConds.push(lte(socialPosts.publishedAt, opts.publishedTo))

  const posts = await db
    .select()
    .from(socialPosts)
    .where(and(...postConds))
    .orderBy(desc(socialPosts.publishedAt))
    .limit(opts.limit ?? 200)

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
    inArray(visits.profileId, db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, f.ownerId))),
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
    inArray(clicks.profileId, db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, f.ownerId))),
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
    .where(
      and(
        inArray(visits.campaign, campaigns),
        inArray(visits.profileId, db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, f.ownerId))),
      ),
    )

  const seen = new Set(everSeen.map((r) => r.campaign))
  const visitMap = new Map(visitRows.map((r) => [r.campaign, r]))
  const clickMap = new Map(clickRows.map((r) => [r.campaign, r.total]))

  return posts.map((post) => {
    const list = byPost.get(post.id) ?? []
    const snapshotsOf = (key: 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach'): Snapshot[] =>
      list.map((s) => ({ day: s.day, value: s[key] }))

    // Sin esto, la primera sincronización de un catálogo viejo cargaría toda su
    // historia como crecimiento de la ventana que la contiene.
    const publishedDay = localDay(post.publishedAt)

    const views = periodChange(snapshotsOf('views'), from, to, publishedDay)
    const likes = periodChange(snapshotsOf('likes'), from, to, publishedDay)
    const comments = periodChange(snapshotsOf('comments'), from, to, publishedDay)
    const shares = periodChange(snapshotsOf('shares'), from, to, publishedDay)
    const pasted = seen.has(post.campaign)
    const traffic = visitMap.get(post.campaign)
    const visitCount = pasted ? (traffic?.total ?? 0) : null
    const clickCount = pasted ? (clickMap.get(post.campaign) ?? 0) : null

    return {
      id: post.id,
      network: post.network,
      externalId: post.externalId,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedLabel: PUBLISHED.format(post.publishedAt),
      publishedAt: post.publishedAt,
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

  // Toda fecha va con `.toISOString()`: el driver de `postgres-js` instala serializadores
  // transparentes para los tipos de fecha, o sea que NO convierte, y un `Date` interpolado
  // en SQL crudo revienta con ERR_INVALID_ARG_TYPE. Acá aplica también a las comparaciones
  // de `v`, que van contra el alias `vi.created_at` escrito a mano y no contra el objeto
  // columna: sin tipo declarado, Drizzle no tiene con qué mapearlas.
  const query = sql`
    with span as (
      select generate_series(
        date_trunc(${unit}, ${f.from.toISOString()}::timestamptz at time zone ${tz}),
        date_trunc(${unit}, ${f.to.toISOString()}::timestamptz at time zone ${tz}),
        ${interval}::interval
      ) as bucket
    ),
    gains as (
      select m.day,
             greatest(0, m.views - lag(m.views) over (partition by m.post_id order by m.day)) as gained
      from ${postMetrics} m
      join ${socialPosts} p on p.id = m.post_id
      where p.archived_at is null and m.views is not null and m.day <= ${to} and p.owner_id = ${f.ownerId}
    ),
    g as (
      select date_trunc(${unit}, day::timestamp) as bucket, sum(gained)::int as total
      from gains where day >= ${from} group by 1
    ),
    v as (
      select date_trunc(${unit}, vi.created_at at time zone ${tz}) as bucket, count(*) as total
      from ${visits} vi
      join ${socialPosts} p on p.campaign = vi.campaign
      where vi.created_at >= ${f.from.toISOString()} and vi.created_at <= ${f.to.toISOString()} and p.owner_id = ${f.ownerId}
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
  // Filas directas, sin el envoltorio `{ rows }` del driver HTTP de Neon.
  const rows = result as unknown as Array<{
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

/** Todas las cuentas, en el orden en que se conectaron; la pestaña Cuentas las agrupa por red. */
export async function getCuentas(ownerId: string): Promise<CuentaRow[]> {
  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.ownerId, ownerId))
    .orderBy(asc(socialAccounts.network), asc(socialAccounts.createdAt))
  return cuentas.map((a) => ({
    id: a.id,
    network: a.network,
    handle: a.handle,
    externalId: a.externalId,
    connected: Boolean(a.accessToken),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: a.lastSyncError,
    expiresAt: a.expiresAt?.toISOString() ?? null,
  }))
}

/**
 * Cuántas publicaciones tiene agendadas cada día, en la zona del sitio.
 *
 * Alimenta el termómetro de la semana en el Resumen y el aviso de carga del compositor:
 * los dos preguntan lo mismo —¿qué tan llena está la parrilla ese día?— y una sola
 * consulta les sirve a ambos.
 *
 * Agrupa en JavaScript y no en SQL con `AT TIME ZONE` para reusar `dayKey`, que es la
 * misma función con la que el calendario reparte los posts en columnas y ya está
 * probada. Dos maneras distintas de decidir a qué día pertenece una hora es exactamente
 * como se llega a que el termómetro y el calendario se contradigan.
 *
 * Solo mira hacia adelante: la carga pasada no ayuda a decidir dónde poner lo próximo.
 */
export async function cargaPorDia(
  ownerId: string,
  zone: string,
  desde: Date,
): Promise<Record<string, number>> {
  const filas = await getDb()
    .select({ scheduledAt: scheduledPosts.scheduledAt })
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.ownerId, ownerId), gte(scheduledPosts.scheduledAt, desde)))

  return contarPorDia(filas, zone)
}

/** Lets the analytics campaign table show a post's caption instead of a bare tag. */
export async function getCampaignPosts(
  ownerId: string,
  campaigns: string[],
): Promise<Map<string, CampaignPost>> {
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
    .where(and(eq(socialPosts.ownerId, ownerId), inArray(socialPosts.campaign, campaigns)))

  return new Map(rows.map((r) => [r.campaign, r]))
}
