import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { getTableName } from 'drizzle-orm'

// `usuarios.ts`, que este archivo importa por debajo de `actions.ts`, trae `server-only`,
// que solo entiende el bundler de Next: se sustituye por un módulo vacío para poder
// importar el módulo real bajo Vitest (mismo motivo que en `usuarios.test.ts`).
vi.mock('server-only', () => ({}))

/** Las rutas que cada acción mandó a repintar, en orden: lo único que delata un revalidado. */
const revalidados = vi.hoisted(() => [] as string[])
vi.mock('next/cache', () => ({
  revalidatePath: (ruta: string) => {
    revalidados.push(ruta)
  },
}))

/** Marca distinguible de un `redirect()` real, para comprobar que ocurrió sin simular a Next. */
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url)
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))

const USUARIO = {
  id: 'owner-1',
  correo: 'ana@example.com',
  nombre: null,
  rol: 'usuario' as const,
  zona: 'America/Santiago',
  sesionVersion: 1,
  invitadoEn: new Date('2026-01-01'),
  primerIngresoEn: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

vi.mock('@/lib/auth', () => ({
  requireUser: async () => USUARIO,
  requireAdmin: async () => USUARIO,
  destroySession: async () => {},
}))

/**
 * Doble mínimo de `getDb()`, en el mismo espíritu que `usuarios.test.ts`: solo cubre lo que
 * `updateProfile`, `deleteProfile` y `makeDefault` de verdad usan (`update().set().where()`,
 * `select().from().where()`, `delete().where()` y `transaction()`), con estado mutable que
 * cada test llena.
 */
const db = vi.hoisted(() => ({
  updateCalls: [] as unknown[],
  // El `where` de cada UPDATE, en el mismo orden que `updateCalls`: es donde vive la reja
  // de estado de `rescheduleTarget`, que el `set` no delata.
  updateWheres: [] as unknown[],
  deleteCalls: [] as unknown[],
  perfilesDelDueno: [
    { id: 'profile-1', isDefault: false },
    { id: 'profile-2', isDefault: false },
  ] as { id: string; isDefault: boolean }[],
  // Lo que el `.where()` del UPDATE debe lanzar, si algo: así un test puede simular el
  // choque de unicidad (o cualquier otro fallo) sin que el resto tenga que configurarlo.
  updateError: null as unknown,
  // Lo que `makeDefault` de verdad escribió DENTRO de la transacción — a diferencia de
  // `updateCalls`, que anota cada intento al tiro, esto solo recibe algo si las dos
  // escrituras de la transacción terminaron sin lanzar. Así un test puede comprobar que un
  // fallo en la segunda (la promoción) no deja aplicada la primera (la degradación).
  makeDefaultCalls: [] as unknown[],
  // 0 = nunca falla. N = la N-ésima escritura dentro de la transacción de `makeDefault`
  // lanza en vez de aplicarse (1 = degradar, 2 = promover).
  makeDefaultErrorAtCall: 0 as number,
  // Lo que `fusionarCuenta` mandó a `tx.execute` dentro de su transacción, en orden.
  executeCalls: [] as unknown[],
  executeError: null as unknown,
  // Para `updateScheduledPost`: filas programadas para los `select().from().where()`
  // sucesivos, en el orden real en que la función los hace (post, targets, media) — no
  // por tabla, por orden, como en `aislamiento.test.ts`. Vacío = el `select` de siempre
  // (el de `perfilesDelDueno`), así que las demás describe de este archivo no lo notan.
  scheduledSelectQueue: [] as unknown[][],
  // Cada `insert(tabla).values(...)`, con o sin `onConflictDoUpdate` encima.
  insertCalls: [] as { tabla: string; values: unknown }[],
  // El `set` de cada `onConflictDoUpdate`, que es lo que el arreglo #1 tiene que sujetar:
  // que no traiga `documentoUrl` aunque la regla completa sí lo tenga.
  onConflictDoUpdateCalls: [] as { tabla: string; values: unknown; set: unknown }[],
}))

// Doble mínimo para `createScheduledPost`: `mediaYaSubida` comprueba que cada URL sea del
// bucket bajo `scheduled/` y que el objeto exista, sin tocar R2 de verdad (mismo mock que
// `mobile/schedule/route.test.ts`).
vi.mock('@/lib/storage', () => ({
  basePublica: () => 'https://cdn.ejemplo.cl',
  keyDesdeUrl: (base: string, url: string) => (url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null),
  existe: async () => true,
}))

// Para afirmar que un rechazo antes de crear el post no llega a `crearPostProgramado`: si
// llegara, este doble lo registraría y el test lo vería.
const crear = vi.hoisted(() => ({ crearPostProgramadoCalls: [] as unknown[] }))
vi.mock('@/lib/social/publish/crear', () => ({
  crearPostProgramado: async (...args: unknown[]) => {
    crear.crearPostProgramadoCalls.push(args)
  },
}))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  /** Un valor esperable directamente (`await ...where()`) que además admite `.orderBy()`
   * encadenado (la consulta de media de `updateScheduledPost` sí lo encadena). */
  function filaResultado(filas: unknown) {
    const promesa = Promise.resolve(filas)
    return Object.assign(promesa, { orderBy: () => Promise.resolve(filas) })
  }
  const select = () => ({
    from: () => ({
      where: () => {
        if (db.scheduledSelectQueue.length > 0) return filaResultado(db.scheduledSelectQueue.shift())
        return filaResultado(db.perfilesDelDueno)
      },
    }),
  })
  const del = () => ({
    where: async () => {
      db.deleteCalls.push(true)
    },
  })
  const insert = (tabla: unknown) => ({
    values: (values: unknown) => {
      db.insertCalls.push({ tabla: getTableName(tabla as never), values })
      const resultado = Promise.resolve(undefined)
      return Object.assign(resultado, {
        onConflictDoUpdate: (opts: { set: unknown }) => {
          db.onConflictDoUpdateCalls.push({ tabla: getTableName(tabla as never), values, set: opts.set })
          return Promise.resolve(undefined)
        },
      })
    },
  })
  return {
    ...real,
    getDb: () => ({
      update: () => ({
        set: (values: unknown) => ({
          where: async (condicion: unknown) => {
            db.updateCalls.push(values)
            db.updateWheres.push(condicion)
            if (db.updateError) throw db.updateError
          },
        }),
      }),
      select,
      delete: del,
      insert,
      // Sin rollback real, igual que el doble de `usuarios.test.ts`, pero el `update` de
      // acá sí simula el efecto que a `makeDefault` le importa: bufferea cada escritura y
      // solo las vuelca a `makeDefaultCalls` si el callback completo sin lanzar. Si la
      // segunda escritura falla, la primera queda en el buffer y nunca llega a
      // `makeDefaultCalls` — tal como una transacción real la habría revertido.
      transaction: async (
        fn: (tx: {
          select: typeof select
          delete: typeof del
          update: () => { set: (values: unknown) => { where: () => Promise<void> } }
          execute: (consulta: unknown) => Promise<void>
        }) => Promise<unknown>,
      ) => {
        const buffer: unknown[] = []
        let llamada = 0
        const update = () => ({
          set: (values: unknown) => ({
            where: async () => {
              llamada += 1
              if (db.makeDefaultErrorAtCall && llamada === db.makeDefaultErrorAtCall) {
                throw new Error('la base no responde')
              }
              buffer.push(values)
            },
          }),
        })
        const execute = async (consulta: unknown) => {
          if (db.executeError) throw db.executeError
          db.executeCalls.push(consulta)
        }
        const resultado = await fn({ select, delete: del, update, execute })
        db.makeDefaultCalls.push(...buffer)
        return resultado
      },
    }),
  }
})

// Import estático, después de los `vi.mock` (Vitest los sube igual al principio del
// archivo): un import dinámico dentro de cada `it` pagaría de nuevo la transformación de
// todo lo que `actions.ts` arrastra.
const {
  updateProfile,
  deleteProfile,
  makeDefault,
  updateScheduledPost,
  createScheduledPost,
  fusionarCuenta,
  rescheduleTarget,
} = await import('./actions')
const { TRIAL_REEL_MEDIA } = await import('@/lib/social/publish/opciones')
const { FUSION_DISTINTA_RED, FUSION_NO_ES_TUYA, FUSION_FALLO } = await import('@/lib/social/fusion')

beforeEach(() => {
  db.updateCalls.length = 0
  db.updateWheres.length = 0
  db.deleteCalls.length = 0
  db.perfilesDelDueno = [
    { id: 'profile-1', isDefault: false },
    { id: 'profile-2', isDefault: false },
  ]
  db.updateError = null
  db.makeDefaultCalls.length = 0
  db.makeDefaultErrorAtCall = 0
  db.scheduledSelectQueue.length = 0
  db.insertCalls.length = 0
  db.onConflictDoUpdateCalls.length = 0
  crear.crearPostProgramadoCalls.length = 0
  db.executeCalls.length = 0
  db.executeError = null
  revalidados.length = 0
})

/**
 * La forma real de un choque de unicidad tal como llega al `catch` de `updateProfile`: no
 * el error del driver crudo, sino `DrizzleQueryError`, que drizzle-orm usa para envolver
 * cualquier consulta fallida. Su propio mensaje es solo `Failed query: <sql>\nparams:
 * <params>` — ni el nombre de la restricción ni "duplicate key" aparecen ahí, solo en
 * `cause`, que es donde `esChoqueDeUnicidad` (de `lib/usuarios.ts`) sabe mirar.
 */
function erorDrizzleEnvuelto(causa: unknown): Error {
  const error = new Error('Failed query: update "profiles" set "slug" = $1 where "id" = $2\nparams: tomado,profile-1')
  ;(error as { cause?: unknown }).cause = causa
  return error
}

const erorPostgres = (constraint_name: string) => ({ code: '23505', constraint_name })

describe('updateProfile: guardar el perfil principal de un invitado no le cambia la dirección', () => {
  it('sin el campo slug en el FormData (input deshabilitado), no toca el slug aunque cambie el nombre', async () => {
    const formData = new FormData()
    // Antes de este arreglo, `readProfileForm` habría escrito slug "ana-perez" acá: el
    // bug que borraba en silencio la dirección de un invitado al guardar su bajada.
    formData.set('displayName', 'Ana Pérez')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.ok).toBe(true)
    expect(db.updateCalls).toHaveLength(1)
    const values = db.updateCalls[0] as Record<string, unknown>
    expect(values.slug).toBeUndefined()
  })

  it('con el campo slug presente pero vacío (perfil editable), sigue respaldando con el nombre', async () => {
    const formData = new FormData()
    formData.set('displayName', 'Segundo perfil')
    formData.set('slug', '')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.ok).toBe(true)
    const values = db.updateCalls[0] as Record<string, unknown>
    expect(values.slug).toBe('segundo-perfil')
  })

  it('con el campo slug presente y distinto, usa lo que trae el formulario', async () => {
    const formData = new FormData()
    formData.set('displayName', 'Segundo perfil')
    formData.set('slug', 'mi-direccion')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.ok).toBe(true)
    const values = db.updateCalls[0] as Record<string, unknown>
    expect(values.slug).toBe('mi-direccion')
  })
})

describe('updateProfile: rechaza una dirección reservada del sistema', () => {
  it('rechaza el slug "admin" cuando el campo lo trae explícito', async () => {
    const formData = new FormData()
    formData.set('displayName', 'Cualquiera')
    formData.set('slug', 'Admin')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/reservad/i)
    expect(db.updateCalls).toHaveLength(0)
  })

  it('rechaza cuando el respaldo del nombre cae en una dirección reservada', async () => {
    const formData = new FormData()
    formData.set('displayName', 'Admin')
    formData.set('slug', '')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/reservad/i)
    expect(db.updateCalls).toHaveLength(0)
  })
})

describe('updateProfile: mensaje claro cuando la URL ya está en uso', () => {
  it('reconoce el choque de unicidad con la forma real que envuelve drizzle (DrizzleQueryError + cause)', async () => {
    db.updateError = erorDrizzleEnvuelto(erorPostgres('profiles_slug_unique'))

    const formData = new FormData()
    formData.set('displayName', 'Ana')
    formData.set('slug', 'tomado')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.error).toBe('La URL /tomado ya está en uso por otro perfil.')
  })

  it('cualquier otro fallo sigue con el mensaje genérico, no el de la URL tomada', async () => {
    db.updateError = new Error('la base no responde')

    const formData = new FormData()
    formData.set('displayName', 'Ana')
    formData.set('slug', 'lo-que-sea')

    const result = await updateProfile('profile-1', {}, formData)

    expect(result.error).toBe('No se pudo guardar. Intenta de nuevo.')
  })
})

describe('deleteProfile: no deja borrar la última página de un usuario', () => {
  it('se niega si el dueño solo tiene un perfil, y no borra nada', async () => {
    db.perfilesDelDueno = [{ id: 'profile-1', isDefault: true }]

    const result = await deleteProfile('profile-1')

    expect(result.error).toBeTruthy()
    expect(db.deleteCalls).toHaveLength(0)
  })

  it('borra y redirige si el dueño tiene más de un perfil y el que se borra no es el principal', async () => {
    db.perfilesDelDueno = [
      { id: 'profile-1', isDefault: false },
      { id: 'profile-2', isDefault: true },
    ]

    await expect(deleteProfile('profile-1')).rejects.toThrow(RedirectSignal)

    expect(db.deleteCalls).toHaveLength(1)
  })
})

describe('deleteProfile: no deja borrar la página principal mientras haya otras', () => {
  it('se niega si el perfil a borrar es el principal, y no borra nada', async () => {
    db.perfilesDelDueno = [
      { id: 'profile-1', isDefault: true },
      { id: 'profile-2', isDefault: false },
    ]

    const result = await deleteProfile('profile-1')

    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/principal/i)
    // Dice cómo salir: hacer principal a otra página primero.
    expect(result.error).toMatch(/otra/i)
    expect(db.deleteCalls).toHaveLength(0)
  })

  it('borra sin problema el perfil que sí es el principal, si primero se le quitó ese estado', async () => {
    db.perfilesDelDueno = [
      { id: 'profile-1', isDefault: false },
      { id: 'profile-2', isDefault: true },
    ]

    await expect(deleteProfile('profile-1')).rejects.toThrow(RedirectSignal)

    expect(db.deleteCalls).toHaveLength(1)
  })
})

describe('makeDefault: degradar y promover son atómicos', () => {
  it('camino feliz: degrada al resto y promueve al elegido, en ese orden, dentro de una transacción', async () => {
    await makeDefault('profile-1')

    expect(db.makeDefaultCalls).toEqual([{ isDefault: false }, { isDefault: true, isPublished: true }])
  })

  // La razón de este arreglo: degradar a todos y luego fallar al promover dejaría al dueño
  // sin ninguna página principal — y si es el admin, sin raíz en su dominio personal, ya en
  // producción. Envolver las dos escrituras en una transacción hace que un fallo en la
  // segunda deshaga también la primera.
  it('si falla la promoción (la segunda escritura), no deja ninguna página degradada', async () => {
    db.makeDefaultErrorAtCall = 2

    await expect(makeDefault('profile-1')).rejects.toThrow()

    // Nada llegó a aplicarse: ni la degradación que sí alcanzó a intentarse.
    expect(db.makeDefaultCalls).toEqual([])
  })

  it('si falla la degradación (la primera escritura), tampoco intenta promover', async () => {
    db.makeDefaultErrorAtCall = 1

    await expect(makeDefault('profile-1')).rejects.toThrow()

    expect(db.makeDefaultCalls).toEqual([])
  })
})

describe('updateScheduledPost: el editor no pisa el documento de una regla creada por API', () => {
  /**
   * Formulario mínimo del editor que sí toca la regla, sin tocar cuentas ni media: la
   * cuenta elegida es la ya publicada (así `verificarCuentas` recibe la lista vacía y
   * nunca consulta `social_accounts`), sin `media`/`mediaUrls`/`keptMedia` (así
   * `diffMedia` sale vacío) — el camino feliz real, no un arnés que simule todo el
   * módulo. Ver `edit.ts` (`diffTargets`/`diffMedia`) y `cuentas.ts` (`verificarCuentas`).
   */
  function formularioEdicion() {
    const formData = new FormData()
    formData.set('caption', 'Texto editado')
    formData.set('cuentas', 'acc-1')
    formData.set('scheduledAt', '2026-12-01T10:00')
    formData.set('reglaPalabra', 'guia')
    formData.set('reglaMensaje', 'Toma tu guía')
    return formData
  }

  /** Post + su único target (ya publicado) + sin media: las tres filas, en el orden en
   * que `updateScheduledPost` las lee (post, targets, media). */
  function programarFilas() {
    db.scheduledSelectQueue.push(
      [{ id: 'post-1', ownerId: 'owner-1', scheduledAt: new Date('2026-11-01T10:00:00Z'), coverUrl: null }],
      [{ id: 'target-1', status: 'published', accountId: 'acc-1', network: 'instagram', updatedAt: new Date() }],
      [],
    )
  }

  it('el `set` del onConflictDoUpdate no trae `documentoUrl`, aunque la regla completa sí lo tenga', async () => {
    // El hallazgo más grave de la revisión: antes de este arreglo, ese `set` era
    // `{ ...reglaCheck.regla, updatedAt }`, y como `validarRegla` siempre pone la clave
    // `documentoUrl` (null cuando no viene del formulario), el UPDATE real ponía
    // `documento_url = NULL` en cada guardado del editor — así se haya programado el
    // post por API con su PDF. Esto se afirma sobre lo que de verdad llega al `set`, no
    // sobre `columnasEditablesDeRegla` en aislado (eso ya lo prueba `reglas.test.ts`).
    programarFilas()

    await expect(updateScheduledPost('post-1', {}, formularioEdicion())).rejects.toThrow(RedirectSignal)

    expect(db.onConflictDoUpdateCalls).toHaveLength(1)
    const { tabla, set } = db.onConflictDoUpdateCalls[0]!
    expect(tabla).toBe('reglas_clave')
    expect(set).not.toHaveProperty('documentoUrl')
    // Y que sí lleve lo que el editor edita, para que el test no pase por estar vacío.
    expect(set).toMatchObject({ palabra: 'guia', mensaje: 'Toma tu guía' })
  })
})

describe('updateScheduledPost: no deja que un trial reel programado se convierta en foto o carrusel', () => {
  /**
   * Post con un único target de Instagram, trial reel, todavía `scheduled` (así
   * `verificarCuentas` sí consulta `social_accounts`, el cuarto `select`). La media ya
   * guardada trae el video del trial y dos fotos, para que el formulario pueda simular
   * «mantener solo las fotos» con `keptMedia` — sin pasar por `guardar`/`mediaToBlob`,
   * que este archivo no dobla.
   */
  function programarFilas() {
    db.scheduledSelectQueue.push(
      [{ id: 'post-1', ownerId: 'owner-1', scheduledAt: new Date('2026-12-01T10:00:00Z'), coverUrl: null }],
      [
        {
          id: 'target-1',
          status: 'scheduled',
          accountId: 'acc-ig',
          network: 'instagram',
          opciones: { trialReel: true },
          updatedAt: new Date(),
        },
      ],
      [
        { id: 'media-video', blobUrl: 'https://cdn.ejemplo.cl/scheduled/v.mp4', mediaType: 'video', position: 0 },
        { id: 'media-foto1', blobUrl: 'https://cdn.ejemplo.cl/scheduled/f1.jpg', mediaType: 'image', position: 1 },
        { id: 'media-foto2', blobUrl: 'https://cdn.ejemplo.cl/scheduled/f2.jpg', mediaType: 'image', position: 2 },
      ],
      [{ id: 'acc-ig', network: 'instagram', handle: '@vicente', accessToken: 'token-vivo' }],
    )
  }

  function formularioConMedia(keptMedia: string[]) {
    const formData = new FormData()
    formData.set('caption', 'Texto editado')
    formData.set('cuentas', 'acc-ig')
    formData.set('scheduledAt', '2030-01-01T10:00')
    for (const id of keptMedia) formData.append('keptMedia', id)
    return formData
  }

  it('mantener solo las dos fotos se rechaza con la frase del trial reel, sin tocar la base', async () => {
    programarFilas()

    const result = await updateScheduledPost('post-1', {}, formularioConMedia(['media-foto1', 'media-foto2']))

    expect(result.error).toBe(TRIAL_REEL_MEDIA)
    expect(db.updateCalls).toHaveLength(0)
    expect(db.insertCalls).toHaveLength(0)
  })

  it('espejo: mantener el único video guarda sin error', async () => {
    programarFilas()

    await expect(
      updateScheduledPost('post-1', {}, formularioConMedia(['media-video'])),
    ).rejects.toThrow(RedirectSignal)
  })
})

describe('createScheduledPost: un trial reel con fotos se rechaza antes de crear nada', () => {
  /**
   * Único destino: la cuenta de Instagram que `verificarCuentas` resuelve vía el mismo
   * doble de `@/db` que usan las demás describe de este archivo (un `select().from().where()`
   * más, encolado igual que las filas de `updateScheduledPost`) — no hace falta un doble
   * aparte de `@/lib/social/cuentas`.
   */
  function formularioConTrialYFotos() {
    db.scheduledSelectQueue.push([
      { id: 'acc-ig', network: 'instagram', handle: '@vicente', accessToken: 'token-vivo' },
    ])

    const formData = new FormData()
    formData.set('caption', 'Texto del post')
    formData.set('cuentas', 'acc-ig')
    formData.set('scheduledAt', '2030-01-01T10:00')
    formData.set('instagramTrial:acc-ig', 'on')
    // Dos fotos «ya subidas» — lo que `mediaYaSubida` espera del compositor, no un
    // archivo real: el navegador sube antes de llamar a la acción.
    formData.set(
      'mediaSubida',
      JSON.stringify([
        { url: 'https://cdn.ejemplo.cl/scheduled/foto1.jpg', mediaType: 'image' },
        { url: 'https://cdn.ejemplo.cl/scheduled/foto2.jpg', mediaType: 'image' },
      ]),
    )
    return formData
  }

  it('devuelve el error del trial reel y no llega a crearPostProgramado', async () => {
    const result = await createScheduledPost({}, formularioConTrialYFotos())

    expect(result.error).toBe(TRIAL_REEL_MEDIA)
    expect(crear.crearPostProgramadoCalls).toHaveLength(0)
  })
})

describe('fusionarCuenta: una tarjeta muerta se absorbe en la viva de su red', () => {
  const muerta = { id: 'muerta', ownerId: USUARIO.id, network: 'tiktok', accessToken: null }
  const viva = { id: 'viva', ownerId: USUARIO.id, network: 'tiktok', accessToken: 'cifrado' }

  it('corre los nueve pasos dentro de la transacción, con la muerta atada al dueño al final', async () => {
    db.scheduledSelectQueue.push([muerta, viva])
    expect(await fusionarCuenta('muerta', 'viva')).toEqual({ ok: true })
    expect(db.executeCalls).toHaveLength(9)
    const ultimo = new PgDialect().sqlToQuery(db.executeCalls[8] as SQL)
    expect(ultimo.sql).toMatch(/delete from "?social_accounts"?/i)
    expect(ultimo.params).toEqual(['muerta', USUARIO.id])
  })

  it('si la decisión dice que no, no toca la base', async () => {
    db.scheduledSelectQueue.push([muerta, { ...viva, network: 'instagram' }])
    expect(await fusionarCuenta('muerta', 'viva')).toEqual({ error: FUSION_DISTINTA_RED })
    expect(db.executeCalls).toHaveLength(0)
  })

  it('una cuenta que la consulta atada al dueño no trae es «no es tuya», sin decir más', async () => {
    // La consulta filtra por dueño: una cuenta ajena simplemente no aparece, y la frase no
    // distingue «no existe» de «es de otro» a propósito.
    db.scheduledSelectQueue.push([viva])
    expect(await fusionarCuenta('muerta', 'viva')).toEqual({ error: FUSION_NO_ES_TUYA })
    expect(db.executeCalls).toHaveLength(0)
  })

  it('un fallo dentro de la transacción vuelve como frase, no como excepción', async () => {
    db.scheduledSelectQueue.push([muerta, viva])
    db.executeError = new Error('la base no responde')
    expect(await fusionarCuenta('muerta', 'viva')).toEqual({ error: FUSION_FALLO })
  })
})

describe('rescheduleTarget: la hora nueva solo alcanza a un destino todavía quemado', () => {
  const quemado = { id: 'target-1', postId: 'post-1', status: 'failed' }
  /** Una hora futura cualquiera, que es lo único que la acción exige del campo. */
  const futuro = '2030-01-01T10:00'
  /**
   * Dos entradas por lectura, no una: el `where` de la consulta lleva dentro la subconsulta
   * de posts del dueño, que para el doble es otro `select().from().where()` y se come el
   * primer turno de la cola. La segunda entrada es la que la acción de verdad lee.
   */
  function leeraQuemado(filas: unknown[]) {
    db.scheduledSelectQueue.push([], filas)
  }

  it('el UPDATE del destino pide status = failed, como el rearm del editor', async () => {
    leeraQuemado([quemado])

    expect(await rescheduleTarget('target-1', futuro)).toEqual({ ok: true })

    // Dos escrituras: la hora del post y el destino de vuelta a la cola.
    expect(db.updateCalls).toHaveLength(2)
    const where = new PgDialect().sqlToQuery(db.updateWheres[1] as SQL)
    expect(where.params).toEqual(['target-1', 'failed'])
  })

  it('repinta las dos pantallas que muestran lo quemado, no solo la parrilla', async () => {
    leeraQuemado([quemado])

    await rescheduleTarget('target-1', futuro)

    // El Fuego («Se quemó») vive en `/admin` y su botón de reprogramar es el mismo que el
    // de la cola: sin este revalidado, la fila que se acaba de arreglar sigue ahí.
    expect(revalidados).toEqual(['/admin/schedule', '/admin'])
  })

  it('una hora pasada no escribe nada y devuelve la frase de siempre', async () => {
    leeraQuemado([quemado])

    expect(await rescheduleTarget('target-1', '2020-01-02T03:04')).toEqual({
      error: 'La hora debe estar en el futuro.',
    })
    expect(db.updateCalls).toHaveLength(0)
  })

  it('un destino que la consulta atada al dueño no trae no se toca', async () => {
    leeraQuemado([])

    expect(await rescheduleTarget('target-ajeno', futuro)).toEqual({ error: 'Ese destino ya no existe.' })
    expect(db.updateCalls).toHaveLength(0)
  })
})
