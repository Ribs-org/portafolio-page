import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '@/db'
import { CuentaInvalida } from '@/lib/social/cuentas'

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

// Se mockea solo `resolverDestinos`; el resto del módulo (parseBorradorMovil,
// parseConteos, resolverCuando) sigue real, así que estos tests ejercitan el chequeo
// completo del cuerpo, no solo el punto donde se resuelve el destino.
const resolverDestinos = vi.fn()
vi.mock('@/lib/mobile-api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mobile-api')>()
  return { ...real, resolverDestinos: (...args: Parameters<typeof real.resolverDestinos>) => resolverDestinos(...args) }
})

const { POST } = await import('./route')

function peticion(body: unknown): Request {
  return new Request('https://ejemplo.cl/api/mobile/schedule/check', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * El corazón de la Tarea 7 es que este chequeo y el `POST` que de verdad crea el post
 * (`schedule/route.ts`) nunca se desacuerden. Nada lo sujetaba: revertir la tarea
 * entera —o invertir el orden, o saltarse `resolverDestinos`— seguía dejando toda la
 * suite en verde. Estos casos existen para que eso deje de ser cierto.
 */
describe('POST /api/mobile/schedule/check', () => {
  beforeEach(() => {
    resolverDestinos.mockReset()
  })

  it('resuelve el destino antes de decir que sí, con el borrador entero', async () => {
    // Facebook, no Instagram: Instagram exige un archivo incluso con texto, y este
    // caso no manda ninguno — probaría la regla de medios, no la de resolverDestinos.
    resolverDestinos.mockResolvedValueOnce({ cuentas: [], networks: ['facebook'] })
    const res = await POST(peticion({ texto: 'Hola', cuentas: ['c1'], ahora: true, fotos: 0, videos: 0 }))
    expect(resolverDestinos).toHaveBeenCalledWith('owner-1', expect.objectContaining({ cuentas: ['c1'] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('si resolverDestinos rechaza, el chequeo rechaza con su misma frase', async () => {
    resolverDestinos.mockRejectedValueOnce(new CuentaInvalida('Una de las cuentas elegidas no es tuya.'))
    const res = await POST(peticion({ texto: 'Hola', cuentas: ['ajena'], ahora: true, fotos: 0, videos: 0 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Una de las cuentas elegidas no es tuya.' })
  })

  it('un fallo que no es CuentaInvalida no se traga: sigue reventando', async () => {
    resolverDestinos.mockRejectedValueOnce(new Error('boom'))
    await expect(POST(peticion({ texto: 'Hola', cuentas: ['c1'], ahora: true, fotos: 0, videos: 0 }))).rejects.toThrow(
      'boom',
    )
  })

  it('valida con las redes que resolverDestinos entregó, no con lo que el cuerpo declaró', async () => {
    // El cuerpo no manda `redes`, solo `cuentas` — si el chequeo validara con
    // `borrador.redes` (vacío) en vez de con lo que resolvió el destino, esto pasaría
    // sin marcar el video de X como un problema.
    resolverDestinos.mockResolvedValueOnce({ cuentas: [], networks: ['x'] })
    const res = await POST(peticion({ texto: 'Hola', cuentas: ['c1'], ahora: true, fotos: 0, videos: 1 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'X aún no recibe video desde el calendario.' })
  })

  it('sin ningún destino resuelto, la frase la da validateScheduleDraft, no un 200 a ciegas', async () => {
    resolverDestinos.mockResolvedValueOnce({ cuentas: [], networks: [] })
    const res = await POST(peticion({ texto: 'Hola', cuentas: [], ahora: true, fotos: 0, videos: 0 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Elige al menos una plataforma.' })
  })
})
