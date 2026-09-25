import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '@/db'
import { CuentaInvalida, type CuentaDestino } from '@/lib/social/cuentas'

// `route.ts` importa `SITE_TIMEZONE` de `@/lib/analytics`, que trae `server-only` (no
// resuelve bajo Vitest). Mismo motivo y mismo arreglo que `aislamiento.test.ts`.
vi.mock('server-only', () => ({}))

const USUARIO: Usuario = {
  id: 'owner-1',
  correo: 'dueno@example.com',
  nombre: null,
  rol: 'usuario',
  sesionVersion: 1,
  invitadoEn: new Date('2026-01-01'),
  primerIngresoEn: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

vi.mock('@/lib/mobile-guardia', () => ({ requireMobileUser: async () => USUARIO }))

// Igual que en `check/route.test.ts`: se mockea solo `resolverDestinos`, el resto del
// módulo sigue real.
const resolverDestinos = vi.fn()
vi.mock('@/lib/mobile-api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mobile-api')>()
  return { ...real, resolverDestinos: (...args: Parameters<typeof real.resolverDestinos>) => resolverDestinos(...args) }
})

const crearPostProgramado = vi.fn()
vi.mock('@/lib/social/publish/crear', () => ({
  crearPostProgramado: (...args: unknown[]) => crearPostProgramado(...args),
}))

// R2 no está configurado bajo test (sin `R2_*`): mockeado explícito, no implícito por
// la ausencia de env, para que este archivo no dependa de qué haya en `.env.local`.
vi.mock('@/lib/storage', () => ({
  basePublica: () => 'https://cdn.ejemplo.cl',
  keyDesdeUrl: (base: string, url: string) => (url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null),
  existe: async () => true,
}))

const { POST } = await import('./route')

function peticion(body: unknown): Request {
  return new Request('https://ejemplo.cl/api/mobile/schedule', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const IG: CuentaDestino = { id: 'c-ig', network: 'facebook', handle: '@fb' }

/**
 * El `POST` que de verdad crea el post. `check/route.test.ts` prueba el chequeo; este
 * archivo prueba que el `POST` cumple exactamente lo mismo que `check` promete —mismo
 * `resolverDestinos`, mismo borrador— y que un rechazo de destino nunca llega a crear
 * nada.
 */
describe('POST /api/mobile/schedule', () => {
  beforeEach(() => {
    resolverDestinos.mockReset()
    crearPostProgramado.mockReset()
  })

  it('resuelve el destino con el borrador entero y crea el post con las cuentas resueltas', async () => {
    resolverDestinos.mockResolvedValueOnce({ cuentas: [IG], networks: ['facebook'] })
    crearPostProgramado.mockResolvedValueOnce('post-1')
    const res = await POST(peticion({ texto: 'Hola', cuentas: ['c-ig'], ahora: true, media: [] }))
    expect(resolverDestinos).toHaveBeenCalledWith('owner-1', expect.objectContaining({ cuentas: ['c-ig'] }))
    expect(crearPostProgramado).toHaveBeenCalledWith('owner-1', expect.objectContaining({ cuentas: [IG] }))
    expect(res.status).toBe(200)
  })

  it('si resolverDestinos rechaza, el POST rechaza con su misma frase y no crea nada', async () => {
    resolverDestinos.mockRejectedValueOnce(new CuentaInvalida('Una de las cuentas elegidas no es tuya.'))
    const res = await POST(peticion({ texto: 'Hola', cuentas: ['ajena'], ahora: true, media: [] }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Una de las cuentas elegidas no es tuya.' })
    expect(crearPostProgramado).not.toHaveBeenCalled()
  })

  it('valida con las redes que resolverDestinos entregó, no con lo que el cuerpo declaró', async () => {
    resolverDestinos.mockResolvedValueOnce({ cuentas: [], networks: ['x'] })
    const res = await POST(
      peticion({
        texto: 'Hola',
        cuentas: ['c1'],
        ahora: true,
        media: [{ url: 'https://cdn.ejemplo.cl/scheduled/a.mp4', mediaType: 'video' }],
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'X aún no recibe video desde el calendario.' })
    expect(crearPostProgramado).not.toHaveBeenCalled()
  })

  it('sin ningún destino resuelto, la frase la da validateScheduleDraft y no se crea nada', async () => {
    resolverDestinos.mockResolvedValueOnce({ cuentas: [], networks: [] })
    const res = await POST(peticion({ texto: 'Hola', cuentas: [], ahora: true, media: [] }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Elige al menos una plataforma.' })
    expect(crearPostProgramado).not.toHaveBeenCalled()
  })
})
