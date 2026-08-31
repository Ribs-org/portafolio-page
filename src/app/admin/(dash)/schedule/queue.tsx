'use client'

import { useTransition } from 'react'
import { deleteScheduledPost, rescheduleTarget } from '@/app/admin/actions'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

export function Queue({
  items,
}: {
  items: Array<{ post: ScheduledPost; targets: ScheduledPostTarget[] }>
}) {
  const [pending, start] = useTransition()

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-faint">Nada programado todavía.</p>
  }

  return (
    <ul className="space-y-3">
      {items.map(({ post, targets }) => (
        <li key={post.id} className="rounded-xl bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm">{post.caption || '(sin texto)'}</p>
              <p className="mt-1 text-xs text-fg-faint">
                {post.scheduledAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => void deleteScheduledPost(post.id))}
              className="text-xs text-fg-faint hover:text-fg"
            >
              Eliminar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {targets.map((target) => (
              <span
                key={target.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  target.status === 'published' && 'bg-emerald-500/15 text-emerald-300',
                  target.status === 'failed' && 'bg-red-500/15 text-red-300',
                  (target.status === 'scheduled' || target.status === 'publishing') &&
                    'bg-white/[0.08] text-fg-muted',
                )}
              >
                {networkLabel(target.network)}: {STATUS_LABEL[target.status]}
                {target.status === 'failed' && target.lastError && ` — ${target.lastError}`}
                {target.status === 'failed' && (
                  <button
                    type="button"
                    disabled={pending}
                    className="ml-2 underline"
                    onClick={() => {
                      const when = prompt('Nueva fecha y hora (YYYY-MM-DDTHH:MM):')
                      if (when) start(() => void rescheduleTarget(target.id, when))
                    }}
                  >
                    Reprogramar
                  </button>
                )}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
