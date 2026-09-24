import { beforeEach, describe, expect, it, vi } from 'vitest'

// `usuarios.ts`, que este archivo importa por debajo de `actions.ts`, trae `server-only`,
// que solo entiende el bundler de Next: se sustituye por un módulo vacío para poder
// importar el módulo real bajo Vitest (mismo motivo que en `usuarios.test.ts`).
vi.mock('server-only', () => ({}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

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
 * `updateProfile` y `deleteProfile` de verdad usan (`update().set().where()`,
 * `select().from().where()` y `delete().where()`), con estado mutable que cada test llena.
 */
const db = vi.hoisted(() => ({
  updateCalls: [] as unknown[],
  deleteCalls: [] as unknown[],
  perfilesDelDueno: [{ id: 'profile-1' }, { id: 'profile-2' }] as { id: string }[],
  // Lo que el `.where()` del UPDATE debe lanzar, si algo: así un test puede simular el
  // choque de unicidad (o cualquier otro fallo) sin que el resto tenga que configurarlo.
  updateError: null as unknown,
}))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      update: () => ({
        set: (values: unknown) => ({
          where: async () => {
            db.updateCalls.push(values)
            if (db.updateError) throw db.updateError
          },
        }),
      }),
      select: () => ({ from: () => ({ where: async () => db.perfilesDelDueno }) }),
      delete: () => ({
        where: async () => {
          db.deleteCalls.push(true)
        },
      }),
    }),
  }
})

// Import estático, después de los `vi.mock` (Vitest los sube igual al principio del
// archivo): un import dinámico dentro de cada `it` pagaría de nuevo la transformación de
// todo lo que `actions.ts` arrastra.
const { updateProfile, deleteProfile } = await import('./actions')

beforeEach(() => {
  db.updateCalls.length = 0
  db.deleteCalls.length = 0
  db.perfilesDelDueno = [{ id: 'profile-1' }, { id: 'profile-2' }]
  db.updateError = null
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
    db.perfilesDelDueno = [{ id: 'profile-1' }]

    const result = await deleteProfile('profile-1')

    expect(result.error).toBeTruthy()
    expect(db.deleteCalls).toHaveLength(0)
  })

  it('borra y redirige si el dueño tiene más de un perfil', async () => {
    db.perfilesDelDueno = [{ id: 'profile-1' }, { id: 'profile-2' }]

    await expect(deleteProfile('profile-1')).rejects.toThrow(RedirectSignal)

    expect(db.deleteCalls).toHaveLength(1)
  })
})
