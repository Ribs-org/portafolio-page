import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { NEGATIVE, POSITIVE } from './theme'

type Props = {
  label: string
  value: string
  /** Percentage change against the previous period of equal length. */
  delta?: number | null
  hint?: string
}

export function StatTile({ label, value, delta, hint }: Props) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const flat = hasDelta && Math.abs(delta) < 0.5
  const up = hasDelta && delta > 0
  const Arrow = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight
  const color = flat ? undefined : up ? POSITIVE : NEGATIVE

  return (
    <div className="surface rounded-2xl p-4">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-fg-faint">{label}</p>
      <p className="mt-2 font-display text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[0.75rem]">
        {hasDelta ? (
          <>
            <Arrow className="h-3.5 w-3.5" style={{ color }} aria-hidden />
            <span style={{ color }} className="font-mono tabular-nums">
              {flat ? '0%' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
            </span>
            <span className="text-fg-faint">vs. período anterior</span>
          </>
        ) : (
          <span className="text-fg-faint">{hint ?? '—'}</span>
        )}
      </div>
    </div>
  )
}

/** Percentage change, guarding the divide-by-zero that a first period always hits. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}
