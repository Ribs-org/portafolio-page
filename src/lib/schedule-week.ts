// Pure week math for the schedule calendar. The zone always arrives as a parameter:
// importing SITE_TIMEZONE here would drag `server-only` into vitest and the client.
import { toZonedInput } from '@/lib/utils'

/** The wall-clock day (`YYYY-MM-DD`) this instant falls on in `zone`. */
export function dayKey(date: Date, zone: string): string {
  return toZonedInput(date, zone).slice(0, 10)
}

/** The wall-clock `HH:MM` this instant reads as in `zone`. */
export function hourLabel(date: Date, zone: string): string {
  return toZonedInput(date, zone).slice(11, 16)
}

/**
 * Day-key arithmetic rides UTC on purpose: a key is already a wall-clock date, so
 * shifting it is pure calendar math with no zone left in it.
 */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function mondayOfKey(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay() // 0 = domingo
  return addDays(key, -((dow + 6) % 7))
}

export function mondayOf(date: Date, zone: string): string {
  return mondayOfKey(dayKey(date, zone))
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/**
 * `?semana=` as typed by nobody: it comes from our own links, but a hand-edited URL
 * must land somewhere sane. Non-Mondays normalise to their Monday; anything
 * unparseable (including impossible dates like Feb 31, which UTC math would silently
 * roll over) falls back to the current week.
 */
export function normalizeWeekParam(
  param: string | undefined,
  now: Date,
  zone: string,
): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && addDays(param, 0) === param) {
    return mondayOfKey(param)
  }
  return mondayOf(now, zone)
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** «7 – 13 sep», «31 ago – 6 sep», y con años solo cuando la semana los cruza. */
export function weekLabel(monday: string): string {
  const end = addDays(monday, 6)
  const [y1, m1, d1] = monday.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  const crossesYear = y1 !== y2
  const left = crossesYear
    ? `${d1} ${MONTHS[m1! - 1]} ${y1}`
    : m1 !== m2
      ? `${d1} ${MONTHS[m1! - 1]}`
      : `${d1}`
  const right = `${d2} ${MONTHS[m2! - 1]}${crossesYear ? ` ${y2}` : ''}`
  return `${left} – ${right}`
}

/** `index` es la posición en `weekDays` (0 = lunes), no se deriva de la fecha. */
export function dayLabel(key: string, index: number): string {
  return `${DOW[index]} ${Number(key.slice(8))}`
}

export function groupByDay<T extends { scheduledAt: Date }>(
  items: T[],
  zone: string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const key = dayKey(item.scheduledAt, zone)
    const bucket = grouped.get(key) ?? []
    bucket.push(item)
    grouped.set(key, bucket)
  }
  return grouped
}
