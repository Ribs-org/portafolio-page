import { describe, expect, it } from 'vitest'
import { normalizeXTweet } from './x'

const AHORA = new Date(1_789_128_000_000)

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
