const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
}

const MAX_LENGTH = 48

/**
 * The `?s=` tag a post is born with. Kept short and readable because it ends up
 * pasted by hand into a bio link, and stable because changing it would orphan the
 * traffic already attributed to the old one.
 */
export function campaignTagFor(network: string, externalId: string): string {
  const prefix = PREFIXES[network] ?? network
  const body = externalId
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return `${prefix}-${body}`.slice(0, MAX_LENGTH)
}
