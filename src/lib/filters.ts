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

/**
 * `zone` no sale de la URL: es la del dueño, y quien llama ya la tiene (la sesión en el
 * panel, `buscarPorId` en la API). Exigirla acá es lo que impide que una pantalla nueva
 * arme `Filters` y agrupe los días en la zona del servidor sin que nadie lo note.
 */
export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
  ownerId: string,
  zone: string,
): ParsedFilters {
  const raw = typeof searchParams.range === 'string' ? searchParams.range : '30d'
  const range = (RANGES.find((r) => r.key === raw)?.key ?? '30d') as RangeKey

  const to = new Date()
  const days = DAYS[range]
  const from = days === null ? new Date('2020-01-01T00:00:00Z') : new Date(to.getTime() - days * 864e5)

  const profileParam = typeof searchParams.profile === 'string' ? searchParams.profile : ''

  // El id del perfil llega de la URL sin comprobar que sea del dueño, y puede quedarse así
  // mientras toda consulta que lo use lleve además el filtro por dueño: la intersección de
  // «perfil ajeno» y «mis perfiles» es vacía. Una consulta futura que filtre solo por este
  // id vería filas de otro.
  return {
    range,
    ownerId,
    zone,
    from,
    to,
    profileId: profileParam && profileParam !== 'all' ? profileParam : null,
    includeBots: searchParams.bots === '1',
  }
}
