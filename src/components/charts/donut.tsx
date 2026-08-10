'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatNumber } from '@/lib/utils'
import { CHART, seriesColor } from './theme'

export type Slice = { key: string; label: string; value: number }

/**
 * Part-to-whole for a handful of sources. Anything past the seventh slice folds
 * into "Otro" rather than taking a ninth hue.
 */
export function Donut({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-faint">Sin datos todavía.</p>
  }

  const head = slices.slice(0, 7)
  const tail = slices.slice(7)
  const data = tail.length
    ? [...head, { key: 'otro', label: 'Otro', value: tail.reduce((sum, s) => sum + s.value, 0) }]
    : head

  const total = data.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[168px] w-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              stroke={CHART.surface}
              strokeWidth={2}
            >
              {data.map((slice, i) => (
                <Cell key={slice.key} fill={seriesColor(i)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0]!
                const value = Number(item.value ?? 0)
                return (
                  <div className="rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 text-[0.8rem] shadow-xl backdrop-blur">
                    <span className="text-fg-muted">{item.name}</span>
                    <span className="ml-3 font-mono tabular-nums text-fg">
                      {formatNumber(value)} · {((value / total) * 100).toFixed(1)}%
                    </span>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-display text-xl font-semibold leading-none tracking-[-0.02em]">
              {formatNumber(total)}
            </p>
            <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-fg-faint">
              visitas
            </p>
          </div>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((slice, i) => (
          <li key={slice.key} className="flex items-center gap-2 text-[0.82rem]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: seriesColor(i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{slice.label}</span>
            <span className="font-mono text-[0.75rem] tabular-nums text-fg-faint">
              {((slice.value / total) * 100).toFixed(0)}%
            </span>
            <span className="w-10 text-right font-mono text-[0.78rem] tabular-nums">
              {formatNumber(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
