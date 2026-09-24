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
          },
        }),
      }),
    }),
  }
})

// Import estático, después de los `vi.mock` (Vitest los sube igual al principio del
// archivo): un import dinámico dentro de cada `it` pagaría de nuevo la transformación de
// todo lo que `actions.ts` arrastra.
const { updateProfile } = await import('./actions')

beforeEach(() => {
  db.updateCalls.length = 0
})

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
