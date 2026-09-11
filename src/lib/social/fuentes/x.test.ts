import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeXTweet, xFuente } from './x'

const AHORA = new Date(1_789_128_000_000)

/** Una sola respuesta de X, con el token puesto para que `pedir` llegue al fetch. */
function stubX(cuerpo: unknown) {
  vi.stubEnv('X_BEARER_TOKEN', 'token-de-prueba')
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200 })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('normalizeXTweet', () => {
  it('arma la ficha con el enlace al original', () => {
    const c = normalizeXTweet(
      { id: '42', text: 'una idea', created_at: '2026-09-10T12:00:00.000Z' },
      'algun_creador',
      AHORA,
    )
    expect(c).toEqual({
      externalId: '42',
      url: 'https://x.com/algun_creador/status/42',
      authorHandle: 'algun_creador',
      text: 'una idea',
      publishedAt: new Date('2026-09-10T12:00:00.000Z'),
    })
  })

  it('descarta el tuit sin id, que no tiene identidad', () => {
    expect(normalizeXTweet({ text: 'una idea' }, 'x', AHORA)).toBeNull()
  })

  it('descarta el tuit sin texto, que no es una idea', () => {
    expect(normalizeXTweet({ id: '42', text: '   ' }, 'x', AHORA)).toBeNull()
  })

  it('usa la hora de descubrimiento cuando la fecha falta o es basura', () => {
    expect(normalizeXTweet({ id: '1', text: 'a' }, 'x', AHORA)?.publishedAt).toEqual(AHORA)
    expect(
      normalizeXTweet({ id: '2', text: 'a', created_at: 'ayer' }, 'x', AHORA)?.publishedAt,
    ).toEqual(AHORA)
  })

  it('recorta los bordes del texto', () => {
    expect(normalizeXTweet({ id: '1', text: '  una idea \n' }, 'x', AHORA)?.text).toBe('una idea')
  })
})

describe('xFuente.traer', () => {
  it('cuenta lo que la red entregó, no lo que sobrevivió al normalizador', async () => {
    stubX({
      data: [
        { id: '12', text: 'una idea', created_at: '2026-09-10T12:00:00.000Z' },
        { text: 'sin id no hay ficha' },
        { id: '11', text: 'otra idea' },
      ],
      meta: { newest_id: '12' },
    })
    const traida = await xFuente.traer('9', 'algun_creador', null, 10)
    expect(traida.leidas).toBe(3)
    expect(traida.posts).toHaveLength(2)
    expect(traida.masNuevo).toBe('12')
  })

  it('avanza la marca aunque se descarten todas, que igual se pagaron', async () => {
    stubX({ data: [{ id: '12' }, { text: '   ' }], meta: { newest_id: '12' } })
    const traida = await xFuente.traer('9', 'algun_creador', null, 10)
    expect(traida.posts).toEqual([])
    expect(traida.leidas).toBe(2)
    expect(traida.masNuevo).toBe('12')
  })

  it('sin meta cae al mayor de los ids crudos, y sin ids a null', async () => {
    stubX({ data: [{ id: '9' }, { id: '10', text: 'una idea' }] })
    expect((await xFuente.traer('9', 'algun_creador', null, 10)).masNuevo).toBe('10')
    stubX({ data: [] })
    expect((await xFuente.traer('9', 'algun_creador', null, 10)).masNuevo).toBeNull()
  })
})
