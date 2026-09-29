import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Doble mínimo de `getDb()`: la única lectura (`select().from().leftJoin().where()`)
 * entrega las filas que el test puso, y `delete().where()` solo anota que corrió. Lo que
 * se prueba es la regla —que un post publicado no se borre, que uno ajeno no se borre— no
 * la consulta; que la consulta ate las dos cosas al dueño lo vigila `aislamiento.test.ts`.
 */
const db = vi.hoisted(() => ({
  filas: [] as unknown[],
  deleteCalls: 0,
}))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      select: () => ({ from: () => ({ leftJoin: () => ({ where: async () => db.filas }) }) }),
      delete: () => ({
        where: async () => {
          db.deleteCalls += 1
        },
      }),
    }),
  }
})

const { borrarPostProgramado } = await import('./borrar')

beforeEach(() => {
  db.filas = []
  db.deleteCalls = 0
})

describe('borrarPostProgramado', () => {
  it('un post del dueño con destinos programados o fallidos se borra', async () => {
    db.filas = [
      { postId: 'p1', status: 'scheduled' },
      { postId: 'p1', status: 'failed' },
    ]
    expect(await borrarPostProgramado('owner-1', 'p1')).toBe('borrado')
    expect(db.deleteCalls).toBe(1)
  })

  it('un post sin destinos también: la fila del leftJoin trae status null y no impide nada', async () => {
    db.filas = [{ postId: 'p1', status: null }]
    expect(await borrarPostProgramado('owner-1', 'p1')).toBe('borrado')
    expect(db.deleteCalls).toBe(1)
  })

  it('un post que no existe (o no es del dueño) es «no-existe», sin borrar', async () => {
    db.filas = []
    expect(await borrarPostProgramado('owner-1', 'p1')).toBe('no-existe')
    expect(db.deleteCalls).toBe(0)
  })

  it('con algún destino publicado o publicando no se borra, y lo dice', async () => {
    db.filas = [
      { postId: 'p1', status: 'scheduled' },
      { postId: 'p1', status: 'published' },
    ]
    expect(await borrarPostProgramado('owner-1', 'p1')).toBe('publicado')
    expect(db.deleteCalls).toBe(0)

    db.filas = [{ postId: 'p1', status: 'publishing' }]
    expect(await borrarPostProgramado('owner-1', 'p1')).toBe('publicado')
    expect(db.deleteCalls).toBe(0)
  })
})
