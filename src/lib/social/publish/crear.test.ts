import { describe, expect, it, vi } from 'vitest'
import type { OpcionesDestino } from './opciones'

/**
 * Doble mínimo de `getDb()` para probar `crearPostProgramado` sin una base real. Solo
 * cubre las cuatro llamadas que hace `crear.ts` (`insert(scheduledPosts).values().returning()`,
 * `insert(scheduledPostMedia).values()`, `insert(scheduledPostTargets).values()` e
 * `insert(reglasClave).values()`), con el mismo estado mutable que los tests llenan y leen.
 * Mismo patrón que `src/lib/usuarios.test.ts`. `vi.hoisted` porque `vi.mock` se sube al
 * principio del archivo y necesita verlo ya listo.
 */
const db = vi.hoisted(() => ({
  postInsertado: { id: 'post-1' } as { id: string },
  media: [] as unknown[],
  targets: [] as unknown[],
  reglas: [] as unknown[],
}))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      insert: (tabla: unknown) => ({
        values: (v: unknown) => {
          if (tabla === real.scheduledPosts) {
            return { returning: async () => [db.postInsertado] }
          }
          if (tabla === real.scheduledPostMedia) {
            db.media.push(...(v as unknown[]))
            return Promise.resolve()
          }
          if (tabla === real.scheduledPostTargets) {
            db.targets.push(...(v as unknown[]))
            return Promise.resolve()
          }
          if (tabla === real.reglasClave) {
            db.reglas.push(v)
            return Promise.resolve()
          }
          throw new Error('tabla inesperada en el doble')
        },
      }),
    }),
  }
})

const { crearPostProgramado } = await import('./crear')

/**
 * Envuelve `crearPostProgramado` con datos mínimos y devuelve lo que quedó en
 * `scheduled_post_targets`, ya sin `postId` (siempre el mismo, no aporta al test).
 */
async function crearConDobleFalso(
  cuentas: Array<{ id: string; network: string; handle: string | null }>,
  opciones?: Record<string, OpcionesDestino>,
): Promise<{ destinos: Array<{ network: string; accountId: string; opciones: unknown }> }> {
  db.targets.length = 0
  await crearPostProgramado('owner-1', {
    caption: 'hola',
    scheduledAt: new Date('2026-10-01T12:00:00Z'),
    media: [],
    cuentas,
    opciones,
  })
  const destinos = (db.targets as Array<{ network: string; accountId: string; opciones: unknown }>).map((t) => ({
    network: t.network,
    accountId: t.accountId,
    opciones: t.opciones,
  }))
  return { destinos }
}

describe('crearPostProgramado', () => {
  it('crea un destino por cuenta, incluso dos de la misma red', async () => {
    const cuentas = [
      { id: 'ig-1', network: 'instagram', handle: '@vicente' },
      { id: 'ig-2', network: 'instagram', handle: '@vicenteclips' },
    ]
    const { destinos } = await crearConDobleFalso(cuentas)
    expect(destinos).toEqual([
      { network: 'instagram', accountId: 'ig-1', opciones: null },
      { network: 'instagram', accountId: 'ig-2', opciones: null },
    ])
  })

  // La Tarea 2 entera existe para que dos cuentas de la misma red puedan tener
  // privacidades distintas: si `crear.ts` llaveara `opciones` por red en vez de por
  // cuenta, esto no se notaría hasta publicar. Ver `opcionesDesdeFormularioPorCuenta`.
  it('cada cuenta guarda sus propias opciones, no las de otra cuenta de la misma red', async () => {
    const cuentas = [
      { id: 'tt-1', network: 'tiktok', handle: '@vicente' },
      { id: 'tt-2', network: 'tiktok', handle: '@vicenteclips' },
    ]
    const opciones: Record<string, OpcionesDestino> = {
      'tt-1': { modo: 'borrador' },
      'tt-2': {
        modo: 'directo',
        privacidad: 'SELF_ONLY',
        comentarios: true,
        duo: false,
        pegar: false,
        comercial: 'no',
      },
    }
    const { destinos } = await crearConDobleFalso(cuentas, opciones)
    expect(destinos).toEqual([
      { network: 'tiktok', accountId: 'tt-1', opciones: opciones['tt-1'] },
      { network: 'tiktok', accountId: 'tt-2', opciones: opciones['tt-2'] },
    ])
  })
})
