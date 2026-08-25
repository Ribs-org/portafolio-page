import { describe, expect, it } from 'vitest'
import { postsToArchive } from './archive'

const d = (iso: string) => new Date(iso)

describe('postsToArchive', () => {
  it('archiva un post que desapareció dentro de la ventana', () => {
    const known = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'b', publishedAt: d('2026-08-10') },
    ]
    const fetched = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, fetched)).toEqual(['b'])
  })

  it('no archiva lo que quedó fuera del tope de la ventana', () => {
    // 'viejo' es anterior al más antiguo que vino: cayó por el límite de 200, no fue borrado.
    const known = [
      { externalId: 'nuevo', publishedAt: d('2026-08-20') },
      { externalId: 'viejo', publishedAt: d('2024-01-01') },
    ]
    const fetched = [{ externalId: 'nuevo', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, fetched)).toEqual([])
  })

  it('no archiva nada ante una respuesta vacía', () => {
    // Una API que devuelve cero posts es casi siempre un problema de la API.
    const known = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, [])).toEqual([])
  })

  it('no archiva nada cuando vino todo', () => {
    const posts = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(posts, posts)).toEqual([])
  })

  it('incluye el borde exacto de la ventana', () => {
    const known = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'borde', publishedAt: d('2026-08-10') },
    ]
    const fetched = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'c', publishedAt: d('2026-08-10') },
    ]
    expect(postsToArchive(known, fetched)).toEqual(['borde'])
  })
})
