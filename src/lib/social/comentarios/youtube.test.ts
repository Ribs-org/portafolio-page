import { describe, expect, it } from 'vitest'
import { normalizeYouTubeThread } from './youtube'

describe('normalizeYouTubeThread', () => {
  it('toma el comentario de primer nivel del hilo', () => {
    expect(
      normalizeYouTubeThread(
        {
          id: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
          snippet: {
            topLevelComment: {
              id: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
              snippet: {
                textOriginal: 'Buenísimo el dato',
                authorDisplayName: 'Ana Pérez',
                authorChannelId: { value: 'UCanaperez' },
                publishedAt: '2026-09-10T18:22:04Z',
                videoId: 'dQw4w9WgXcQ',
              },
            },
          },
        },
        'dQw4w9WgXcQ',
      ),
    ).toEqual({
      externalId: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
      postExternalId: 'dQw4w9WgXcQ',
      author: 'Ana Pérez',
      authorExternalId: 'UCanaperez',
      text: 'Buenísimo el dato',
      publishedAt: new Date('2026-09-10T18:22:04Z'),
    })
  })

  it('sin comentario de primer nivel devuelve null', () => {
    expect(normalizeYouTubeThread({ id: 'x', snippet: {} }, 'v')).toBeNull()
  })

  it('sin fecha o con fecha basura toma la del descubrimiento, nunca 1970', () => {
    const antes = Date.now()
    for (const publishedAt of [undefined, 'ayer por la tarde']) {
      const c = normalizeYouTubeThread(
        { snippet: { topLevelComment: { id: 'x', snippet: { textOriginal: 'hola', publishedAt } } } },
        'v',
      )
      expect(c?.publishedAt.getTime()).not.toBeNaN()
      expect(c?.publishedAt.getTime()).toBeGreaterThanOrEqual(antes)
    }
  })
})
