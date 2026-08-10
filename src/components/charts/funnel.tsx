import type { Funnel as FunnelData } from '@/lib/analytics'
import { formatNumber } from '@/lib/utils'
import { ORDINAL } from './theme'
import { Empty } from './panel'

/**
 * Three ordered stages, each bar scaled against the first. The drop-off between
 * stages is stated in words because that is the number worth reading.
 */
export function Funnel({ data }: { data: FunnelData }) {
  if (data.visits === 0) return <Empty>Sin visitas en este período.</Empty>

  const stages = [
    { label: 'Llegaron a la página', value: data.visits, color: ORDINAL[0] },
    { label: 'Hicieron al menos un click', value: data.engaged, color: ORDINAL[1] },
    { label: 'Clicks totales', value: data.clicks, color: ORDINAL[2] },
  ]

  const scale = Math.max(data.visits, data.clicks, 1)

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const share = (stage.value / scale) * 100
        const conversion = i === 1 && data.visits > 0 ? (stage.value / data.visits) * 100 : null

        return (
          <div key={stage.label}>
            <div className="mb-1 flex items-baseline gap-2 text-[0.82rem]">
              <span className="text-fg-muted">{stage.label}</span>
              <span className="ml-auto font-mono tabular-nums">{formatNumber(stage.value)}</span>
              {conversion !== null ? (
                <span className="font-mono text-[0.72rem] tabular-nums text-fg-faint">
                  {conversion.toFixed(1)}%
                </span>
              ) : null}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.max(share, 1.5)}%`, background: stage.color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
