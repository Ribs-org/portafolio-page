import { describe, expect, it } from 'vitest'
import { normalizeInstagramComment } from './instagram'

describe('normalizeInstagramComment', () => {
  it('mapea el payload de Graph a un comentario', () => {
    expect(
      normalizeInstagramComment(
        {
          id: '17900000000000001',
          text: '¿Cuánto cobras por esto?',
          timestamp: '2026-09-10T18:22:04+0000',
          username: 'alguien',
          from: { id: '17841400000000999', username: 'alguien' },
        },
        '18114074218999893',
      ),
    ).toEqual({
      externalId: '17900000000000001',
      postExternalId: '18114074218999893',
      author: '@alguien',
      authorExternalId: '17841400000000999',
      text: '¿Cuánto cobras por esto?',
      publishedAt: new Date('2026-09-10T18:22:04+0000'),
    })
  })

  it('tolera un comentario sin from ni username', () => {
    const c = normalizeInstagramComment({ id: '1', text: 'hola', timestamp: '2026-09-10T18:22:04+0000' }, 'p')
    expect(c).toMatchObject({ author: null, authorExternalId: null, text: 'hola' })
  })

  it('un comentario sin texto es texto vacío, nunca null: la columna no lo admite', () => {
    expect(normalizeInstagramComment({ id: '1', timestamp: '2026-09-10T18:22:04+0000' }, 'p')?.text).toBe('')
  })

  it('sin id devuelve null: sin identidad no hay fila', () => {
    expect(normalizeInstagramComment({ text: 'hola', timestamp: '2026-09-10T18:22:04+0000' }, 'p')).toBeNull()
  })
})
