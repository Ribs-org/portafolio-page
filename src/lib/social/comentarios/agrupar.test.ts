import { describe, expect, it } from 'vitest'
import { agruparPorPublicacion } from './agrupar'

const fila = (id: string, post: string, minuto: number) => ({
  id,
  postExternalId: post,
  publishedAt: new Date(Date.UTC(2026, 8, 14, 12, minuto)),
})

describe('agruparPorPublicacion', () => {
  it('junta los comentarios de una misma publicación', () => {
    const grupos = agruparPorPublicacion([fila('a', 'p1', 1), fila('b', 'p2', 2), fila('c', 'p1', 3)])
    expect(grupos.map((g) => g.postExternalId)).toEqual(['p1', 'p2'])
    expect(grupos[0].comentarios.map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('ordena los grupos por su comentario más nuevo, primero el más reciente', () => {
    const grupos = agruparPorPublicacion([fila('a', 'p1', 1), fila('b', 'p2', 9), fila('c', 'p1', 3)])
    expect(grupos.map((g) => g.postExternalId)).toEqual(['p2', 'p1'])
  })

  it('devuelve vacío con nada', () => {
    expect(agruparPorPublicacion([])).toEqual([])
  })
})
