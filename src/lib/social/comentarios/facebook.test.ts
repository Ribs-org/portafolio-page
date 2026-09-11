import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMENTARIO_AUSENTE } from './comentarista'
import { facebookComentarista, normalizeFacebookComment } from './facebook'

// `listar` y `responder` no miran la cuenta: leen y escriben con el token que reciben.
const CUENTA = {} as Parameters<typeof facebookComentarista.listar>[0]

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

  it('sin fecha o con fecha basura toma la del descubrimiento, nunca 1970', () => {
    const antes = Date.now()
    for (const created_time of [undefined, 'ayer por la tarde']) {
      const c = normalizeFacebookComment({ id: '1', message: 'hola', created_time }, 'p')
      expect(c?.publishedAt.getTime()).not.toBeNaN()
      expect(c?.publishedAt.getTime()).toBeGreaterThanOrEqual(antes)
    }
  })
})

describe('facebookComentarista.listar', () => {
  const raw = (id: string) => ({ id, message: 'hola', created_time: '2026-09-10T18:22:04+0000' })

  it('sigue el cursor de Graph hasta que se acaba: tres páginas, tres llamadas', async () => {
    const paginas = [
      { data: [raw('1')], paging: { next: 'https://graph.facebook.com/pagina2' } },
      { data: [raw('2')], paging: { next: 'https://graph.facebook.com/pagina3' } },
      { data: [raw('3')] },
    ]
    const urls = stubGraph((n) => paginas[n])

    const leidos = await facebookComentarista.listar(CUENTA, 'TOKEN', 'post-1')

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

    const leidos = await facebookComentarista.listar(CUENTA, 'TOKEN', 'post-1')

    expect(urls).toHaveLength(5)
    expect(leidos.map((c) => c.externalId)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
  })
})

describe('facebookComentarista.responder', () => {
  it('un 400 con el código 100 es el comentario que ya no está', async () => {
    stubError(400, JSON.stringify({ error: { code: 100, message: 'Object does not exist' } }))
    await expect(facebookComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      COMENTARIO_AUSENTE,
    )
  })

  it('un 400 con otro código es el error genérico de la red', async () => {
    stubError(400, JSON.stringify({ error: { code: 190, message: 'Session expired' } }))
    await expect(facebookComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      /^Facebook 400:/,
    )
  })

  it('un cuerpo que no es JSON no revienta el parseo: error genérico', async () => {
    stubError(400, '<html>algo salió mal</html>')
    await expect(facebookComentarista.responder(CUENTA, 'TOKEN', 'c1', 'hola')).rejects.toThrow(
      /^Facebook 400:/,
    )
  })
})
