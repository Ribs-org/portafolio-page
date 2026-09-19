import { beforeEach, describe, expect, it, vi } from 'vitest'

// `npm test` corre en CI sin `DATABASE_URL`: este archivo no puede necesitar una base.
//
// `getDb()` (en `src/db`) construye su cliente con `drizzle(neon(DATABASE_URL))`, y ni
// `neon()` ni `drizzle()` abren una conexión por sí solos — solo la abren al ejecutar una
// consulta. Así que este test deja pasar una `DATABASE_URL` falsa, sustituye el cliente
// HTTP de `@neondatabase/serverless` por uno que nunca sale a la red y se limita a anotar
// el SQL y los parámetros que Drizzle le habría mandado, y llama a las funciones reales
// del módulo. Cada una revienta al llegar a la "red" (a propósito) salvo que la consulta
// tenga una respuesta programada (ver `colaRespuestas`), que es lo que hace falta para
// que una función que encadena varias consultas alcance a construir la segunda, la
// tercera, etc. — antes de eso, con todo rechazando siempre, la primera consulta frenaba
// a la función y `capturas` nunca pasaba de un elemento.
//
// `import 'server-only'` tampoco resuelve bajo Vitest (el paquete no está en
// `node_modules`; solo lo entiende el bundler de Next), así que se sustituye por un
// módulo vacío para poder importar los módulos reales sin arrastrar esa barrera.
vi.mock('server-only', () => ({}))

// Las tres acciones de escritura que este archivo también cubre viven en
// `src/app/admin/actions.ts`, un archivo `'use server'` que usa `next/headers`,
// `next/cache` y `next/navigation` fuera de una petición real, y que se autentica con
// `requireUser`. Nada de eso es lo que este archivo verifica (eso lo prueba, si acaso,
// un test de esas rutas); acá solo importa que la función reciba el `ownerId` de
// `requireUser` y lo ate a cada consulta, así que se sustituyen por lo mínimo que hace
// falta para que el módulo cargue y la función corra.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('aislamiento.test: redirect() no debía llamarse en este caso')
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }))
vi.mock('@/lib/auth', () => ({
  requireUser: async () => USUARIO,
  requireAdmin: async () => USUARIO,
  destroySession: async () => {},
}))

type Captura = { sql: string; params: unknown[] }
const capturas: Captura[] = []

/**
 * Respuestas programadas para consultas sucesivas de una misma función, en orden. Una
 * función que encadena varias consultas (la fila que decide si sigue, o el resultado que
 * usa la consulta siguiente) necesita que las que la preceden se resuelvan de verdad, no
 * que rechacen: si no hay respuesta en la cola, la consulta rechaza igual que siempre.
 */
const colaRespuestas: unknown[] = []

vi.mock('@neondatabase/serverless', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neondatabase/serverless')>()
  return {
    ...actual,
    neon: () => (sqlText: string, params: unknown[]) => {
      capturas.push({ sql: sqlText, params })
      if (colaRespuestas.length > 0) return Promise.resolve(colaRespuestas.shift())
      return Promise.reject(new Error('aislamiento.test: sin red, a propósito'))
    },
  }
})

process.env.DATABASE_URL = 'postgres://usuario:clave@host/base'

beforeEach(() => {
  capturas.length = 0
  colaRespuestas.length = 0
})

const DUENO = 'owner-1'

const USUARIO = {
  id: DUENO,
  correo: 'dueno@example.com',
  nombre: null,
  rol: 'usuario' as const,
  sesionVersion: 1,
  invitadoEn: new Date('2026-01-01'),
  primerIngresoEn: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

/**
 * Llama a la función real, deja que reviente contra la "red" falsa y devuelve TODAS las
 * consultas que alcanzó a construir (no solo la primera: el punto ciego que tenía este
 * archivo era mirar solo `capturas[0]`, que para una función de una sola consulta da lo
 * mismo, pero deja sin mirar a cualquier otra que la función alcance a construir antes de
 * que la que rechaza la frene). Si la función no llega a consultar nada, no hay captura y
 * el `expect` de abajo lo delata: un test que no puede fallar no sirve.
 */
async function todasLasConsultas(llamada: () => Promise<unknown>): Promise<Captura[]> {
  await expect(llamada()).rejects.toThrow()
  expect(capturas.length).toBeGreaterThan(0)
  return capturas.slice()
}

/**
 * Como `todasLasConsultas`, pero para una función que encadena varias consultas donde
 * cada una depende del resultado de la anterior (una fila que decide si sigue, o un id
 * que la siguiente consulta necesita). `respuestas` son las que hacen falta para que la
 * función avance más allá de la primera; la que se queda sin respuesta en la cola
 * revienta igual que siempre, y si la cola alcanza para todas la función simplemente
 * termina — de cualquier modo, lo único que importa es qué alcanzó a construir.
 */
async function consultasEncadenadas(
  llamada: () => Promise<unknown>,
  respuestas: unknown[] = [],
): Promise<Captura[]> {
  colaRespuestas.push(...respuestas)
  await llamada().catch(() => undefined)
  expect(capturas.length).toBeGreaterThan(0)
  return capturas.slice()
}

/**
 * owner_id como parámetro ligado de verdad, no solo como texto en el SQL: una columna
 * seleccionada también se llama "owner_id" y por sí sola no prueba ningún filtro.
 *
 * Y el predicado tiene que caer en la cláusula WHERE, no en el ON de un leftJoin: un
 * leftJoin con la condición en el ON no filtra nada, devuelve todas las filas con las
 * columnas del padre en NULL (así falló `getTopLinks` una vez en esta rama). Por eso se
 * corta el SQL en el último "where" y se busca el predicado solo en lo que queda:
 * - Consulta simple, un único WHERE: lo que queda es esa cláusula entera. Acepta.
 * - Subconsulta legítima dentro del WHERE (el patrón
 *   `inArray(hija.padreId, select … where owner_id = $)`): el "where" de la
 *   subconsulta es el más a la derecha del texto, así que lo que queda es justo su
 *   condición — sigue siendo parte del WHERE exterior. Acepta.
 * - Condición movida al ON de un leftJoin: el ON queda *antes* del "where" (o, si la
 *   consulta no tiene ningún WHERE propio, no hay "where" que cortar). En ningún caso
 *   aparece en lo que queda tras el corte. Rechaza.
 */
function esperarFiltradoPorDueno({ sql, params }: Captura) {
  expect(params).toContain(DUENO)
  const partes = sql.split(/\bwhere\b/i)
  expect(partes.length).toBeGreaterThan(1) // tiene que existir al menos un WHERE real.
  expect(partes.pop()).toMatch(/"owner_id"\s*=\s*\$/)
}

describe('aislamiento por dueño (SQL generado, sin base)', () => {
  it('analytics: getRecentVisits filtra las visitas por el dueño del perfil', async () => {
    const { getRecentVisits } = await import('./analytics')
    const consultas = await todasLasConsultas(() =>
      getRecentVisits({
        ownerId: DUENO,
        profileId: null,
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
        includeBots: true,
      }),
    )
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('posts: getCuentas filtra las cuentas por dueño', async () => {
    const { getCuentas } = await import('./posts')
    const consultas = await todasLasConsultas(() => getCuentas(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('posts: cargaPorDia filtra la agenda por dueño', async () => {
    const { cargaPorDia } = await import('./posts')
    const consultas = await todasLasConsultas(() =>
      cargaPorDia(DUENO, 'America/Santiago', new Date('2026-01-01')),
    )
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('profiles: getAllProfiles filtra los perfiles por dueño', async () => {
    const { getAllProfiles } = await import('./profiles')
    const consultas = await todasLasConsultas(() => getAllProfiles(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('comentarios-cola: getCola filtra por el dueño de la cuenta', async () => {
    const { getCola } = await import('./comentarios-cola')
    const consultas = await todasLasConsultas(() => getCola(DUENO, { estado: 'pendientes', red: null }))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('social/cuentas: cuentasPrimarias filtra por dueño', async () => {
    const { cuentasPrimarias } = await import('./social/cuentas')
    const consultas = await todasLasConsultas(() => cuentasPrimarias(DUENO, ['instagram']))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('ajustes: leerAjuste filtra por dueño', async () => {
    const { leerAjuste } = await import('./ajustes')
    const consultas = await todasLasConsultas(() => leerAjuste(DUENO, 'voz'))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  /**
   * `getPostRows` hace cinco consultas encadenadas: posts, sus snapshots de métricas,
   * las visitas, los clics y el "alguna vez visto". Solo la primera (`social_posts`) y
   * las de visitas/clics tienen columna de dueño propia y llevan el filtro directo
   * (mismo criterio que `esperarFiltradoPorDueno` de arriba). La de métricas
   * (`post_metrics`) no tiene columna de dueño: va por los ids de los posts que la
   * primera consulta ya filtró por dueño — exigirle un `owner_id` directo sería ruidoso
   * (esa tabla no lo tiene). Para esa se comprueba en cambio que va ligada a un id de la
   * fila ya filtrada (el id del post que la primera consulta devolvió), no a la tabla
   * entera: si alguien le quitara el filtro por dueño a la primera consulta, esta
   * segunda seguiría atada a *algún* post, pero uno arbitrario en vez de 'post-1', así
   * que ese id ya no aparecería entre sus parámetros y la aserción fallaría.
   */
  it('posts: getPostRows filtra sus cinco consultas por dueño, directo o por el id que ya filtró la primera', async () => {
    const { getPostRows } = await import('./posts')
    // select() de social_posts trae todas sus columnas, en el orden declarado en el
    // esquema: id, owner_id, network, account_id, external_id, permalink, caption,
    // thumbnail_url, media_type, published_at, campaign, archived_at, created_at, updated_at.
    const filaPost = [
      'post-1',
      DUENO,
      'instagram',
      'acc-1',
      'ext-1',
      null,
      null,
      null,
      null,
      new Date('2026-01-10T00:00:00Z'),
      'tag-1',
      null,
      new Date('2026-01-10T00:00:00Z'),
      new Date('2026-01-10T00:00:00Z'),
    ]
    const consultas = await consultasEncadenadas(
      () =>
        getPostRows({
          ownerId: DUENO,
          profileId: null,
          from: new Date('2026-01-01'),
          to: new Date('2026-01-31'),
          includeBots: true,
        }),
      [{ rows: [filaPost] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }],
    )
    expect(consultas).toHaveLength(5)
    const [posts, metricas, visitas, clics, vistos] = consultas as [Captura, Captura, Captura, Captura, Captura]

    esperarFiltradoPorDueno(posts) // social_posts: filtro directo.
    expect(metricas.params).toContain('post-1') // post_metrics: por el id que ya filtró `posts`.
    esperarFiltradoPorDueno(visitas) // visits: por el profileId de una subconsulta a profiles filtrada por dueño.
    esperarFiltradoPorDueno(clics) // clicks: mismo molde.
    esperarFiltradoPorDueno(vistos) // "alguna vez visto": mismo molde.
  })
})

describe('aislamiento por dueño, escrituras (SQL generado, sin base)', () => {
  const PERFIL = 'profile-1'

  it('admin/actions: makeDefault ata sus tres consultas (leer, degradar, promover) al dueño', async () => {
    const { makeDefault } = await import('@/app/admin/actions')
    const consultas = await consultasEncadenadas(() => makeDefault(PERFIL), [
      { rows: [[PERFIL]] }, // la fila existe y es del dueño: sigue.
      { rows: [] }, // degradar a las demás: sigue.
    ])
    expect(consultas).toHaveLength(3)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('admin/actions: updateProfile ata su UPDATE al dueño', async () => {
    const { updateProfile } = await import('@/app/admin/actions')
    const formData = new FormData()
    formData.set('displayName', 'Nombre de prueba')
    const consultas = await consultasEncadenadas(() => updateProfile(PERFIL, {}, formData))
    expect(consultas).toHaveLength(1)
    esperarFiltradoPorDueno(consultas[0]!)
  })

  it('admin/actions: deleteScheduledPost ata su lectura y su DELETE al dueño', async () => {
    const { deleteScheduledPost } = await import('@/app/admin/actions')
    const consultas = await consultasEncadenadas(() => deleteScheduledPost('post-x'), [
      { rows: [] }, // sin targets publicados: sigue al DELETE.
    ])
    expect(consultas).toHaveLength(2)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })
})
