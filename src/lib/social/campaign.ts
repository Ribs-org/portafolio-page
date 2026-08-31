const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  facebook: 'fb',
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

/**
 * The `?s=` tag a post is born with. Kept short and readable because it ends up
 * pasted by hand into a bio link, and stable because changing it would orphan the
 * traffic already attributed to the old one.
 */
export function campaignTagFor(network: string, externalId: string): string {
  const prefix = PREFIXES[network] ?? network
  return normalizeCampaignTag(`${prefix}-${externalId}`)
}
