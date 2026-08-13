import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** `#8b7cff` -> `139 124 255`, for use in `rgb(var(--accent) / <alpha>)`. */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const int = Number.parseInt(full, 16)
  if (Number.isNaN(int) || full.length !== 6) return '139 124 255'
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

/**
 * Companion hue for the aurora: the accent rotated 30° counter-clockwise.
 *
 * The direction matters. Rotating forward sends warm accents into yellow-green,
 * which reads as swamp against a near-black page; rotating back keeps golds moving
 * into amber, violets into blue, and pinks into magenta — analogous in every case.
 */
export function accentCompanion(hex: string): string {
  const [r, g, b] = hexToRgbChannels(hex).split(' ').map(Number) as [number, number, number]
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))

  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
  }
  h = (h * 60 - 30 + 360) % 360

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]

  return [r1, g1, b1].map((v) => Math.round((v + m) * 255)).join(' ')
}

/** The hostname a link actually leads to, shown on hover so a click is informed. */
export function displayHost(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') return parsed.pathname
    const path = parsed.pathname.replace(/\/$/, '')
    const full = parsed.hostname.replace(/^www\./, '') + path
    return full.length > 38 ? `${full.slice(0, 37)}…` : full
  } catch {
    return url
  }
}

const REGION_NAMES = new Intl.DisplayNames(['es'], { type: 'region' })

export function countryName(code: string | null | undefined): string {
  if (!code || code.length !== 2) return 'Desconocido'
  try {
    return REGION_NAMES.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** Regional indicator pair, e.g. `CL` -> 🇨🇱. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2 || !/^[a-z]{2}$/i.test(code)) return '🌐'
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((c) => 0x1f1a5 + c.charCodeAt(0)),
  )
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('es', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

/* ------------------------------------------------- scheduled link windows -- */

/** Wall-clock fields of `date` as `timeZone` sees them. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some ICU builds spell midnight as hour 24 when hour12 is off.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Milliseconds `timeZone` runs ahead of UTC at that instant. */
function zoneOffset(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Renders an instant as a `datetime-local` value in `timeZone`.
 *
 * `toISOString().slice(0, 16)` looks like it does this, but it writes UTC into a
 * field the browser reads as local time. Every save then reinterprets the value
 * and shifts it by the offset again, so a scheduled link drifts an hour block
 * per edit — and the toggle on each row re-saves the whole link.
 */
export function toZonedInput(date: Date | null, timeZone: string): string {
  if (!date || Number.isNaN(date.getTime())) return ''
  const p = zonedParts(date, timeZone)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** The inverse: reads a `datetime-local` value as wall-clock time in `timeZone`. */
export function fromZonedInput(value: string, timeZone: string): Date | null {
  const trimmed = value.trim().slice(0, 16)
  // Checked before parsing: V8's lenient parser reads `abc:00Z` as the year 2000
  // rather than failing, which would silently schedule a link into the past.
  if (!LOCAL_DATETIME.test(trimmed)) return null

  // Treat the wall clock as if it were UTC, then subtract the zone's offset.
  const asUtc = new Date(`${trimmed}:00Z`)
  if (Number.isNaN(asUtc.getTime())) return null

  const first = new Date(asUtc.getTime() - zoneOffset(asUtc, timeZone))
  // One refinement settles a daylight-saving changeover, where the offset on
  // either side of the guess differs.
  const second = new Date(asUtc.getTime() - zoneOffset(first, timeZone))
  return second
}

/** Normalises user input into a valid absolute URL. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function slugify(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
