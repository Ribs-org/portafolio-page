'use client'

import { useActionState } from 'react'
import { createScheduledPost } from '@/app/admin/actions'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

// Phases 1–2 publish to the Meta networks; the rest of the checkboxes exist but wait.
const ENABLED = new Set(['instagram', 'facebook'])

export function Composer() {
  const [state, action, pending] = useActionState(createScheduledPost, {})

  return (
    <form action={action} className="space-y-4 rounded-xl bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium">Programar publicación</h2>

      <textarea
        name="caption"
        rows={4}
        maxLength={2200}
        placeholder="Texto del post…"
        className="w-full rounded-lg bg-white/[0.06] p-3 text-sm outline-none"
      />

      <input
        type="file"
        name="media"
        multiple
        accept="image/*,video/*"
        className="block text-sm text-fg-muted"
      />

      <div className="flex flex-wrap gap-3">
        {SOCIAL_NETWORKS.map((network) => {
          const enabled = ENABLED.has(network)
          return (
            <label
              key={network}
              className={cn('flex items-center gap-2 text-sm', !enabled && 'opacity-40')}
            >
              <input
                type="checkbox"
                name="networks"
                value={network}
                disabled={!enabled}
                defaultChecked={network === 'instagram'}
              />
              {networkLabel(network)}
              {!enabled && <span className="text-xs text-fg-faint">próximamente</span>}
            </label>
          )
        })}
      </div>

      <input
        type="datetime-local"
        name="scheduledAt"
        required
        className="rounded-lg bg-white/[0.06] p-2 text-sm"
      />

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-400">Programado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15] disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Programar'}
      </button>
    </form>
  )
}
