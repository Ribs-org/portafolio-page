import 'server-only'
import { and, desc, eq, gte, lte, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { clicks, getDb, links, visits } from '@/db'
import { env } from './env'

/** Dashboard days are bucketed in this zone, not UTC. Override per deployment. */
export const SITE_TIMEZONE = env('SITE_TIMEZONE') ?? 'America/Santiago'

export type Filters = {
  profileId: string | null
  from: Date
  to: Date
  includeBots: boolean
}

const int = (fragment: SQL) => sql<number>`${fragment}`.mapWith(Number)

function visitWhere(f: Filters) {
  const conds: SQL[] = [gte(visits.createdAt, f.from), lte(visits.createdAt, f.to)]
  if (f.profileId) conds.push(eq(visits.profileId, f.profileId))
  if (!f.includeBots) conds.push(eq(visits.isBot, false))
  return and(...conds)!
}

function clickWhere(f: Filters) {
  const conds: SQL[] = [gte(clicks.createdAt, f.from), lte(clicks.createdAt, f.to)]
  if (f.profileId) conds.push(eq(clicks.profileId, f.profileId))
  if (!f.includeBots) conds.push(eq(clicks.isBot, false))
  return and(...conds)!
}

/** The window immediately before `f`, of the same length, for delta comparisons. */
export function previousPeriod(f: Filters): Filters {
  const span = f.to.getTime() - f.from.getTime()
  return { ...f, from: new Date(f.from.getTime() - span), to: new Date(f.from.getTime()) }
}

export type Kpis = {
  visits: number
  uniques: number
  clicks: number
  ctr: number
}

export async function getKpis(f: Filters): Promise<Kpis> {
  const db = getDb()

  const [visitRow] = await db
    .select({
      total: int(sql`count(*)`),
      uniques: int(sql`count(distinct ${visits.visitorHash})`),
    })
    .from(visits)
    .where(visitWhere(f))

  const [clickRow] = await db
    .select({ total: int(sql`count(*)`) })
    .from(clicks)
    .where(clickWhere(f))

  const total = visitRow?.total ?? 0
  const clickTotal = clickRow?.total ?? 0

  return {
    visits: total,
    uniques: visitRow?.uniques ?? 0,
    clicks: clickTotal,
    ctr: total > 0 ? (clickTotal / total) * 100 : 0,
  }
}

export type SeriesPoint = {
  bucket: string
  /** Axis tick, already formatted in SITE_TIMEZONE. */
  label: string
  /** Tooltip heading. */
  fullLabel: string
  visits: number
  clicks: number
}

export type Granularity = 'hour' | 'day' | 'week'

export function granularityFor(f: Filters): Granularity {
  const hours = (f.to.getTime() - f.from.getTime()) / 36e5
  if (hours <= 48) return 'hour'
  if (hours <= 24 * 180) return 'day'
  return 'week'
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Formats a bucket key without ever constructing a zoned Date: the key already
 * holds wall-clock time in SITE_TIMEZONE, so re-parsing it as an instant would
 * shift it a second time.
 */
function describe(bucket: string, unit: Granularity): { label: string; fullLabel: string } {
  const [datePart, hourPart] = bucket.split('T')
  const [year, month, day] = datePart!.split('-').map(Number) as [number, number, number]
  const hour = hourPart ? Number(hourPart) : 0

  if (unit === 'hour') {
    return {
      label: `${String(hour).padStart(2, '0')}:00`,
      fullLabel: `${day} de ${MONTHS_LONG[month - 1]}, ${String(hour).padStart(2, '0')}:00`,
    }
  }

  const short = `${day} ${MONTHS[month - 1]}`
  const long = `${day} de ${MONTHS_LONG[month - 1]} de ${year}`
  return unit === 'week'
    ? { label: short, fullLabel: `Semana del ${long}` }
    : { label: short, fullLabel: long }
}

/**
 * One query: Postgres generates the full bucket range and left-joins the counts, so
 * quiet days come back as real zeros instead of gaps the chart would bridge with a
 * misleading straight line.
 */
export async function getTimeSeries(f: Filters): Promise<SeriesPoint[]> {
  const unit = granularityFor(f)
  const interval = unit === 'hour' ? '1 hour' : unit === 'day' ? '1 day' : '1 week'
  const pattern = unit === 'hour' ? 'YYYY-MM-DD"T"HH24' : 'YYYY-MM-DD'
  const tz = SITE_TIMEZONE

  const query = sql`
    with span as (
      select generate_series(
        date_trunc(${unit}, ${f.from}::timestamptz at time zone ${tz}),
        date_trunc(${unit}, ${f.to}::timestamptz at time zone ${tz}),
        ${interval}::interval
      ) as bucket
    ),
    v as (
      select date_trunc(${unit}, ${visits.createdAt} at time zone ${tz}) as bucket, count(*) as total
      from ${visits} where ${visitWhere(f)} group by 1
    ),
    c as (
      select date_trunc(${unit}, ${clicks.createdAt} at time zone ${tz}) as bucket, count(*) as total
      from ${clicks} where ${clickWhere(f)} group by 1
    )
    select to_char(span.bucket, ${pattern}) as bucket,
           coalesce(v.total, 0)::int as visits,
           coalesce(c.total, 0)::int as clicks
    from span
    left join v on v.bucket = span.bucket
    left join c on c.bucket = span.bucket
    order by span.bucket
  `

  const result = await getDb().execute(query)
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{
    bucket: string
    visits: number
    clicks: number
  }>

  return rows.map((row) => ({
    bucket: row.bucket,
    ...describe(row.bucket, unit),
    visits: Number(row.visits),
    clicks: Number(row.clicks),
  }))
}

export type Breakdown = { key: string; visits: number; clicks?: number; ctr?: number }

async function breakdownBy(
  f: Filters,
  column: AnyColumn | SQL,
  limit = 12,
): Promise<Breakdown[]> {
  const rows = await getDb()
    .select({ key: sql<string>`coalesce(${column}::text, 'Desconocido')`, visits: int(sql`count(*)`) })
    .from(visits)
    .where(visitWhere(f))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(limit)
  return rows
}

export const getCountries = (f: Filters) => breakdownBy(f, visits.country)
export const getCities = (f: Filters) => breakdownBy(f, visits.city)
export const getDevices = (f: Filters) => breakdownBy(f, visits.deviceType, 8)
export const getOperatingSystems = (f: Filters) => breakdownBy(f, visits.os, 8)
export const getBrowsers = (f: Filters) => breakdownBy(f, visits.browser, 8)
export const getNetworks = (f: Filters) => breakdownBy(f, visits.referrerNetwork, 12)
export const getLanguages = (f: Filters) => breakdownBy(f, visits.language, 8)

export type CampaignRow = { campaign: string; visits: number; uniques: number; clicks: number; ctr: number }

/**
 * Answers the core question: which reel or post is actually driving traffic, and
 * which of them converts into a click once people land.
 */
export async function getCampaigns(f: Filters, limit = 50): Promise<CampaignRow[]> {
  const db = getDb()

  const visitRows = await db
    .select({
      campaign: sql<string>`coalesce(${visits.campaign}, '(sin etiqueta)')`,
      total: int(sql`count(*)`),
      uniques: int(sql`count(distinct ${visits.visitorHash})`),
    })
    .from(visits)
    .where(visitWhere(f))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(limit)

  // Clicks inherit the campaign through the visit they belong to.
  const clickRows = await db
    .select({
      campaign: sql<string>`coalesce(${visits.campaign}, '(sin etiqueta)')`,
      total: int(sql`count(*)`),
    })
    .from(clicks)
    .innerJoin(visits, eq(clicks.visitId, visits.id))
    .where(clickWhere(f))
    .groupBy(sql`1`)

  const clickMap = new Map(clickRows.map((r) => [r.campaign, r.total]))

  return visitRows.map((r) => {
    const c = clickMap.get(r.campaign) ?? 0
    return {
      campaign: r.campaign,
      visits: r.total,
      uniques: r.uniques,
      clicks: c,
      ctr: r.total > 0 ? (c / r.total) * 100 : 0,
    }
  })
}

export type LinkRow = { linkId: string | null; label: string; url: string; clicks: number; ctr: number }

export async function getTopLinks(f: Filters, totalVisits: number): Promise<LinkRow[]> {
  const rows = await getDb()
    .select({
      linkId: clicks.linkId,
      label: sql<string>`coalesce(${links.label}, '(link eliminado)')`,
      url: sql<string>`coalesce(${links.url}, '')`,
      total: int(sql`count(*)`),
    })
    .from(clicks)
    .leftJoin(links, eq(clicks.linkId, links.id))
    .where(clickWhere(f))
    .groupBy(clicks.linkId, links.label, links.url)
    .orderBy(desc(sql`4`))
    .limit(25)

  return rows.map((r) => ({
    linkId: r.linkId,
    label: r.label,
    url: r.url,
    clicks: r.total,
    ctr: totalVisits > 0 ? (r.total / totalVisits) * 100 : 0,
  }))
}

export type HeatCell = { dow: number; hour: number; visits: number }

export async function getHeatmap(f: Filters): Promise<HeatCell[]> {
  const local = sql`${visits.createdAt} AT TIME ZONE ${SITE_TIMEZONE}`
  const rows = await getDb()
    .select({
      dow: int(sql`extract(isodow from ${local})`),
      hour: int(sql`extract(hour from ${local})`),
      total: int(sql`count(*)`),
    })
    .from(visits)
    .where(visitWhere(f))
    .groupBy(sql`1, 2`)

  const map = new Map(rows.map((r) => [`${r.dow}-${r.hour}`, r.total]))
  const cells: HeatCell[] = []
  for (let dow = 1; dow <= 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ dow, hour, visits: map.get(`${dow}-${hour}`) ?? 0 })
    }
  }
  return cells
}

export type Funnel = { visits: number; engaged: number; clicks: number }

export async function getFunnel(f: Filters, kpis: Kpis): Promise<Funnel> {
  const [row] = await getDb()
    .select({ engaged: int(sql`count(distinct ${clicks.visitId})`) })
    .from(clicks)
    .where(clickWhere(f))

  return { visits: kpis.visits, engaged: row?.engaged ?? 0, clicks: kpis.clicks }
}

export type RecentVisit = {
  id: string
  createdAt: string
  country: string | null
  city: string | null
  deviceType: string | null
  os: string | null
  browser: string | null
  referrerNetwork: string | null
  campaign: string | null
  isBot: boolean
}

export async function getRecentVisits(f: Filters, limit = 40): Promise<RecentVisit[]> {
  const rows = await getDb()
    .select({
      id: visits.id,
      createdAt: visits.createdAt,
      country: visits.country,
      city: visits.city,
      deviceType: visits.deviceType,
      os: visits.os,
      browser: visits.browser,
      referrerNetwork: visits.referrerNetwork,
      campaign: visits.campaign,
      isBot: visits.isBot,
    })
    .from(visits)
    .where(visitWhere(f))
    .orderBy(desc(visits.createdAt))
    .limit(limit)

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}
