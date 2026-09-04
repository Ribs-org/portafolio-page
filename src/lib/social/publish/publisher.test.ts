import { describe, expect, it } from 'vitest'
import {
  MAX_PUBLISH_ATTEMPTS,
  PUBLISH_REJECTED,
  isStaleProcessing,
  resolveOutcome,
  mediaParaBorrar,
} from './publisher'

describe('resolveOutcome', () => {
  it('publicado guarda el id externo y limpia el resto', () => {
    expect(resolveOutcome({ kind: 'published', externalId: '18000000000000001' }, 1)).toEqual({
      status: 'published',
      containerId: null,
      externalId: '18000000000000001',
      attemptCount: 1,
      lastError: null,
    })
  })

  it('procesando estaciona el contenedor sin gastar intentos', () => {
    // Esperar a Meta no es un fallo: el intento se gasta solo cuando algo salió mal.
    expect(resolveOutcome({ kind: 'processing', containerId: 'CT_1' }, 0)).toEqual({
      status: 'publishing',
      containerId: 'CT_1',
      externalId: null,
      attemptCount: 0,
      lastError: null,
    })
  })

  it('un fallo con intentos restantes vuelve a programado, con el motivo visible', () => {
    const patch = resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, 0)
    expect(patch.status).toBe('scheduled')
    expect(patch.attemptCount).toBe(1)
    expect(patch.lastError).toBe(PUBLISH_REJECTED)
    expect(patch.containerId).toBeNull()
  })

  it('el tercer fallo es definitivo', () => {
    const patch = resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, MAX_PUBLISH_ATTEMPTS - 1)
    expect(patch.status).toBe('failed')
    expect(patch.attemptCount).toBe(MAX_PUBLISH_ATTEMPTS)
  })

  it('solo el tercer fallo produce failed: el email de aviso sale una única vez', () => {
    const statuses = [0, 1, 2].map(
      (attempts) => resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, attempts).status,
    )
    expect(statuses).toEqual(['scheduled', 'scheduled', 'failed'])
  })
})

describe('isStaleProcessing', () => {
  const base = new Date('2026-08-31T12:00:00Z')

  it('un publishing reciente no está vencido', () => {
    expect(isStaleProcessing(new Date('2026-08-31T11:00:00Z'), base)).toBe(false)
  })

  it('a las 24 horas exactas ya venció', () => {
    expect(isStaleProcessing(new Date('2026-08-30T12:00:00Z'), base)).toBe(true)
  })
})

describe('mediaParaBorrar', () => {
  const video = { id: 'm1', mediaType: 'video' as const, blobUrl: 'https://blob/v.mp4' }
  const foto = { id: 'm2', mediaType: 'image' as const, blobUrl: 'https://blob/f.jpg' }

  it('con todos los destinos publicados, el video ya cumplió: se borra', () => {
    expect(
      mediaParaBorrar([{ status: 'published' }, { status: 'published' }], [video, foto]),
    ).toEqual([video])
  })

  it('las fotos se conservan: pesan poco y son la memoria visual del calendario', () => {
    expect(mediaParaBorrar([{ status: 'published' }], [foto])).toEqual([])
  })

  it('mientras quede un destino sin publicar, no se toca nada', () => {
    for (const pendiente of ['scheduled', 'publishing', 'failed']) {
      expect(mediaParaBorrar([{ status: 'published' }, { status: pendiente }], [video])).toEqual([])
    }
  })

  it('un post sin destinos no se considera publicado', () => {
    expect(mediaParaBorrar([], [video])).toEqual([])
  })
})
