type Identified = { externalId: string; publishedAt: Date }

/**
 * Which known posts count as deleted on the network.
 *
 * "Did not come back" is only conclusive when the fetch saw everything. A connector
 * that hit its post cap returned a truncated window, and the posts beyond that edge
 * are missing because of the cap, not because anyone deleted them — so in that case
 * only posts newer than the oldest one fetched can be judged.
 *
 * An empty response archives nothing: zero posts is almost always the API having a bad
 * day, and archiving the whole catalogue over it is not a recoverable mistake.
 */
export function postsToArchive(
  known: Identified[],
  fetched: Identified[],
  windowWasCapped: boolean,
): string[] {
  if (fetched.length === 0) return []

  const seen = new Set(fetched.map((p) => p.externalId))
  const missing = known.filter((p) => !seen.has(p.externalId))

  if (!windowWasCapped) return missing.map((p) => p.externalId)

  const oldestFetched = Math.min(...fetched.map((p) => p.publishedAt.getTime()))
  return missing
    .filter((p) => p.publishedAt.getTime() >= oldestFetched)
    .map((p) => p.externalId)
}
