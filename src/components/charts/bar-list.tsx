import { formatNumber } from '@/lib/utils'
import { Empty } from './panel'

export type BarItem = {
  key: string
  label: string
  value: number
  /** Optional second figure shown to the right, e.g. a CTR. */
  note?: string
  href?: string
}

/**
 * A ranked list where the bar is the row's own background. Values sit in a tabular
 * column so they align vertically; the bar carries magnitude, the text carries the
 * exact number.
 */
export function BarList({
  items,
  color = '#3987e5',
  emptyLabel = 'Sin datos todavía.',
}: {
  items: BarItem[]
  color?: string
  emptyLabel?: string
}) {
  if (items.length === 0) return <Empty>{emptyLabel}</Empty>

  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <ol className="space-y-1">
      {items.map((item) => {
        const pct = (item.value / max) * 100
        const row = (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
              style={{ width: `${pct}%`, background: color, opacity: 0.22 }}
            />
            <span className="relative z-10 min-w-0 flex-1 truncate">{item.label}</span>
            {item.note ? (
              <span className="relative z-10 shrink-0 font-mono text-[0.72rem] tabular-nums text-fg-faint">
                {item.note}
              </span>
            ) : null}
            <span className="relative z-10 shrink-0 font-mono text-[0.78rem] tabular-nums text-fg-muted">
              {formatNumber(item.value)}
            </span>
          </>
        )

        return (
          <li key={item.key}>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-[0.85rem] transition-colors hover:bg-white/[0.04]"
              >
                {row}
              </a>
            ) : (
              <div className="relative flex items-center gap-3 overflow-hidden rounded-md px-2.5 py-1.5 text-[0.85rem]">
                {row}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
