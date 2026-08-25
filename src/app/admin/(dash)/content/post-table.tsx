'use client'

import Image from 'next/image'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useSortedRows } from '@/components/charts/use-sorted-rows'
import { networkLabel } from '@/lib/networks'
import type { PostRow } from '@/lib/posts-kpis'
import { cn, formatNumber } from '@/lib/utils'

const COLUMNS: Array<{ key: string; label: string; hint?: string }> = [
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
                    <a
                      href={row.permalink ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[18rem] truncate text-fg transition-colors hover:text-fg-muted"
                    >
                      {row.caption ?? 'Sin descripción'}
                    </a>
                    <span className="font-mono text-[0.65rem] text-fg-faint">
                      {networkLabel(row.network)} · {DATE.format(new Date(row.publishedAt))}
                      {row.isNew ? ' · nuevo' : ''}
                    </span>
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
              <td className="py-2 text-right font-mono tabular-nums">{num(row.visits)}</td>
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
