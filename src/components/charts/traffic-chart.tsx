'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SeriesPoint } from '@/lib/analytics'
import { CHART, SERIES } from './theme'

type Props = { data: SeriesPoint[] }

function TooltipCard({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; dataKey?: string; payload?: SeriesPoint }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="font-mono text-[0.65rem] uppercase tracking-wider text-fg-faint">
        {point?.fullLabel}
      </p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry, i) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-[0.8rem]">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
            <span className="text-fg-muted">{entry.name}</span>
            <span className="ml-auto font-mono tabular-nums text-fg">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TrafficChart({ data }: Props) {
  const empty = data.every((point) => point.visits === 0 && point.clicks === 0)

  if (empty) {
    return (
      <div className="grid h-[260px] place-items-center text-sm text-fg-faint">
        Sin tráfico en este período.
      </div>
    )
  }

  return (
    <>
      <ul className="mb-3 flex flex-wrap items-center gap-4 text-[0.78rem]">
        {['Visitas', 'Clicks'].map((name, i) => (
          <li key={name} className="flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
            {name}
          </li>
        ))}
      </ul>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {[0, 1].map((i) => (
              <linearGradient key={i} id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART.axis }}
            tick={{ fill: CHART.muted, fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tick={{ fill: CHART.muted, fontSize: 11 }}
          />
          <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<TooltipCard />} />
          <Area
            type="monotone"
            dataKey="visits"
            name="Visitas"
            stroke={SERIES[0]}
            strokeWidth={2}
            fill="url(#fill-0)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
          />
          <Area
            type="monotone"
            dataKey="clicks"
            name="Clicks"
            stroke={SERIES[1]}
            strokeWidth={2}
            fill="url(#fill-1)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART.surface }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </>
  )
}
