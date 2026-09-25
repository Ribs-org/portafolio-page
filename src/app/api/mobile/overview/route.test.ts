import { describe, expect, it, vi } from 'vitest'
import type { ScheduledPost, ScheduledPostTarget } from '@/db'

// `route.ts` importa `SITE_TIMEZONE`/`getKpis` de `@/lib/analytics`, que trae
// `server-only` (no resuelve bajo Vitest). Mismo motivo y mismo arreglo que
// `schedule/route.test.ts` y `aislamiento.test.ts`.
vi.mock('server-only', () => ({}))

const { agruparPostsMovil } = await import('./route')

function filaPost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: 'post-1',
    ownerId: 'owner-1',
    caption: 'Hola',
    scheduledAt: new Date('2026-10-01T12:00:00Z'),
    coverUrl: null,
    atributos: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function filaTarget(overrides: Partial<ScheduledPostTarget> = {}): ScheduledPostTarget {
  return {
    id: 'target-1',
    postId: 'post-1',
    network: 'instagram',
    accountId: 'acc-1',
    captionOverride: null,
    status: 'scheduled',
    containerId: null,
    externalId: null,
    attemptCount: 0,
    lastError: null,
    opciones: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

/**
 * `agruparPostsMovil` es lo que arma «Qué salió hoy» y «Qué viene» en el Resumen del
 * teléfono a partir de las filas del `leftJoin`. Se prueba sin base: lo que importa es
 * que cada destino traiga su propio `id`, porque con dos cuentas de una misma red
 * `red` deja de ser única dentro de un post — y es lo único que el Resumen puede usar
 * de clave de React (repaso final de la rama, mismo hallazgo que
 * `schedule/route.test.ts`).
 */
describe('agruparPostsMovil (GET /api/mobile/overview)', () => {
  it('dos destinos de la misma red en un post traen ids de destino distintos', () => {
    const post = filaPost()
    const filas = [
      { post, target: filaTarget({ id: 'dest-ig-1', accountId: 'ig-1' }), handle: '@vicente' },
      { post, target: filaTarget({ id: 'dest-ig-2', accountId: 'ig-2' }), handle: '@vicenteclips' },
    ]
    const [agrupado] = agruparPostsMovil(filas)
    expect(agrupado!.redes).toHaveLength(2)
    expect(new Set(agrupado!.redes.map((r) => r.id)).size).toBe(2)
    expect(agrupado!.redes.map((r) => ({ id: r.id, red: r.red, handle: r.handle }))).toEqual([
      { id: 'dest-ig-1', red: 'instagram', handle: '@vicente' },
      { id: 'dest-ig-2', red: 'instagram', handle: '@vicenteclips' },
    ])
  })

  it('agrupa por post, no por destino: dos filas del mismo post arman un post con dos redes', () => {
    const post = filaPost({ id: 'post-2' })
    const filas = [
      { post, target: filaTarget({ id: 'dest-1', postId: 'post-2', network: 'instagram' }), handle: '@vicente' },
      { post, target: filaTarget({ id: 'dest-2', postId: 'post-2', network: 'x' }), handle: '@vicente_x' },
    ]
    const agrupados = agruparPostsMovil(filas)
    expect(agrupados).toHaveLength(1)
    expect(agrupados[0]!.id).toBe('post-2')
    expect(agrupados[0]!.redes).toHaveLength(2)
  })
})
