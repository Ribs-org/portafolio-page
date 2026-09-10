const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  facebook: 'fb',
  threads: 'th',
  x: 'x',
}

const MAX_LENGTH = 48

/**
 * Collapses anything that wouldn't survive being pasted into a URL query string down
 * to hyphens, then tidies the result: no doubled separators, none riding the edges,
 * capped at the length a tag is allowed to reach. An input made entirely of symbols
 * (emoji, punctuation, non-Latin script with nothing left after stripping) normalises
 * to the empty string on purpose — callers must treat that as "reject it", not as a
 * valid one-character tag.
 */
export function normalizeCampaignTag(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, MAX_LENGTH)
}

export type CuentaTag = { primaria: boolean; handle: string | null; externalId: string | null }

// Ocho caracteres: suficientes para reconocer «gimnasio» de «personal» a ojo, y pocos
// para no comerse el presupuesto de 48 del tag entero.
const HANDLE_CORTO = 8

/**
 * The `?s=` tag a post is born with. Kept short and readable because it ends up
 * pasted by hand into a bio link, and stable because changing it would orphan the
 * traffic already attributed to the old one.
 *
 * Una red puede tener varias cuentas. La primaria (la más antigua) conserva el tag de
 * siempre, porque ya acuñó los suyos; cualquier otra lleva su handle corto para que dos
 * cuentas jamás compartan tag — el tag es la única llave entre un post y sus visitas.
 */
export function campaignTagFor(network: string, externalId: string, cuenta?: CuentaTag): string {
  const prefix = PREFIXES[network] ?? network
  if (!cuenta || cuenta.primaria) return normalizeCampaignTag(`${prefix}-${externalId}`)
  const deHandle = normalizeCampaignTag(cuenta.handle?.replace(/^@/, '') ?? '')
  const deId = normalizeCampaignTag(cuenta.externalId ?? '')
  // Nunca vacío: un corto vacío colapsaría al tag de la primaria. Una cuenta sin handle
  // ni id externo no sincroniza, así que «alt» es un marcador que casi nadie verá, y el
  // sufijo hash de sync.ts sigue cubriendo la unique.
  const corto = (deHandle || deId || 'alt').slice(0, HANDLE_CORTO)
  return normalizeCampaignTag(`${prefix}-${corto}-${externalId}`)
}
