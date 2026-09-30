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
// La Tarea 7 suma la primera ruta móvil a este archivo: el guardia del teléfono no lee
// la petición que le pasa el test, así que una `Request` cualquiera sirve.
vi.mock('@/lib/mobile-guardia', () => ({ requireMobileUser: async () => USUARIO }))

type Captura = { sql: string; params: unknown[] }
const capturas: Captura[] = []

/**
 * Respuestas programadas para consultas sucesivas de una misma función, en orden. Una
 * función que encadena varias consultas (la fila que decide si sigue, o el resultado que
 * usa la consulta siguiente) necesita que las que la preceden se resuelvan de verdad, no
 * que rechacen: si no hay respuesta en la cola, la consulta rechaza igual que siempre.
 */
const colaRespuestas: unknown[] = []

/**
 * El cliente falso. `drizzle-orm/postgres-js` le pide dos cosas al construirse y una al
 * consultar:
 *
 *  - `options.parsers` y `options.serializers`, donde escribe sus conversores de fecha
 *    apenas se construye — si no existen, `drizzle()` revienta antes del primer test.
 *  - `unsafe(sql, params)`, que devuelve algo que se puede esperar *y* que además tiene
 *    `.values()`: Drizzle usa la primera forma cuando no mapea columnas y la segunda
 *    cuando sí. Las dos entregan la misma respuesta de la cola, una sola vez.
 *
 * La captura ocurre al construir la consulta, no al esperarla, que es lo que permite ver
 * todas las que una función alcanza a armar antes de que la primera sin respuesta la frene.
 */
function respuesta() {
  const entregar = () =>
    colaRespuestas.length > 0
      ? Promise.resolve(colaRespuestas.shift())
      : Promise.reject(new Error('aislamiento.test: sin red, a propósito'))
  return {
    then: (ok?: never, err?: never) => entregar().then(ok, err),
    catch: (err?: never) => entregar().catch(err),
    finally: (fin?: never) => entregar().finally(fin),
    values: () => entregar(),
  }
}

vi.mock('postgres', () => ({
  default: () => {
    const cliente = () => {
      throw new Error('aislamiento.test: este test no usa el tagged template, solo unsafe()')
    }
    cliente.unsafe = (sqlText: string, params: unknown[] = []) => {
      capturas.push({ sql: sqlText, params })
      return respuesta()
    }
    cliente.options = { parsers: {}, serializers: {} }
    cliente.end = async () => {}
    // `db.transaction()` de postgres-js pide `client.begin(fn)` (ver
    // `drizzle-orm/postgres-js/session`), no `unsafe()` directo. Este test no verifica
    // atomicidad de verdad (eso lo cubre `actions.test.ts`), solo que las consultas de
    // adentro también queden atadas al dueño — así que basta con correr el callback con el
    // mismo cliente, sin BEGIN/COMMIT reales.
    cliente.begin = async (fn: (client: typeof cliente) => Promise<unknown>) => fn(cliente)
    return cliente
  },
}))

process.env.DATABASE_URL = 'postgres://usuario:clave@host/base'
// `guardarCuenta` cifra el token antes de escribirlo, y `encryptToken` deriva su llave de
// `AUTH_SECRET`. Sin esto, la función revienta antes de construir ninguna consulta.
process.env.AUTH_SECRET = 'secreto-de-prueba-para-el-arnes'

// Import estático, después de los `vi.mock`: Vitest los sube al principio del archivo al
// transformarlo, así que el orden de las líneas no importa, pero un import dinámico dentro
// de cada `it` sí importa —cada uno paga otra vez la transformación de todo lo que carga
// (drizzle-orm, postgres, …), y bajo carga esa primera transformación puede no alcanzar a
// terminar antes de `testTimeout`. Mismo motivo que en `usuarios.test.ts` (ver el
// comentario de sus líneas 50-54).
const { getRecentVisits } = await import('./analytics')
const { getCuentas, cargaPorDia, getPostRows } = await import('./posts')
const { getAllProfiles, getProfileBySlug } = await import('./profiles')
const { getCola } = await import('./comentarios-cola')
const { verificarCuentas, cuentaUnicaPorRed } = await import('./social/cuentas')
const { todosLosCortes, cortesEntre, quemadosDe, servidosAyer } = await import('./social/publish/cortes')
const { leerAjuste } = await import('./ajustes')
const { makeDefault, updateProfile, deleteScheduledPost, guardarCuenta } = await import('@/app/admin/actions')
// `guardarCuenta` son dos funciones distintas con el mismo nombre: la de `admin/actions`
// guarda la cuenta *del usuario* y la de `social/conectar`, una cuenta *de una red*.
const { guardarCuenta: guardarCuentaDeRed } = await import('./social/conectar')

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
  zona: 'America/Santiago',
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

/** Una petición cualquiera: `requireMobileUser` está simulado y no la mira. */
function peticionMovil(): Request {
  return new Request('https://ejemplo.cl/api/mobile/schedule/accounts')
}

describe('aislamiento por dueño (SQL generado, sin base)', () => {
  it('analytics: getRecentVisits filtra las visitas por el dueño del perfil', async () => {
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
    const consultas = await todasLasConsultas(() => getCuentas(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('posts: cargaPorDia filtra la agenda por dueño', async () => {
    const consultas = await todasLasConsultas(() =>
      cargaPorDia(DUENO, 'America/Santiago', new Date('2026-01-01')),
    )
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('profiles: getAllProfiles filtra los perfiles por dueño', async () => {
    const consultas = await todasLasConsultas(() => getAllProfiles(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  /**
   * Sin `ownerId`, `getProfileBySlug` tiene que seguir sirviendo el perfil de «círculo
   * cercano» del dueño, compartido por dirección secreta desde su propio dominio: ese
   * camino no puede quedar acotado a nadie. Por eso este caso comprueba justo lo
   * contrario que `esperarFiltradoPorDueno`, que exige el filtro.
   */
  it('profiles: getProfileBySlug sin ownerId no filtra por dueño (el círculo cercano sigue andando)', async () => {
    const consultas = await todasLasConsultas(() => getProfileBySlug('la-direccion-secreta'))
    expect(consultas).toHaveLength(1)
    const [{ sql, params }] = consultas as [Captura]
    expect(params).not.toContain(DUENO)
    // Solo el WHERE importa acá: las columnas seleccionadas incluyen "owner_id" igual,
    // así que el filtro de verdad se busca donde vive, no en la lista de columnas.
    expect(sql.split(/\bwhere\b/i).pop()).not.toMatch(/"owner_id"/)
  })

  it('profiles: getProfileBySlug con ownerId solo devuelve la fila si es de ese dueño', async () => {
    const consultas = await todasLasConsultas(() => getProfileBySlug('juanito', DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  /**
   * `ownerId` es un `string | undefined`: una cadena vacía es un valor válido de ese tipo,
   * no la ausencia del argumento. El filtro tiene que reaccionar a que el llamador haya
   * pasado algo, no a si ese algo es "verdadero" — `ownerId ? … : …` trataría `''` igual
   * que "no lo pasaron" y dejaría la consulta sin acotar. Hoy `adminId()` nunca devuelve
   * `''` (da un uuid o lanza), así que este caso es inalcanzable en producción, pero es la
   * línea exacta de la que depende todo el aislamiento de esta tarea.
   */
  it('profiles: getProfileBySlug con ownerId "" también filtra (presencia, no verdad)', async () => {
    const consultas = await todasLasConsultas(() => getProfileBySlug('juanito', ''))
    expect(consultas).toHaveLength(1)
    const [{ sql, params }] = consultas as [Captura]
    expect(params).toContain('')
    expect(sql.split(/\bwhere\b/i).pop()).toMatch(/"owner_id"\s*=\s*\$/)
  })

  it('comentarios-cola: getCola filtra por el dueño de la cuenta', async () => {
    const consultas = await todasLasConsultas(() => getCola(DUENO, { estado: 'pendientes', red: null }))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('social/cuentas: verificarCuentas ata la consulta al dueño', async () => {
    const consultas = await todasLasConsultas(() => verificarCuentas(DUENO, ['cuenta-1']))
    expect(consultas).toHaveLength(1)
    esperarFiltradoPorDueno(consultas[0]!)
  })

  it('social/cuentas: cuentaUnicaPorRed ata la consulta al dueño', async () => {
    const consultas = await todasLasConsultas(() => cuentaUnicaPorRed(DUENO, ['instagram']))
    expect(consultas).toHaveLength(1)
    esperarFiltradoPorDueno(consultas[0]!)
  })

  /**
   * Las tres lecturas de cortes comparten un cargador: posts + destinos + handle en una
   * consulta, y la media en otra por los ids que esa ya filtró (mismo criterio que
   * `post_metrics` en `getPostRows`). Sin filas, la de media no se construye: por eso
   * cada caso ve una sola consulta, y `quemadosDe` lleva su subconsulta de fallos
   * *antes* del dueño en el `where` — el arnés mira lo que queda tras el último «where».
   */
  it('social/publish/cortes: todosLosCortes ata su consulta al dueño', async () => {
    const consultas = await todasLasConsultas(() => todosLosCortes(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('social/publish/cortes: cortesEntre ata su consulta al dueño', async () => {
    const consultas = await todasLasConsultas(() =>
      cortesEntre(DUENO, new Date('2026-01-01'), new Date('2026-01-31')),
    )
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('social/publish/cortes: quemadosDe ata su consulta al dueño, con la subconsulta de fallos dentro', async () => {
    const consultas = await todasLasConsultas(() => quemadosDe(DUENO))
    expect(consultas).toHaveLength(1)
    for (const c of consultas) esperarFiltradoPorDueno(c)
    expect(consultas[0]!.params).toContain('failed')
  })

  /**
   * `servidosAyer` encadena tres consultas: los destinos publicados ayer (atada al
   * dueño), los `social_posts` que cruzan por `external_id` (atada al dueño) y las
   * métricas de esos posts (`post_metrics` no tiene columna de dueño, así que va por
   * los ids que la consulta anterior ya filtró — mismo criterio que `getPostRows` más
   * arriba). Con un destino publicado y un post que cruza, la tercera consulta se
   * queda sin respuesta y revienta ahí, que es lo único que hace falta para verla.
   */
  it('social/publish/cortes: servidosAyer ata sus tres consultas al dueño, directo o por el id que ya filtró la anterior', async () => {
    // Cada fila es un arreglo de valores en el orden del `select`, no un objeto: la
    // primera consulta selecciona `postId, network, externalId` y la segunda
    // `id, network, externalId` — mismo formato que `filaPost` más abajo. La red tiene
    // que coincidir, o el cruce `red:externalId` descarta el post y no hay tercera.
    const consultas = await consultasEncadenadas(
      () => servidosAyer(DUENO, new Date('2026-01-02T12:00:00Z'), 'America/Santiago'),
      [[['post-1', 'instagram', 'ext-1']], [['social-post-1', 'instagram', 'ext-1']]],
    )
    expect(consultas).toHaveLength(3)
    const [destinos, posts, metricas] = consultas as [Captura, Captura, Captura]
    esperarFiltradoPorDueno(destinos)
    esperarFiltradoPorDueno(posts)
    expect(metricas.params).toContain('social-post-1') // post_metrics: por el id que ya filtró `posts`.
  })

  it('ajustes: leerAjuste filtra por dueño', async () => {
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
      [[filaPost], [], [], [], []],
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
    const consultas = await consultasEncadenadas(() => makeDefault(PERFIL), [
      [[PERFIL]], // la fila existe y es del dueño: sigue.
      [], // degradar a las demás: sigue.
    ])
    expect(consultas).toHaveLength(3)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  it('admin/actions: updateProfile ata su UPDATE al dueño', async () => {
    const formData = new FormData()
    formData.set('displayName', 'Nombre de prueba')
    const consultas = await consultasEncadenadas(() => updateProfile(PERFIL, {}, formData))
    expect(consultas).toHaveLength(1)
    esperarFiltradoPorDueno(consultas[0]!)
  })

  /**
   * «Tu Cuenta» es la única escritura del panel cuyo dueño no es un `owner_id`: la fila que
   * toca **es** la del usuario, así que la reja es `users.id = <el de la sesión>`. Por eso
   * no usa `esperarFiltradoPorDueno`, que exige la columna `owner_id` literal, y comprueba
   * lo mismo a mano: el predicado cae en el WHERE y el id viaja como parámetro ligado.
   */
  it('admin/actions: guardarCuenta ata su UPDATE a la fila del usuario de la sesión', async () => {
    const formData = new FormData()
    formData.set('nombre', 'Ana')
    formData.set('zona', 'Europe/Madrid')
    const consultas = await consultasEncadenadas(() => guardarCuenta(formData))
    expect(consultas).toHaveLength(1)

    const { sql, params } = consultas[0]!
    expect(sql).toMatch(/update "users"/i)
    expect(sql.split(/\bwhere\b/i).pop()).toMatch(/"id"\s*=\s*\$/)
    expect(params).toContain(DUENO)
    // Y el dueño va como parámetro ligado, nunca escrito en el texto de la consulta.
    expect(sql).not.toContain(DUENO)
  })

  it('admin/actions: deleteScheduledPost ata su lectura y su DELETE al dueño', async () => {
    // La lectura es una sola (post + estado de cada destino, por leftJoin): con un
    // destino programado sigue al DELETE. Cero filas sería «no existe» y no borraría.
    const consultas = await consultasEncadenadas(() => deleteScheduledPost('post-x'), [
      [{ postId: 'post-x', status: 'scheduled' }],
    ])
    expect(consultas).toHaveLength(2)
    for (const c of consultas) esperarFiltradoPorDueno(c)
  })

  /**
   * `guardarCuenta` es por donde pasa toda cuenta conectada, y la entrega de Meta le tocó
   * el `insert` y el `set` del `onConflictDoUpdate`. No usa `esperarFiltradoPorDueno`
   * porque ninguna de sus dos consultas tiene —ni puede tener— un `owner_id` en el WHERE:
   *
   * - La lectura busca por `(network, external_id)` **a propósito**: es justamente el
   *   guardia que descubre que esa cuenta ya es de otro dueño. Filtrar por el dueño de
   *   turno la dejaría ciega y el `insert` pisaría el token del primero.
   * - El `insert` no lleva WHERE, y su `onConflictDoUpdate` apunta a `(network,
   *   external_id)` porque esa es hoy la única de la tabla. Lo que sí tiene que ser cierto
   *   —y es lo que este caso fija— es que el `owner_id` que se escribe sea el que llegó
   *   por parámetro, y no uno derivado de la fila que ya estaba.
   */
  it('social/conectar: guardarCuenta escribe con el dueño que recibió', async () => {
    const consultas = await consultasEncadenadas(
      () =>
        guardarCuentaDeRed(DUENO, 'instagram', {
          externalId: '17841400000000000',
          handle: 'cuenta',
          accessToken: 'token',
          refreshToken: null,
          expiresAt: null,
          metaUserId: '10201234567890',
        }),
      [[]], // nadie tiene esa cuenta todavía: sigue al insert.
    )
    expect(consultas).toHaveLength(2)

    const [lectura, escritura] = consultas as [Captura, Captura]
    // La lectura mira la cuenta, no al dueño: ese es el guardia de choque.
    expect(lectura.sql).toMatch(/from "social_accounts"/i)
    expect(lectura.params).toContain('17841400000000000')

    expect(escritura.sql).toMatch(/insert into "social_accounts"/i)
    expect(escritura.params).toContain(DUENO)
    // Y el dueño va como parámetro ligado, nunca escrito en el texto de la consulta.
    expect(escritura.sql).not.toContain(DUENO)
  })

  it('api/mobile/schedule/accounts: lista solo las cuentas del dueño', async () => {
    const { GET } = await import('../app/api/mobile/schedule/accounts/route')
    const consultas = await todasLasConsultas(() => GET(peticionMovil()))
    expect(consultas).toHaveLength(1)
    esperarFiltradoPorDueno(consultas[0]!)
  })

  /**
   * Ronda de arreglos de la Tarea 7, punto 1: sin este filtro, una cuenta de TikTok
   * saldría en la lista y la app dibujaría un chip que el servidor iba a rechazar
   * después de que el dueño subiera el archivo.
   */
  it('api/mobile/schedule/accounts: no ofrece redes que el teléfono no publica (TikTok)', async () => {
    const { GET } = await import('../app/api/mobile/schedule/accounts/route')
    const consultas = await todasLasConsultas(() => GET(peticionMovil()))
    expect(consultas).toHaveLength(1)
    const { sql, params } = consultas[0]!
    const where = sql.split(/\bwhere\b/i).pop()!
    expect(where).toMatch(/"network"\s+in\s*\(/i)
    expect(params).not.toContain('tiktok')
  })
})
