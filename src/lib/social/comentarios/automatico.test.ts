import { describe, expect, it, vi } from 'vitest'

// `automatico.ts` importa `server-only`, que solo entiende el bundler de Next: se
// sustituye por un módulo vacío para poder importarlo bajo Vitest (mismo motivo que en
// `usuarios.test.ts`).
vi.mock('server-only', () => ({}))

/**
 * Filas que el doble de `getDb()` devuelve para cualquier consulta: una con documento y
 * una sin él. Lo que este archivo prueba es que `reglasPara` y `reglasDeCuenta` copian
 * `documentoUrl` de la fila al `ReglaLimpia` del mapa tal cual llega —con su valor y con
 * su `null`—, no que filtren nada; por eso el doble ignora los argumentos de `where` y
 * siempre da las mismas dos filas.
 */
const FILAS = vi.hoisted(() => [
  {
    externalId: 'c1',
    palabra: 'guia',
    mensaje: 'Acá va',
    respuestaPublica: 'ok',
    documentoUrl: 'https://media.ej.cl/reglas/abc.pdf',
  },
  {
    externalId: 'c2',
    palabra: 'otra',
    mensaje: 'Toma',
    respuestaPublica: 'ok',
    documentoUrl: null,
  },
])

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => FILAS }) }) }),
    }),
  }
})

const { reglasPara, reglasDeCuenta } = await import('./automatico')

describe('reglasPara', () => {
  it('el documentoUrl de la fila llega al ReglaLimpia, y una fila sin documento da null', async () => {
    const mapa = await reglasPara('cuenta-1', ['c1', 'c2'])
    expect(mapa.get('c1')?.documentoUrl).toBe('https://media.ej.cl/reglas/abc.pdf')
    expect(mapa.get('c2')?.documentoUrl).toBeNull()
  })
})

describe('reglasDeCuenta', () => {
  it('el documentoUrl de la fila llega al ReglaLimpia, y una fila sin documento da null', async () => {
    const mapa = await reglasDeCuenta('cuenta-1')
    expect(mapa.get('c1')?.documentoUrl).toBe('https://media.ej.cl/reglas/abc.pdf')
    expect(mapa.get('c2')?.documentoUrl).toBeNull()
  })
})
