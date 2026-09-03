import { networkLabel } from '@/lib/networks'
import { formatNumber } from '@/lib/utils'
import type { AccountCard } from '@/lib/account-stats'

/** `—` y nunca `0`: una red que no entrega el dato no reportó cero. */
function num(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

export function AccountCards({ cards }: { cards: AccountCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-fg-faint">
        Todavía no hay lecturas de cuenta. La primera llega con la sincronización de esta noche.
      </p>
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
            seguidores
            {card.followersChange !== null && card.followersChange > 0
              ? ` · +${formatNumber(card.followersChange)} en el período`
              : ''}
          </p>
          <div className="mt-3 flex gap-4 text-[0.75rem] text-fg-faint">
            <span>Visitas al perfil: {num(card.profileViews)}</span>
            <span>Alcance: {num(card.reach)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
