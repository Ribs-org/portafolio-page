'use client'

import Image from 'next/image'
import { useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Check, Copy } from 'lucide-react'
import { updatePostCampaign } from '@/app/admin/actions'
import { useSortedRows } from '@/components/charts/use-sorted-rows'
import { networkLabel } from '@/lib/networks'
import type { PostRow } from '@/lib/posts-kpis'
import { cn, formatNumber } from '@/lib/utils'

type Column = 'views' | 'likes' | 'comments' | 'visits' | 'clicks' | 'ctr' | 'pull'

const COLUMNS: Array<{ key: Column; label: string; hint?: string }> = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Coment.' },
  { key: 'visits', label: 'Visitas' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'pull', label: 'Arrastre' },
]

const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

/** `—` and never `0`: no data and no traffic are different answers. */
function num(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

function pct(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

export function PostTable({ rows }: { rows: PostRow[] }) {
  const { sorted, sortKey, descending, toggle } = useSortedRows(rows, 'views')

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-fg-faint">Todavía no hay posts sincronizados.</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.8rem] leading-relaxed text-fg-faint">
          Conecta una red arriba y aprieta <span className="text-fg-muted">Sincronizar ahora</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[46rem] border-collapse text-[0.85rem]">
        <thead>
          <tr>
            <th scope="col" className="pb-2 text-left font-normal">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
                Post
              </span>
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sortKey === column.key ? (descending ? 'descending' : 'ascending') : 'none'
                }
                className="pb-2 text-right font-normal"
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors',
                    sortKey === column.key ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
                  )}
                >
                  {column.label}
                  {sortKey === column.key ? (
                    descending ? (
                      <ArrowDown className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowUp className="h-3 w-3" aria-hidden />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={cn('border-t border-white/[0.06]', row.archived && 'opacity-50')}
            >
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2.5">
                  {row.thumbnailUrl ? (
                    <Image
                      src={row.thumbnailUrl}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-md bg-white/[0.06]" aria-hidden />
                  )}
                  <div className="min-w-0">
                    {row.permalink ? (
                      <a
                        href={row.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="block max-w-[18rem] truncate text-fg transition-colors hover:text-fg-muted"
                      >
                        {row.caption ?? 'Sin descripción'}
                      </a>
                    ) : (
                      <span className="block max-w-[18rem] truncate text-fg">
                        {row.caption ?? 'Sin descripción'}
                      </span>
                    )}
                    <span className="font-mono text-[0.65rem] text-fg-faint">
                      {networkLabel(row.network)} · {DATE.format(new Date(row.publishedAt))}
                      {row.isNew ? ' · nuevo' : ''}
                    </span>
                    <CampaignCell postId={row.id} campaign={row.campaign} />
                  </div>
                </div>
              </td>

              <td className="py-2 text-right font-mono tabular-nums">
                {num(row.views)}
                {row.viewsChange !== null && row.viewsChange > 0 && !row.isNew ? (
                  <span className="ml-1 text-[0.68rem] text-fg-faint">
                    +{formatNumber(row.viewsChange)}
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.likes)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.comments)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">
                {row.visits === null ? (
                  <span className="text-[0.7rem] text-fg-faint">pega el link</span>
                ) : (
                  formatNumber(row.visits)
                )}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.clicks)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {pct(row.ctr)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{pct(row.pull, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CampaignCell({ postId, campaign }: { postId: string; campaign: string }) {
  const [value, setValue] = useState(campaign)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Escape unmounts the focused <input> synchronously, which fires a native blur as
  // part of that DOM removal. React delivers that blur through the pre-Escape
  // render's stale onBlur closure (still holding the dirty, about-to-be-discarded
  // value), so without this guard the "cancelled" edit gets saved anyway. The ref
  // is shared across renders/closures, so setting it inside cancel() or the real
  // save() is visible to that stale call too, and the same guard collapses Enter's
  // matching stale blur into a no-op instead of a second, redundant save.
  const settledRef = useRef(false)

  function startEditing() {
    settledRef.current = false
    setEditing(true)
  }

  function save() {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
    if (value === campaign) return
    startTransition(async () => {
      const result = await updatePostCampaign(postId, value)
      if (result.error) {
        setError(result.error)
        setValue(campaign)
      } else {
        setError(null)
        // The server normalises what was typed (spaces become hyphens, etc), so
        // display and the copy button must reflect the tag it actually stored.
        if (result.campaign) setValue(result.campaign)
      }
    })
  }

  function cancel() {
    settledRef.current = true
    setValue(campaign)
    setEditing(false)
  }

  function copy() {
    // Built here rather than on the server so the URL matches whatever host the
    // dashboard is actually being used on. Chained off the actual write instead of
    // assumed: a denied permission or an insecure context rejects, and a checkmark
    // that lies is worse than no checkmark.
    navigator.clipboard
      .writeText(`${window.location.origin}/?s=${value}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => setError('No se pudo copiar el link.'))
  }

  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {editing ? (
        <input
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') cancel()
          }}
          className="w-36 rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.65rem] text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          disabled={pending}
          title="Editar la etiqueta"
          className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.65rem] text-fg-muted transition-colors hover:text-fg"
        >
          ?s={value}
        </button>
      )}

      <button
        type="button"
        onClick={copy}
        disabled={pending}
        title="Copiar el link con la etiqueta"
        className="text-fg-faint transition-colors hover:text-fg"
      >
        {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      </button>

      {error ? <span className="text-[0.65rem] text-[#d03b3b]">{error}</span> : null}
    </div>
  )
}
