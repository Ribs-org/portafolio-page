// Normalización pura de lo que cada red dice sobre la cuenta. Sin fetch acá: los
// conectores traen el payload y esto lo traduce, que es lo testeable.
import { NO_ACCOUNT_METRICS, type AccountMetricValues } from './connector'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type InstagramEntry = {
  name?: string
  total_value?: { value?: unknown }
  values?: Array<{ value?: unknown; end_time?: string }>
}

/**
 * Graph mezcla dos formas en el mismo array: las métricas nuevas responden
 * `total_value` y las clásicas una serie `values`, de la que interesa la última
 * lectura — la del día que se está sincronizando.
 *
 * Esa lectura se elige por `end_time`, no por posición: Graph cierra cada ventana
 * diaria con `end_time` a medianoche de la zona de la cuenta, así que la mayor es la
 * última jornada completa — la que corresponde guardar. Si ninguna entrada trae
 * `end_time`, se conserva el comportamiento anterior (última posición del array).
 */
function instagramValue(entries: InstagramEntry[], name: string): number | null {
  const entry = entries.find((e) => e.name === name)
  if (!entry) return null
  if (entry.total_value) return toNumber(entry.total_value.value)
  const values = entry.values ?? []
  const dated = values.filter((v): v is { value?: unknown; end_time: string } =>
    typeof v.end_time === 'string' && v.end_time !== '',
  )
  const chosen =
    dated.length > 0
      ? dated.reduce((max, v) => (v.end_time > max.end_time ? v : max))
      : values.at(-1)
  return chosen ? toNumber(chosen.value) : null
}

export function normalizeInstagramAccount(
  insights: { data?: InstagramEntry[] },
  profile: { followers_count?: unknown },
): AccountMetricValues {
  const entries = insights.data ?? []
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(profile.followers_count),
    profileViews: instagramValue(entries, 'profile_views'),
    reach: instagramValue(entries, 'reach'),
    views: instagramValue(entries, 'views'),
    accountsEngaged: instagramValue(entries, 'accounts_engaged'),
  }
}

/**
 * Las page insights están muertas para esta página (todas responden «metric inválida»
 * o vacío), así que Facebook aporta lo único que su nodo sí entrega: seguidores.
 * `fan_count` es el nombre viejo del mismo número y sirve de respaldo.
 */
export function normalizeFacebookAccount(profile: {
  followers_count?: unknown
  fan_count?: unknown
}): AccountMetricValues {
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(profile.followers_count) ?? toNumber(profile.fan_count),
  }
}

/** `channels.list` devuelve todo como cadenas. Son acumulados de por vida. */
export function normalizeYoutubeAccount(statistics: {
  subscriberCount?: unknown
  viewCount?: unknown
  videoCount?: unknown
}): AccountMetricValues {
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(statistics.subscriberCount),
    totalViews: toNumber(statistics.viewCount),
    videoCount: toNumber(statistics.videoCount),
  }
}
