/** One cumulative reading. `day` is `YYYY-MM-DD`, so string comparison is date order. */
export type Snapshot = { day: string; value: number | null }

export type PeriodChange = {
  /** The cumulative total at the end of the period. */
  current: number | null
  /** How much it grew during the period. */
  change: number | null
  /** No reading exists before the period — the post was published inside it. */
  isNew: boolean
}

/**
 * Counters are cumulative, so a period's growth is the difference between its edges.
 *
 * The baseline is the last reading strictly before `from`, not one taken exactly on
 * it: the daily cron can miss a run, and demanding an exact match would report a
 * month of growth as nothing.
 */
export function periodChange(snapshots: Snapshot[], from: string, to: string): PeriodChange {
  const known = snapshots
    .filter((s) => s.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day)) as Array<{ day: string; value: number }>

  const inside = known.filter((s) => s.day >= from && s.day <= to)
  if (inside.length === 0) return { current: null, change: null, isNew: false }

  const current = inside[inside.length - 1]!.value
  const before = known.filter((s) => s.day < from).at(-1)

  if (!before) return { current, change: current, isNew: true }

  // Instagram revises views downward sometimes. Negative growth is noise, not a story.
  return { current, change: Math.max(0, current - before.value), isNew: false }
}
