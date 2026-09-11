import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMENTARIO_AUSENTE } from './comentarista'
import { instagramComentarista, normalizeInstagramComment } from './instagram'

// `listar` y `responder` no miran la cuenta: leen y escriben con el token que reciben.
const CUENTA = {} as Parameters<typeof instagramComentarista.listar>[0]

/** Una respuesta distinta por llamada, y las urls pedidas en orden. */
function stubGraph(pagina: (n: number) => unknown) {
  const urls: string[] = []
  vi.stubGlobal('fetch', (url: string) => {
    const cuerpo = pagina(urls.length)
    urls.push(String(url))
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status: 200 }))
  })
  return urls
}

function stubError(status: number, body: string) {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(body, { status })))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('sin fecha o con fecha basura toma la del descubrimiento, nunca 1970', () => {
    const antes = Date.now()
    for (const timestamp of [undefined, 'ayer por la tarde']) {
      const c = normalizeInstagramComment({ id: '1', text: 'hola', timestamp }, 'p')
      expect(c?.publishedAt.getTime()).not.toBeNaN()
      expect(c?.publishedAt.getTime()).toBeGreaterThanOrEqual(antes)
    }
  })
})

describe('instagramComentarista.listar', () => {
  const raw = (id: string) => ({ id, text: 'hola', timestamp: '2026-09-10T18:22:04+0000' })

  it('sigue el cursor de Graph hasta que se acaba: tres páginas, tres llamadas', async () => {
    const paginas = [
      { data: [raw('1')], paging: { next: 'https://graph.facebook.com/pagina2' } },
      { data: [raw('2')], paging: { next: 'https://graph.facebook.com/pagina3' } },
      { data: [raw('3')] },
    ]
    const urls = stubGraph((n) => paginas[n])

    const leidos = await instagramComentarista.listar(CUENTA, 'TOKEN', 'post-1')

    expect(urls).toHaveLength(3)
    expect(leidos.map((c) => c.externalId)).toEqual(['1', '2', '3'])
    expect(urls[0]).toContain('/post-1/comments?')
    expect(urls[0]).toContain('limit=50')
    // La url del cursor se usa tal cual, sin volver a pegarle token ni campos.
    expect(urls[1]).toBe('https://graph.facebook.com/pagina2')
    expect(urls[2]).toBe('https://graph.facebook.com/pagina3')
  })

  it('se corta en cinco páginas aunque Graph siga ofreciendo cursor', async () => {
    const urls = stubGraph((n) => ({
      data: [raw(`c${n}`)],
      paging: { next: `https://graph.facebook.com/pagina${n + 1}` },
    }))

    const leidos = await instagramComentarista.listar(CUENTA, 'TOKEN', 'post-1')

    expect(urls).toHaveLength(5)
    expect(leidos.map((c) => c.externalId)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
  })
})

describe('instagramComentarista.responder', () => {
  it('un 400 con el código 100 es el comentario que ya no está', async () => {
    stubError(400, JSON.stringify({ error: { code: 100, message: 'Object does not exist' } }))
    await expect(instagramComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      COMENTARIO_AUSENTE,
    )
  })

  it('un 400 con otro código es el error genérico de la red', async () => {
    stubError(400, JSON.stringify({ error: { code: 190, message: 'Session expired' } }))
    await expect(instagramComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      /^Instagram 400:/,
    )
  })

  it('un cuerpo que no es JSON no revienta el parseo: error genérico', async () => {
    stubError(400, '<html>algo salió mal</html>')
    await expect(instagramComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      /^Instagram 400:/,
    )
  })
})
