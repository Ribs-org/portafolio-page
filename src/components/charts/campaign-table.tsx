'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CampaignRow } from '@/lib/analytics'
import { cn, formatNumber } from '@/lib/utils'
import { SERIES } from './theme'

type Column = 'campaign' | 'visits' | 'uniques' | 'clicks' | 'ctr'

const COLUMNS: Array<{ key: Column; label: string; numeric: boolean; hint?: string }> = [
  { key: 'campaign', label: 'Etiqueta', numeric: false },
  { key: 'visits', label: 'Visitas', numeric: true },
  { key: 'uniques', label: 'Únicos', numeric: true },
  { key: 'clicks', label: 'Clicks', numeric: true },
  { key: 'ctr', label: 'CTR', numeric: true },
]

/**
 * The table that answers "which reel is working". Sorting by CTR rather than raw
 * visits is what separates a piece that drives traffic from one that drives action.
 */
export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const [sort, setSort] = useState<Column>('visits')
  const [descending, setDescending] = useState(true)

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const left = a[sort]
      const right = b[sort]
      const comparison =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right, 'es')
          : Number(left) - Number(right)
      return descending ? -comparison : comparison
    })
    return copy
  }, [rows, sort, descending])

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-fg-faint">Todavía no llega tráfico etiquetado.</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.8rem] leading-relaxed text-fg-faint">
          Agrega <code className="font-mono text-fg-muted">?s=nombre</code> al link de tu bio —
          por ejemplo <code className="font-mono text-fg-muted">/?s=reel-gimnasio</code> — y cada
          pieza de contenido aparecerá acá por separado.
        </p>
      </div>
    )
  }

  const max = Math.max(...rows.map((r) => r.visits), 1)

  function toggle(column: Column) {
    if (column === sort) setDescending((value) => !value)
    else {
      setSort(column)
      setDescending(true)
    }
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[30rem] border-collapse text-[0.85rem]">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={sort === column.key ? (descending ? 'descending' : 'ascending') : 'none'}
                className={cn(
                  'pb-2 font-normal',
                  column.numeric ? 'text-right' : 'text-left',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors',
                    sort === column.key ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
                  )}
                >
                  {column.label}
                  {sort === column.key ? (
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
            <tr key={row.campaign} className="border-t border-white/[0.06]">
              <td className="relative max-w-[14rem] truncate py-2 pr-3">
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 -z-10 rounded"
                  style={{
                    width: `${(row.visits / max) * 100}%`,
                    background: SERIES[0],
                    opacity: 0.14,
                  }}
                />
                <span className="font-mono text-[0.8rem]">{row.campaign}</span>
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{formatNumber(row.visits)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {formatNumber(row.uniques)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {formatNumber(row.clicks)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{row.ctr.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
