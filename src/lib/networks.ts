import type { SocialNetwork } from '@/db/schema'

/**
 * Maps a referrer hostname to a normalised traffic source.
 *
 * Instagram and TikTok open links in an embedded browser that usually strips the
 * referrer, so this only catches part of the traffic. The `?s=` campaign tag is the
 * reliable attribution mechanism — see `docs/superpowers/specs`.
 */
const HOSTNAME_PATTERNS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)l\.instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(twitter|x)\.com$/, 'x'],
  [/(^|\.)t\.co$/, 'x'],
  [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)youtu\.be$/, 'youtube'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)lnkd\.in$/, 'linkedin'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)whatsapp\.com$/, 'whatsapp'],
  [/(^|\.)wa\.me$/, 'whatsapp'],
  [/(^|\.)t\.me$/, 'telegram'],
  [/(^|\.)telegram\.(me|org)$/, 'telegram'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest'],
  [/(^|\.)discord\.(com|gg)$/, 'discord'],
  [/(^|\.)substack\.com$/, 'substack'],
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)mail\.[a-z.]+$/, 'email'],
]

export const NETWORK_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X / Twitter',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  reddit: 'Reddit',
  pinterest: 'Pinterest',
  discord: 'Discord',
  substack: 'Substack',
  github: 'GitHub',
  google: 'Google',
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  email: 'Email',
  direct: 'Directo',
  other: 'Otro',
}

export function networkLabel(key: string | null | undefined): string {
  if (!key) return NETWORK_LABELS.direct
  return NETWORK_LABELS[key] ?? key
}

/**
 * `utmSource` wins over the referrer header: an explicit tag is a stronger signal
 * than a hostname, and survives the in-app browsers that strip referrers.
 */
export function detectNetwork(
  referrer: string | null,
  utmSource: string | null,
): string {
  if (utmSource) {
    const normalised = utmSource.toLowerCase().trim()
    if (normalised in NETWORK_LABELS) return normalised
    if (normalised === 'ig') return 'instagram'
    if (normalised === 'tt') return 'tiktok'
    if (normalised === 'yt') return 'youtube'
    if (normalised === 'twitter') return 'x'
    return normalised
  }

  if (!referrer) return 'direct'

  let hostname: string
  try {
    hostname = new URL(referrer).hostname.toLowerCase()
  } catch {
    return 'other'
  }

  for (const [pattern, network] of HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) return network
  }
  return 'other'
}

/**
 * Lo que cada red exige o limita hoy, dicho junto al botón de conectar y no después del
 * error. Frases fijas: cada una tiene test letra por letra. La de Meta en revisión va
 * aparte porque se apaga sola al quitar `META_EN_REVISION` cuando la app pase a Live.
 *
 * Las de YouTube y TikTok caducan por su cuenta: cuando pasen la auditoría de cuota de
 * Google y la de Direct Post de TikTok (pendientes al 2026-09-30), esas dos líneas se
 * quitan de acá.
 */
export const AVISO_ANTES_DE_CONECTAR: Partial<Record<SocialNetwork, string>> = {
  instagram: 'Cuenta Business o Creator, enlazada a una página de Facebook. Una cuenta personal no puede conectar.',
  facebook: 'Una página, no un perfil personal.',
  youtube: 'Hasta que Google apruebe la cuota de la app, lo que publiques sale privado.',
  tiktok: 'Hasta que TikTok apruebe la publicación directa, lo que publiques sale como “Solo yo”.',
}
export const AVISO_META_EN_REVISION =
  'Mientras Meta revisa la app, solo pueden conectar las cuentas que invitamos como testers. Si Facebook dice que la función no está disponible, escríbenos.'

export function avisosDe(network: SocialNetwork, metaEnRevision: boolean): string[] {
  const avisos: string[] = []
  const fijo = AVISO_ANTES_DE_CONECTAR[network]
  if (fijo) avisos.push(fijo)
  if (metaEnRevision && (network === 'instagram' || network === 'facebook')) avisos.push(AVISO_META_EN_REVISION)
  return avisos
}
