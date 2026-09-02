// Pure planning for the scheduled-post editor: what the form chose, resolved against
// what the database holds, into writes the action can apply with status guards.

export type TargetLite = { id: string; network: string; status: string }
export type TargetsPlan = { create: string[]; deleteIds: string[]; rearmIds: string[] }

export const PUBLISHED_LOCKED = 'No se puede quitar una red ya publicada.'

/**
 * Published targets are immovable: the form locks their checkbox, so an absence here
 * means a manipulated request — refused, not silently kept. Publishing targets never
 * enter any list: the action refuses the whole edit while one exists, and this guard
 * is the second line for the race where one slips in between read and write.
 */
export function diffTargets(
  current: TargetLite[],
  chosen: string[],
): { error: string } | TargetsPlan {
  const chosenSet = new Set(chosen)
  for (const target of current) {
    if (target.status === 'published' && !chosenSet.has(target.network)) {
      return { error: PUBLISHED_LOCKED }
    }
  }
  const existing = new Set(current.map((t) => t.network))
  return {
    create: chosen.filter((network) => !existing.has(network)),
    deleteIds: current
      .filter((t) => !chosenSet.has(t.network) && (t.status === 'scheduled' || t.status === 'failed'))
      .map((t) => t.id),
    rearmIds: current
      .filter((t) => chosenSet.has(t.network) && t.status === 'failed')
      .map((t) => t.id),
  }
}

export type MediaOrderEntry =
  | { kind: 'kept'; id: string }
  | { kind: 'new'; url: string; mediaType: 'image' | 'video' }

/**
 * The final order is the form's kept list (in its order) followed by the additions.
 * Kept ids that do not exist on the post are dropped: the form cannot conjure media.
 */
export function diffMedia(
  existingIds: string[],
  orderedKeptIds: string[],
  added: Array<{ url: string; mediaType: 'image' | 'video' }>,
): { deleteIds: string[]; order: MediaOrderEntry[] } {
  const existing = new Set(existingIds)
  const kept = orderedKeptIds.filter((id) => existing.has(id))
  const keptSet = new Set(kept)
  return {
    deleteIds: existingIds.filter((id) => !keptSet.has(id)),
    order: [
      ...kept.map((id) => ({ kind: 'kept' as const, id })),
      ...added.map((m) => ({ kind: 'new' as const, url: m.url, mediaType: m.mediaType })),
    ],
  }
}
