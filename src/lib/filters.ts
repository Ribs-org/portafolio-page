import type { Filters } from './analytics'

export const RANGES = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'all', label: 'Todo' },
] as const

export type RangeKey = (typeof RANGES)[number]['key']

const DAYS: Record<RangeKey, number | null> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
}

export type ParsedFilters = Filters & { range: RangeKey }

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ParsedFilters {
  const raw = typeof searchParams.range === 'string' ? searchParams.range : '30d'
  const range = (RANGES.find((r) => r.key === raw)?.key ?? '30d') as RangeKey

  const to = new Date()
  const days = DAYS[range]
  const from = days === null ? new Date('2020-01-01T00:00:00Z') : new Date(to.getTime() - days * 864e5)

  const profileParam = typeof searchParams.profile === 'string' ? searchParams.profile : ''

  return {
    range,
    from,
    to,
    profileId: profileParam && profileParam !== 'all' ? profileParam : null,
    includeBots: searchParams.bots === '1',
  }
}
