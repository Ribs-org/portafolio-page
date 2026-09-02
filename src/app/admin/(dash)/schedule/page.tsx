import Link from 'next/link'
import { asc, eq, inArray } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { addDays, normalizeWeekParam } from '@/lib/schedule-week'
import { cn } from '@/lib/utils'
import { Composer } from './composer'
import { BatchUpload } from './batch-upload'
import { Queue } from './queue'
import { WeekCalendar } from './calendar'

export const dynamic = 'force-dynamic'

/**
 * Rebuilds the page URL flipping one key, carrying the rest — the content page's
 * `contentHref` mold. `mensaje` never carries over (one-shot OAuth outcome).
 */
function scheduleHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key in changes || key === 'mensaje') continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/admin/schedule?${query}` : '/admin/schedule'
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const calendarView = params.vista === 'calendario'
  const monday = normalizeWeekParam(
    typeof params.semana === 'string' ? params.semana : undefined,
    new Date(),
    SITE_TIMEZONE,
  )

  const db = getDb()
  const rows = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .orderBy(asc(scheduledPosts.scheduledAt))

  const posts = new Map<
    string,
    {
      post: (typeof rows)[number]['post']
      targets: Array<(typeof rows)[number]['target']>
      media: Array<typeof scheduledPostMedia.$inferSelect>
    }
  >()
  for (const row of rows) {
    const entry = posts.get(row.post.id) ?? { post: row.post, targets: [], media: [] }
    entry.targets.push(row.target)
    posts.set(row.post.id, entry)
  }

  // Media in its own query: joining it above would multiply post×target×media rows
  // for nothing, and the calendar only needs the first thumbnail anyway.
  const ids = [...posts.keys()]
  if (ids.length > 0) {
    const media = await db
      .select()
      .from(scheduledPostMedia)
      .where(inArray(scheduledPostMedia.postId, ids))
      .orderBy(asc(scheduledPostMedia.position))
    for (const m of media) posts.get(m.postId)?.media.push(m)
  }

  const items = [...posts.values()]
  // `volver` carries the exact view to return to after editing — list or a given week.
  const volver = scheduleHref(params, {})

  return (
    <div className="space-y-6">
      <Composer />
      <BatchUpload />
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          {[
            { label: 'Lista', href: scheduleHref(params, { vista: null, semana: null }), active: !calendarView },
            { label: 'Calendario', href: scheduleHref(params, { vista: 'calendario' }), active: calendarView },
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                'rounded-full px-2.5 py-1 font-mono text-[0.68rem] transition-colors',
                tab.active ? 'bg-white/[0.14] text-fg' : 'bg-white/[0.05] text-fg-faint hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {calendarView ? (
          <WeekCalendar
            monday={monday}
            items={items}
            zone={SITE_TIMEZONE}
            volver={volver}
            prevHref={scheduleHref(params, { vista: 'calendario', semana: addDays(monday, -7) })}
            nextHref={scheduleHref(params, { vista: 'calendario', semana: addDays(monday, 7) })}
          />
        ) : (
          <Queue items={items} volver={volver} />
        )}
      </div>
    </div>
  )
}
