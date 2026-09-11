import { describe, expect, it } from 'vitest'
import { normalizeFacebookComment } from './facebook'

describe('normalizeFacebookComment', () => {
  it('mapea el payload de Graph a un comentario', () => {
    expect(
      normalizeFacebookComment(
        {
          id: '1020304050607080_9988776655',
          message: 'Gran video',
          created_time: '2026-09-10T18:22:04+0000',
          from: { id: '61550000000042', name: 'Ana Pérez' },
        },
        '61550000000001_1020304050607080',
      ),
    ).toEqual({
      externalId: '1020304050607080_9988776655',
      postExternalId: '61550000000001_1020304050607080',
      author: 'Ana Pérez',
      authorExternalId: '61550000000042',
      text: 'Gran video',
      publishedAt: new Date('2026-09-10T18:22:04+0000'),
    })
  })

  it('tolera el from ausente, que es lo que Graph devuelve sin el permiso de identidad', () => {
    const c = normalizeFacebookComment({ id: '1', message: 'hola', created_time: '2026-09-10T18:22:04+0000' }, 'p')
    expect(c).toMatchObject({ author: null, authorExternalId: null })
  })

  it('sin id devuelve null', () => {
    expect(normalizeFacebookComment({ message: 'hola', created_time: '2026-09-10T18:22:04+0000' }, 'p')).toBeNull()
  })
})
