import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `usuarios.ts` importa `server-only`, que solo entiende el bundler de Next: se sustituye
// por un módulo vacío para poder importarlo bajo Vitest (mismo motivo que en
// `aislamiento.test.ts`).
vi.mock('server-only', () => ({}))

/**
 * Doble mínimo de `getDb()` para probar `invitar()` sin una base real. No intenta
 * parecerse a Drizzle en general: solo cubre las tres llamadas que hace este camino
 * (`select().from(users)...`, `insert(...).values(...)[.returning()]` y
 * `delete(users).where(...)`), con el mismo estado mutable que los tests llenan y leen.
 * `vi.hoisted` porque `vi.mock` se sube al principio del archivo y necesita verlo ya listo.
 */
const db = vi.hoisted(() => ({
  buscar: [] as unknown[],
  insertUser: [] as unknown[],
  insertProfile: async (slug: string): Promise<void> => void slug,
  slugsIntentados: [] as string[],
  borrados: [] as unknown[],
  // Para `quitar()`: las tablas que la transacción alcanzó a borrar, en el orden en que
  // las borró, y un error opcional para probar que uno de sus pasos se atrapa en vez de
  // llegar crudo a quien llama.
  transaccionBorrados: [] as unknown[],
  transaccionError: null as unknown,
  // Para `pedir()` (vía `asegurarAdmin()` y `pedidosRecientes()`): el admin ya tiene su
  // página por defecto, así que `asegurarAdmin()` no cae en `crearPaginaDe` —esa rama no es
  // lo que este archivo prueba— y no hay pedidos recientes salvo que un test los cargue.
  tienePagina: [{ id: 'profile-admin' }] as unknown[],
  adminRow: [{ id: 'admin-id' }] as unknown[],
  pedidosRecientes: [] as unknown[],
  insertCodigo: [{ id: 'codigo-nuevo' }] as unknown[],
  actualizados: [] as unknown[],
  // Lo que `pedir()` de verdad escribió al insertar el código: acá se comprueba el hash.
  valoresCodigo: [] as { hash: string }[],
}))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      select: () => ({
        from: (tabla: unknown) => ({
          where: () => ({
            // `buscarPorCorreo` (users) y el chequeo de página de `asegurarAdmin`
            // (profiles) llegan hasta acá sin pasar por `orderBy`.
            limit: async () => (tabla === real.profiles ? db.tienePagina : db.buscar),
            // Solo `pedidosRecientes` (codigosIngreso) ordena antes de limitar.
            orderBy: () => ({ limit: async () => db.pedidosRecientes }),
          }),
        }),
      }),
      insert: (tabla: unknown) => ({
        values: (v: { slug?: string; hash?: string }) => {
          if (tabla === real.profiles) {
            db.slugsIntentados.push(v.slug!)
            return db.insertProfile(v.slug!)
          }
          if (tabla === real.codigosIngreso) {
            db.valoresCodigo.push(v as { hash: string })
            return { returning: async () => db.insertCodigo }
          }
          return {
            returning: async () => db.insertUser,
            // El upsert del admin dentro de `asegurarAdmin()`.
            onConflictDoUpdate: () => ({ returning: async () => db.adminRow }),
          }
        },
      }),
      update: (tabla: unknown) => ({ set: () => ({ where: async () => void db.actualizados.push(tabla) }) }),
      delete: (tabla: unknown) => ({ where: async () => void db.borrados.push(tabla) }),
      // No intenta parecerse a una transacción real (no hay rollback): solo corre el
      // callback con un `tx` que anota, en orden, qué tabla borró cada `delete`, y que
      // puede fallar a mitad de camino si el test dejó cargado `transaccionError`.
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          delete: (tabla: unknown) => ({
            where: async () => {
              if (db.transaccionError) throw db.transaccionError
              db.transaccionBorrados.push(tabla)
            },
          }),
        }
        return fn(tx)
      },
    }),
  }
})

// Doble de `enviarCorreo`: anota cada mensaje que `pedir()` intentó mandar y responde según
// lo que el test dejó cargado, sin llamar a Resend de verdad.
const correo = vi.hoisted(() => ({ enviado: true, mandados: [] as { to: string; subject: string; text: string }[] }))
vi.mock('./correo', () => ({
  enviarCorreo: async (mensaje: { to: string; subject: string; text: string }) => {
    correo.mandados.push(mensaje)
    return correo.enviado
  },
}))

// Solo para que el test de más abajo pueda comprobar que el `delete` fue acotado por el id
// del usuario recién creado, sin tener que decodificar el SQL que arma Drizzle.
vi.mock('drizzle-orm', async (importOriginal) => {
  const real = await importOriginal<typeof import('drizzle-orm')>()
  return { ...real, eq: vi.fn(real.eq) }
})

// Import estático, después de los `vi.mock`: Vitest los sube al principio del archivo al
// transformarlo, así que el orden de las líneas no importa, pero un import dinámico dentro
// de cada `it` sí importa —cada uno paga otra vez la transformación de `usuarios.ts` y de
// lo que arrastra (drizzle-orm, postgres, …), y en esta máquina eso solo alcanza a tiempo
// la primera vez que corre.
const { claveCodigos, esChoqueDeUnicidad, invitar, pedir, quitar } = await import('./usuarios')
const { users, profiles } = await import('@/db')
const { eq } = await import('drizzle-orm')
const { USUARIO_CON_INGRESOS, codigoCoincide } = await import('./ingreso')

// La forma real de un error de unicidad del driver de este proyecto (`postgres`, no
// `node-postgres`): mapea el campo a `constraint_name`, no a `constraint` — ver
// `node_modules/postgres/src/connection.js:46` y la clase `PostgresError` en
// `node_modules/postgres/src/errors.js`, que vuelca esos campos sobre un `Error` real.
const erorPostgres = (constraint_name: string) => ({ code: '23505', constraint_name })

describe('esChoqueDeUnicidad', () => {
  it('reconoce el choque cuando el código y la restricción vienen en el error mismo', () => {
    expect(esChoqueDeUnicidad(erorPostgres('profiles_slug_unique'))).toBe(true)
  })

  it('reconoce el choque cuando drizzle envolvió el error del driver en `cause`', () => {
    const error = { message: 'insert failed', cause: erorPostgres('profiles_slug_unique') }
    expect(esChoqueDeUnicidad(error)).toBe(true)
  })

  // Casar solo contra el código 23505 se tragaría una violación de unicidad ajena —de otra
  // columna o tabla— que debería propagarse en vez de reintentarse como si el slug elegido
  // ya estuviera ocupado.
  it('no confunde una violación de unicidad ajena con la de profiles.slug', () => {
    expect(esChoqueDeUnicidad(erorPostgres('users_correo_unique'))).toBe(false)
  })

  // `constraint` (sin `_name`) es el campo de `node-postgres`, que no es el driver de este
  // proyecto. Se acepta como respaldo —por si alguna capa lo normaliza—, pero solo cuando
  // no viene `constraint_name`, que es lo que este driver manda de verdad.
  it('acepta `constraint` como respaldo cuando no viene `constraint_name`', () => {
    expect(esChoqueDeUnicidad({ code: '23505', constraint: 'profiles_slug_unique' })).toBe(true)
  })

  it('prefiere `constraint_name` sobre `constraint` cuando los dos vienen y no coinciden', () => {
    const error = { code: '23505', constraint_name: 'profiles_slug_unique', constraint: 'otra_restriccion' }
    expect(esChoqueDeUnicidad(error)).toBe(true)
  })

  it('no confunde una falla real (sin código) con un choque de unicidad', () => {
    expect(esChoqueDeUnicidad(new Error('la base no responde'))).toBe(false)
  })

  it('no revienta si el error no tiene ni código ni cause', () => {
    expect(esChoqueDeUnicidad('algo que no es un error')).toBe(false)
    expect(esChoqueDeUnicidad(null)).toBe(false)
    expect(esChoqueDeUnicidad(undefined)).toBe(false)
  })
})

describe('invitar', () => {
  const usuarioCreado = { id: 'id-nuevo', correo: 'ana@example.com', nombre: null }

  beforeEach(() => {
    db.buscar = []
    db.insertUser = [usuarioCreado]
    db.insertProfile = async () => {}
    db.slugsIntentados = []
    db.borrados = []
    vi.mocked(eq).mockClear()
  })

  it('camino feliz: crea al usuario y su página en la primera dirección libre', async () => {
    const resultado = await invitar('ana@example.com', null)
    expect(resultado).toEqual({ usuario: usuarioCreado })
    expect(db.slugsIntentados).toEqual(['ana'])
    expect(db.borrados).toEqual([])
  })

  it('si la dirección choca, reintenta con la siguiente y no borra al usuario', async () => {
    let llamada = 0
    db.insertProfile = async () => {
      llamada++
      if (llamada === 1) throw erorPostgres('profiles_slug_unique')
    }
    const resultado = await invitar('ana@example.com', null)
    expect(resultado).toEqual({ usuario: usuarioCreado })
    expect(db.slugsIntentados).toEqual(['ana', 'ana-2'])
    expect(db.borrados).toEqual([])
  })

  // La línea que justifica este archivo: si crear la página falla de verdad (no un choque
  // de unicidad), `invitar()` borra la fila de `users` recién creada —acotada por su id— y
  // dejar salir el error original, no uno nuevo del borrado.
  it('si crear la página falla de verdad, borra al usuario recién creado y propaga el error original', async () => {
    const errorDeVerdad = new Error('la base no responde')
    db.insertProfile = async () => {
      throw errorDeVerdad
    }
    await expect(invitar('ana@example.com', null)).rejects.toBe(errorDeVerdad)
    expect(db.borrados).toEqual([users])
    expect(eq).toHaveBeenCalledWith(users.id, usuarioCreado.id)
    // Y no con la del perfil: lo que se borra es la invitación, no la página a medias.
    expect(eq).not.toHaveBeenCalledWith(profiles.id, expect.anything())
  })
})

describe('quitar', () => {
  const usuarioSinIngresos = {
    id: 'id-a-quitar',
    correo: 'nuevo@example.com',
    nombre: null,
    rol: 'usuario' as const,
    primerIngresoEn: null,
  }

  beforeEach(() => {
    db.buscar = []
    db.transaccionBorrados = []
    db.transaccionError = null
  })

  // La razón de este archivo: desde que todo usuario nace con su página, `profiles.owner_id`
  // (que referencia a `users.id` con ON DELETE restrict) siempre tiene una fila apuntando al
  // usuario que se quiere quitar. Borrar `users` sin borrar antes su perfil violaría esa
  // restricción siempre, así que la página se borra primero y dentro de la misma transacción:
  // todo o nada, para no dejar nunca un usuario sin ella.
  it('camino feliz: borra el perfil del usuario y al usuario, en ese orden, dentro de una transacción', async () => {
    db.buscar = [usuarioSinIngresos]
    const resultado = await quitar(usuarioSinIngresos.id)
    expect(resultado).toEqual({ ok: true })
    expect(db.transaccionBorrados).toEqual([profiles, users])
  })

  it('si la transacción falla (p.ej. la restricción de clave foránea), devuelve un error en vez de lanzarlo crudo', async () => {
    db.buscar = [usuarioSinIngresos]
    db.transaccionError = Object.assign(new Error('violación de clave foránea'), { code: '23503' })
    const resultado = await quitar(usuarioSinIngresos.id)
    expect('error' in resultado).toBe(true)
    if ('error' in resultado) expect(resultado.error.length).toBeGreaterThan(0)
  })

  it('un usuario con ingresos sigue sin poder quitarse, sin tocar la transacción', async () => {
    db.buscar = [{ ...usuarioSinIngresos, primerIngresoEn: new Date('2026-01-01') }]
    const resultado = await quitar(usuarioSinIngresos.id)
    expect(resultado).toEqual({ error: USUARIO_CON_INGRESOS })
    expect(db.transaccionBorrados).toEqual([])
  })

  it('un id que no existe no es un error: no hay nada que quitar', async () => {
    db.buscar = []
    const resultado = await quitar('no-existe')
    expect(resultado).toEqual({ ok: true })
    expect(db.transaccionBorrados).toEqual([])
  })
})

describe('pedir', () => {
  const usuarioRevision = { id: 'id-revision', correo: 'revision@tu-parrilla.cl', nombre: null, rol: 'usuario' as const }

  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAIL', 'admin@example.com')
    vi.stubEnv('AUTH_SECRET', 'una-clave-larga-de-prueba')
    db.buscar = [usuarioRevision]
    db.tienePagina = [{ id: 'profile-admin' }]
    db.pedidosRecientes = []
    db.valoresCodigo = []
    db.actualizados = []
    db.borrados = []
    correo.enviado = true
    correo.mandados = []
  })

  afterEach(() => vi.unstubAllEnvs())

  // La puerta del revisor de Meta (§4b de la spec): con las dos variables puestas y ese
  // correo exacto, `pedir()` guarda el código fijo en vez de uno al azar y no manda nada —
  // el revisor no puede leer nuestro correo, así que no hay nada que mandarle.
  it('con las dos variables puestas, el correo de revisión guarda el código fijo y no manda nada', async () => {
    vi.stubEnv('REVISION_CORREO', 'revision@tu-parrilla.cl')
    vi.stubEnv('REVISION_CODIGO', '123456')
    const ok = await pedir(usuarioRevision.correo)
    expect(ok).toBe(true)
    expect(db.valoresCodigo).toHaveLength(1)
    expect(codigoCoincide('123456', db.valoresCodigo[0]!.hash, claveCodigos())).toBe(true)
    expect(correo.mandados).toEqual([])
  })

  // Con las mismas variables puestas, un correo distinto del de revisión sigue su camino de
  // siempre: código al azar y correo mandado. La puerta es para un solo correo, no para
  // todos mientras dure el App Review.
  it('con las variables puestas, otro correo sigue recibiendo un código al azar por correo', async () => {
    vi.stubEnv('REVISION_CORREO', 'revision@tu-parrilla.cl')
    vi.stubEnv('REVISION_CODIGO', '123456')
    const otraPersona = { ...usuarioRevision, id: 'id-otra', correo: 'otra@tu-parrilla.cl' }
    db.buscar = [otraPersona]
    const ok = await pedir(otraPersona.correo)
    expect(ok).toBe(true)
    expect(db.valoresCodigo).toHaveLength(1)
    expect(codigoCoincide('123456', db.valoresCodigo[0]!.hash, claveCodigos())).toBe(false)
    expect(correo.mandados).toHaveLength(1)
    expect(correo.mandados[0]!.to).toBe(otraPersona.correo)
  })
})
