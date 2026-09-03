import Image from 'next/image'
import Link from 'next/link'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { dayLabel, dayKey, groupByDay, hourLabel, weekDays, weekLabel } from '@/lib/schedule-week'
import { cn } from '@/lib/utils'

type Item = {
  post: ScheduledPost
  targets: ScheduledPostTarget[]
  media: Array<{ blobUrl: string; mediaType: string }>
}

const DOT: Record<string, string> = {
  scheduled: 'bg-white/40',
  publishing: 'bg-amber-400',
  published: 'bg-emerald-400',
  failed: 'bg-red-400',
}

export function WeekCalendar({
  monday,
  items,
  zone,
  volver,
  prevHref,
  nextHref,
}: {
  monday: string
  items: Item[]
  zone: string
  volver: string
  prevHref: string
  nextHref: string
}) {
  const days = weekDays(monday)
  const today = dayKey(new Date(), zone)
  const week = new Set(days)
  const grouped = groupByDay(
    items
      .map((item) => ({ ...item, scheduledAt: item.post.scheduledAt }))
      .filter((item) => week.has(dayKey(item.scheduledAt, zone))),
    zone,
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link href={prevHref} className="text-fg-faint transition-colors hover:text-fg">
          ← Semana anterior
        </Link>
        <span className="font-mono text-[0.8rem] text-fg-muted">{weekLabel(monday)}</span>
        <Link href={nextHref} className="text-fg-faint transition-colors hover:text-fg">
          Semana siguiente →
        </Link>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[52rem] grid-cols-7 gap-2">
          {days.map((day, index) => (
            <div
              key={day}
              className={cn('rounded-xl p-2', day === today ? 'bg-white/[0.06]' : 'bg-white/[0.02]')}
            >
              <p
                className={cn(
                  'mb-2 font-mono text-[0.65rem] uppercase tracking-[0.14em]',
                  day === today ? 'text-fg' : 'text-fg-faint',
                )}
              >
                {dayLabel(day, index)}
              </p>
              <div className="space-y-2">
                {(grouped.get(day) ?? []).map(({ post, targets, media }) => (
                  <Link
                    key={post.id}
                    href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                    className="block rounded-lg bg-white/[0.05] p-2 transition-colors hover:bg-white/[0.1]"
                  >
                    <p className="font-mono text-[0.65rem] text-fg-faint">
                      {hourLabel(post.scheduledAt, zone)}
                    </p>
                    {media[0] ? (
                      media[0].mediaType === 'image' ? (
                        <Image
                          src={media[0].blobUrl}
                          alt=""
                          width={120}
                          height={64}
                          unoptimized
                          className="mt-1 h-16 w-full rounded object-cover"
                        />
                      ) : post.coverUrl ? (
                        // The designed cover IS the video's preview when there is one.
                        <Image
                          src={post.coverUrl}
                          alt=""
                          width={120}
                          height={64}
                          unoptimized
                          className="mt-1 h-16 w-full rounded object-cover"
                        />
                      ) : (
                        // No controls (the whole card is a link); preload="metadata"
                        // paints the first frame without pulling the file.
                        <video
                          src={media[0].blobUrl}
                          preload="metadata"
                          muted
                          playsInline
                          className="mt-1 h-16 w-full rounded bg-black object-cover"
                        />
                      )
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-fg">
                      {post.caption || '(sin texto)'}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      {targets.map((target) => (
                        <span
                          key={target.id}
                          title={`${target.network}: ${target.status}`}
                          className={cn('h-2 w-2 rounded-full', DOT[target.status] ?? 'bg-white/40')}
                        />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
