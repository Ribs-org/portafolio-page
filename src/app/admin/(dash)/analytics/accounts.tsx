import { Empty } from '@/components/charts/panel'
import { TrafficChart } from '@/components/charts/traffic-chart'
import type { AccountCard, AccountSeriesPoint } from '@/lib/account-stats'
import { formatShortDay } from '@/lib/account-stats'
import { networkLabel } from '@/lib/networks'
import { formatNumber } from '@/lib/utils'

/** `—` y nunca `0`: una red que no entrega el dato no reportó cero. */
function num(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

/** Distingue «no sé» (sin lectura previa) de «no creció» (creció cero) de «creció N». */
function followersChangeLabel(change: number | null): string {
  if (change === null) return '— en el período'
  if (change === 0) return 'sin cambio'
  return `+${formatNumber(change)} en el período`
}

export function AccountCards({ cards }: { cards: AccountCard[] }) {
  if (cards.length === 0) {
    return (
      <Empty>
        Todavía no hay lecturas de cuenta. La primera llega con la sincronización de esta noche.
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.network} className="rounded-2xl bg-white/[0.04] p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
            {networkLabel(card.network)}
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{num(card.followers)}</p>
          <p className="text-[0.75rem] text-fg-muted">
            seguidores · {followersChangeLabel(card.followersChange)}
          </p>
          <div className="mt-3 flex gap-4 text-[0.75rem] text-fg-faint">
            <span>
              Visitas al perfil{card.dayLabel ? ` (${card.dayLabel})` : ''}: {num(card.profileViews)}
            </span>
            <span>
              Alcance{card.dayLabel ? ` (${card.dayLabel})` : ''}: {num(card.reach)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** El gráfico de visitas al perfil y alcance por día; no dibuja nada si la serie viene vacía. */
export function AccountSeriesChart({ series }: { series: AccountSeriesPoint[] }) {
  if (series.length === 0) return null

  const data = series.map((point) => {
    const label = formatShortDay(point.date)
    const entry: { label: string; fullLabel: string; profileViews?: number; reach?: number } = {
      label,
      fullLabel: label,
    }
    if (point.profileViews !== null) entry.profileViews = point.profileViews
    if (point.reach !== null) entry.reach = point.reach
    return entry
  })

  return (
    <TrafficChart
      data={data}
      series={[
        { key: 'profileViews', name: 'Visitas al perfil' },
        { key: 'reach', name: 'Alcance' },
      ]}
    />
  )
}
