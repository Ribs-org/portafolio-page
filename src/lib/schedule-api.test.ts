import { describe, expect, it } from 'vitest'
import { RANGO_ERROR } from './metrics-api'
import { armarProgramados, parseVentana } from './schedule-api'

const ZONE = 'America/Santiago'
// 20 de junio de 2026, 11:00 en Chile (UTC-4 en invierno).
const now = new Date('2026-06-20T15:00:00Z')

describe('parseVentana', () => {
  it('sin parámetros va de hoy a 30 días adelante, ambos días completos', () => {
    const r = parseVentana(null, null, now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.from).toEqual(new Date('2026-06-20T04:00:00Z'))
    // Hasta el 20 de julio inclusive: el corte es el inicio del 21.
    expect(r.to).toEqual(new Date('2026-07-21T04:00:00Z'))
    expect(r.desde).toBe('2026-06-20')
    expect(r.hasta).toBe('2026-07-20')
  })

  it('con solo desde, cubre 30 días desde ese día', () => {
    const r = parseVentana('2026-06-01', null, now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.desde).toBe('2026-06-01')
    expect(r.hasta).toBe('2026-07-01')
  })

  it('con solo hasta, parte hoy', () => {
    const r = parseVentana(null, '2026-06-25', now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.desde).toBe('2026-06-20')
    expect(r.hasta).toBe('2026-06-25')
  })

  it('acepta un rango pasado: lo publicado también se lista', () => {
    const r = parseVentana('2026-05-01', '2026-05-31', now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.from).toEqual(new Date('2026-05-01T04:00:00Z'))
    expect(r.to).toEqual(new Date('2026-06-01T04:00:00Z'))
  })

  it('rechaza formato inválido y rango invertido con la frase de métricas', () => {
    expect(parseVentana('2026/06/01', null, now, ZONE)).toEqual({ error: RANGO_ERROR })
    expect(parseVentana('2026-06-10', '2026-06-01', now, ZONE)).toEqual({ error: RANGO_ERROR })
  })
})

describe('armarProgramados', () => {
  const post = {
    id: 'p1',
    caption: 'Hola',
    scheduledAt: new Date('2026-06-21T22:00:00Z'),
    coverUrl: 'https://m.x/portada.jpg',
    atributos: { hook: 'pregunta' },
  }
  const filas = [
    {
      post,
      target: { network: 'instagram', status: 'published', lastError: null, externalId: '18', attemptCount: 1 },
    },
    {
      post,
      target: { network: 'x', status: 'failed', lastError: 'X aún no recibe video desde el calendario.', externalId: null, attemptCount: 3 },
    },
    {
      post: { id: 'p2', caption: '', scheduledAt: new Date('2026-06-22T12:00:00Z'), coverUrl: null, atributos: null },
      target: { network: 'threads', status: 'scheduled', lastError: null, externalId: null, attemptCount: 0 },
    },
  ]
  const medias = [
    { postId: 'p1', blobUrl: 'https://m.x/b.mp4', mediaType: 'video' as const, position: 1 },
    { postId: 'p1', blobUrl: 'https://m.x/a.jpg', mediaType: 'image' as const, position: 0 },
  ]

  it('agrupa un post con sus redes, media en orden y fecha en hora de Chile', () => {
    const posts = armarProgramados(filas, medias, ZONE)
    expect(posts).toHaveLength(2)
    expect(posts[0]).toEqual({
      id: 'p1',
      texto: 'Hola',
      fecha: '2026-06-21T18:00:00-04:00',
      portada: 'https://m.x/portada.jpg',
      media: [
        { url: 'https://m.x/a.jpg', tipo: 'image' },
        { url: 'https://m.x/b.mp4', tipo: 'video' },
      ],
      atributos: { hook: 'pregunta' },
      redes: [
        { red: 'instagram', estado: 'published', error: null, externalId: '18', intentos: 1 },
        { red: 'x', estado: 'failed', error: 'X aún no recibe video desde el calendario.', externalId: null, intentos: 3 },
      ],
    })
  })

  it('un post sin media ni atributos viaja con lista vacía y null, nunca 0', () => {
    const posts = armarProgramados(filas, medias, ZONE)
    expect(posts[1]).toMatchObject({ id: 'p2', texto: '', media: [], atributos: null, portada: null })
  })

  it('respeta el orden de llegada de las filas: el query ya ordena por fecha', () => {
    expect(armarProgramados(filas, medias, ZONE).map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})
