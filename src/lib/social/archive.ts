type Identified = { externalId: string; publishedAt: Date }

/**
 * Which known posts count as deleted on the network.
 *
 * The fetch is capped at the 200 most recent, so "did not come back" is not enough on
 * its own — post 201 would be archived on the first run just for falling off the end.
 * Only posts inside the range the response actually covered are candidates.
 *
 * An empty response archives nothing: zero posts is almost always the API having a bad
 * day, and archiving the whole catalogue over it is not a recoverable mistake.
 */
export function postsToArchive(known: Identified[], fetched: Identified[]): string[] {
  if (fetched.length === 0) return []

  const oldestFetched = Math.min(...fetched.map((p) => p.publishedAt.getTime()))
  const oldestKnown = Math.min(...known.map((p) => p.publishedAt.getTime()))
  const seen = new Set(fetched.map((p) => p.externalId))

  // If the oldest known post is too far in the past relative to what we fetched,
  // we can't reliably archive it — it may have just fallen off the 200-post window.
  const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000
  if (oldestFetched - oldestKnown > ONE_YEAR_MS) return []

  return known
    .filter((p) => !seen.has(p.externalId) && p.publishedAt.getTime() <= oldestFetched)
    .map((p) => p.externalId)
}
