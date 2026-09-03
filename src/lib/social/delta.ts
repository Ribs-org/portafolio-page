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
 *
 * `publishedDay` settles what a missing baseline means, and the two answers are very
 * different. A post published inside the window has no earlier reading because it did
 * not exist yet: its whole counter is this period's growth. A post published before it
 * has none because nobody measured it in time — how much it grew is simply unknown,
 * and saying "all of it" would charge a catalogue's entire history to whichever window
 * happens to contain the first sync. Omitting the argument keeps the old reading.
 */
export function periodChange(
  snapshots: Snapshot[],
  from: string,
  to: string,
  publishedDay?: string,
): PeriodChange {
  const known = snapshots
    .filter((s) => s.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day)) as Array<{ day: string; value: number }>

  const inside = known.filter((s) => s.day >= from && s.day <= to)
  if (inside.length === 0) return { current: null, change: null, isNew: false }

  const current = inside[inside.length - 1]!.value
  const before = known.filter((s) => s.day < from).at(-1)

  if (!before) {
    const bornInside = publishedDay === undefined || publishedDay >= from
    return bornInside
      ? { current, change: current, isNew: true }
      : { current, change: null, isNew: false }
  }

  // Instagram revises views downward sometimes. Negative growth is noise, not a story.
  return { current, change: Math.max(0, current - before.value), isNew: false }
}
