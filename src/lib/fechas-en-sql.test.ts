import { beforeEach, describe, expect, it, vi } from 'vitest'

// Un `Date` que llega crudo al driver rompe la consulta en ejecución, y nada más lo
// delata: compila, pasa el lint y el build, y el preview funciona si nadie abre la
// pantalla que lo usa. El 2026-09-22 así se fue a producción un `/admin` roto.
//
// `drizzle-orm/postgres-js` instala serializadores transparentes para los tipos de fecha
// (ver `construct()` en su driver), o sea que NO convierte: un `Date` interpolado en SQL
// crudo viaja tal cual y revienta con ERR_INVALID_ARG_TYPE. En una comparación contra una
// columna no pasa, porque ahí Drizzle usa el tipo declarado para mapearlo a texto.
//
// Este archivo no mira el SQL: mira los parámetros, y exige que ninguno sea un `Date`.
vi.mock('server-only', () => ({}))

const parametros: unknown[][] = []

/** Igual que el de `aislamiento.test.ts`: anota y devuelve vacío, nunca sale a la red. */
vi.mock('postgres', () => ({
  default: () => {
    const cliente = () => {
      throw new Error('fechas-en-sql.test: este test no usa el tagged template')
    }
    cliente.unsafe = (_sql: string, params: unknown[] = []) => {
      parametros.push(params)
      const entregar = () => Promise.resolve([])
      return {
        then: (ok?: never, err?: never) => entregar().then(ok, err),
        catch: (err?: never) => entregar().catch(err),
        finally: (fin?: never) => entregar().finally(fin),
        values: () => entregar(),
      }
    }
    cliente.options = { parsers: {}, serializers: {} }
    cliente.end = async () => {}
    return cliente
  },
}))

process.env.DATABASE_URL = 'postgres://usuario:clave@host/base'
process.env.SITE_TIMEZONE = 'America/Santiago'

// Import estático, después de los `vi.mock`: Vitest los sube al principio del archivo al
// transformarlo, así que el orden de las líneas no importa, pero un import dinámico dentro
// de cada `it` sí importa —cada uno paga otra vez la transformación de todo lo que
// `analytics`/`posts` arrastran (drizzle-orm, postgres, …), y bajo carga esa primera
// transformación puede no alcanzar a terminar antes de `testTimeout`. Mismo motivo que en
// `usuarios.test.ts` (ver el comentario de sus líneas 50-54).
const { getTimeSeries } = await import('./analytics')
const { getPostSeries } = await import('./posts')

beforeEach(() => {
  parametros.length = 0
})

const FILTROS = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  profileId: null,
  from: new Date('2026-08-23T00:00:00Z'),
  to: new Date('2026-09-22T00:00:00Z'),
  includeBots: false,
}

/** Todos los parámetros que la función alcanzó a mandar, aplanados. */
function todos(): unknown[] {
  return parametros.flat()
}

describe('ningún Date llega crudo al driver', () => {
  it('analytics: getTimeSeries manda sus fechas como texto', async () => {
    await getTimeSeries(FILTROS)
    const enviados = todos()
    expect(enviados.length).toBeGreaterThan(0)
    expect(enviados.filter((p) => p instanceof Date)).toEqual([])
  })

  it('posts: getPostSeries manda sus fechas como texto', async () => {
    await getPostSeries(FILTROS)
    const enviados = todos()
    expect(enviados.length).toBeGreaterThan(0)
    expect(enviados.filter((p) => p instanceof Date)).toEqual([])
  })
})
