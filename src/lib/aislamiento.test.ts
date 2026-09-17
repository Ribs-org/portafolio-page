import { beforeEach, describe, expect, it, vi } from 'vitest'

// `npm test` corre en CI sin `DATABASE_URL`: este archivo no puede necesitar una base.
//
// `getDb()` (en `src/db`) construye su cliente con `drizzle(neon(DATABASE_URL))`, y ni
// `neon()` ni `drizzle()` abren una conexión por sí solos — solo la abren al ejecutar una
// consulta. Así que este test deja pasar una `DATABASE_URL` falsa, sustituye el cliente
// HTTP de `@neondatabase/serverless` por uno que nunca sale a la red y se limita a anotar
// el SQL y los parámetros que Drizzle le habría mandado, y llama a las funciones reales
// del módulo. Cada una revienta al llegar a la "red" (a propósito), pero ya alcanzó a
// construir y a entregarle a Drizzle la consulta completa — que es lo que se inspecciona.
//
// `import 'server-only'` tampoco resuelve bajo Vitest (el paquete no está en
// `node_modules`; solo lo entiende el bundler de Next), así que se sustituye por un
// módulo vacío para poder importar los módulos reales sin arrastrar esa barrera.
vi.mock('server-only', () => ({}))

type Captura = { sql: string; params: unknown[] }
const capturas: Captura[] = []

vi.mock('@neondatabase/serverless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neondatabase/serverless')>()
  return {
    ...actual,
    neon: () => (sqlText: string, params: unknown[]) => {
      capturas.push({ sql: sqlText, params })
      return Promise.reject(new Error('aislamiento.test: sin red, a propósito'))
    },
  }
})

process.env.DATABASE_URL = 'postgres://usuario:clave@host/base'

beforeEach(() => {
  capturas.length = 0
})

/**
 * Llama a la función real, deja que reviente contra la "red" falsa y devuelve la
 * primera consulta que alcanzó a construir. Si la función no llega a consultar nada
 * (por ejemplo, porque valida antes y no encuentra nada que pedir), no hay captura y
 * el `expect` de abajo lo delata: un test que no puede fallar no sirve.
 */
async function primeraConsulta(llamada: () => Promise<unknown>): Promise<Captura> {
  await expect(llamada()).rejects.toThrow()
  expect(capturas.length).toBeGreaterThan(0)
  return capturas[0]!
}

const DUENO = 'owner-1'

/** owner_id como parámetro ligado de verdad, no solo como texto en el SQL: una columna
 * seleccionada también se llama "owner_id" y por sí sola no prueba ningún filtro. */
function esperarFiltradoPorDueno({ sql, params }: Captura) {
  expect(sql).toMatch(/"owner_id"\s*=\s*\$/)
  expect(params).toContain(DUENO)
}

describe('aislamiento por dueño (SQL generado, sin base)', () => {
  it('analytics: getRecentVisits filtra las visitas por el dueño del perfil', async () => {
    const { getRecentVisits } = await import('./analytics')
    const consulta = await primeraConsulta(() =>
      getRecentVisits({
        ownerId: DUENO,
        profileId: null,
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
        includeBots: true,
      }),
    )
    esperarFiltradoPorDueno(consulta)
  })

  it('posts: getCuentas filtra las cuentas por dueño', async () => {
    const { getCuentas } = await import('./posts')
    const consulta = await primeraConsulta(() => getCuentas(DUENO))
    esperarFiltradoPorDueno(consulta)
  })

  it('profiles: getAllProfiles filtra los perfiles por dueño', async () => {
    const { getAllProfiles } = await import('./profiles')
    const consulta = await primeraConsulta(() => getAllProfiles(DUENO))
    esperarFiltradoPorDueno(consulta)
  })

  it('comentarios-cola: getCola filtra por el dueño de la cuenta', async () => {
    const { getCola } = await import('./comentarios-cola')
    const consulta = await primeraConsulta(() => getCola(DUENO, { estado: 'pendientes', red: null }))
    esperarFiltradoPorDueno(consulta)
  })

  it('social/cuentas: cuentasPrimarias filtra por dueño', async () => {
    const { cuentasPrimarias } = await import('./social/cuentas')
    const consulta = await primeraConsulta(() => cuentasPrimarias(DUENO, ['instagram']))
    esperarFiltradoPorDueno(consulta)
  })

  it('ajustes: leerAjuste filtra por dueño', async () => {
    const { leerAjuste } = await import('./ajustes')
    const consulta = await primeraConsulta(() => leerAjuste(DUENO, 'voz'))
    esperarFiltradoPorDueno(consulta)
  })
})
