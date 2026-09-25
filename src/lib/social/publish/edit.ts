// Pure planning for the scheduled-post editor: what the form chose, resolved against
// what the database holds, into writes the action can apply with status guards.

import type { CuentaDestino } from '../cuentas'

export type TargetLite = { id: string; network: string; accountId: string; status: string }
export type TargetsPlan = { create: CuentaDestino[]; deleteIds: string[]; rearmIds: string[] }

/** El mensaje habla de cuentas porque ahora dos destinos pueden compartir red. */
export const PUBLISHED_LOCKED = 'No se puede quitar una cuenta en la que ya se publicó.'

/**
 * Published targets are immovable: the form locks their checkbox, so an absence here
 * means a manipulated request — refused, not silently kept. Publishing targets never
 * enter any list: the action refuses the whole edit while one exists, and this guard
 * is the second line for the race where one slips in between read and write.
 *
 * `chosen` son las cuentas elegidas, ya resueltas — no `string[]`: esa forma es
 * idéntica a la de una lista de redes, así que un descuido que mandara redes en su
 * lugar habría compilado igual. Tiparlo como `CuentaDestino[]` hace que esa mutación
 * ya no compile, y de paso el `create` que devuelve sale listo para insertar, sin que
 * el llamador tenga que resolver la red de cada id por su cuenta.
 */
export function diffTargets(
  current: TargetLite[],
  chosen: CuentaDestino[],
): { error: string } | TargetsPlan {
  const chosenSet = new Set(chosen.map((c) => c.id))
  for (const target of current) {
    if (target.status === 'published' && !chosenSet.has(target.accountId)) {
      return { error: PUBLISHED_LOCKED }
    }
  }
  const existing = new Set(current.map((t) => t.accountId))
  return {
    create: chosen.filter((c) => !existing.has(c.id)),
    deleteIds: current
      .filter((t) => !chosenSet.has(t.accountId) && (t.status === 'scheduled' || t.status === 'failed'))
      .map((t) => t.id),
    rearmIds: current
      .filter((t) => chosenSet.has(t.accountId) && t.status === 'failed')
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
