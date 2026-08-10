'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Bot } from 'lucide-react'
import { RANGES } from '@/lib/filters'
import { cn } from '@/lib/utils'

type ProfileOption = { id: string; displayName: string; slug: string }

/**
 * Filters live in the URL, so any dashboard view is shareable and the back button
 * behaves the way people expect.
 */
export function FilterBar({ profiles }: { profiles: ProfileOption[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const range = params.get('range') ?? '30d'
  const profile = params.get('profile') ?? 'all'
  const bots = params.get('bots') === '1'

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null) next.delete(key)
    else next.set(key, value)
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }))
  }

  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-center gap-2 transition-opacity',
        pending && 'opacity-60',
      )}
    >
      <div className="surface flex items-center gap-0.5 rounded-xl p-1">
        {RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => update('range', option.key)}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors',
              range === option.key ? 'bg-white/[0.1] text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {profiles.length > 1 ? (
        <select
          value={profile}
          onChange={(event) => update('profile', event.target.value)}
          className="surface rounded-xl px-3 py-2 text-xs text-fg-muted outline-none"
        >
          <option value="all">Todos los perfiles</option>
          {profiles.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName} · /{option.slug}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        onClick={() => update('bots', bots ? null : '1')}
        title="Los bots se excluyen salvo que actives esto"
        className={cn(
          'surface flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors',
          bots ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
        )}
      >
        <Bot className="h-3.5 w-3.5" aria-hidden />
        Bots
      </button>
    </div>
  )
}
