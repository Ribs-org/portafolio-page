import { describe, expect, it } from 'vitest'
import fixture from './fixtures/facebook-posts.json'
import {
  FacebookHttpError,
  isPostWithoutInsights,
  listFacebookPages,
  normalizeFacebookPost,
  collectPublishedPosts,
  halveLimit,
  isTooMuchData,
  type FacebookPagesList,
  type FacebookInsights,
  type FacebookPost,
} from './facebook'

describe('listFacebookPages', () => {
  it('devuelve todas las páginas con id, con nombre y token cuando vienen', () => {
    const pages: FacebookPagesList = {
      data: [
        { id: '61550000000001', name: 'Ribs', access_token: 'T1' },
        { id: '61550000000002' },
        { name: 'sin id' },
      ],
    }
    expect(listFacebookPages(pages)).toEqual([
      { id: '61550000000001', name: 'Ribs', accessToken: 'T1' },
      { id: '61550000000002', name: null, accessToken: null },
    ])
  })

  it('sin páginas devuelve la lista vacía', () => {
    expect(listFacebookPages({ data: [] })).toEqual([])
    expect(listFacebookPages({})).toEqual([])
  })
})

const videoPost = fixture.videoPost as FacebookPost
const videoInsights = fixture.videoInsights as FacebookInsights
const statusPost = fixture.statusPost as FacebookPost
const statusInsights = fixture.statusInsights as FacebookInsights

describe('normalizeFacebookPost', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeFacebookPost(videoPost, videoInsights)
    expect(post.externalId).toBe('61550000000001_1020304050607080')
    expect(post.permalink).toBe(
      'https://www.facebook.com/61550000000001/posts/1020304050607080',
    )
    expect(post.caption).toBe('Nueva rutina en el gimnasio 💪 link en la bio')
    expect(post.thumbnailUrl).toBe('https://scontent.xx.fbcdn.net/v/thumb.jpg')
    expect(post.mediaType).toBe('video')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T18:22:04.000Z')
  })

  it('une insights con los conteos que vienen en el post mismo', () => {
    const post = normalizeFacebookPost(videoPost, videoInsights)
    expect(post.metrics).toEqual({
      views: 12840,
      reach: 9310,
      likes: 520,
      comments: 48,
      shares: 34,
      saves: null,
    })
  })

  it('el conteo exacto del post pisa la suma de reacciones de insights', () => {
    // El fixture trae ambos a propósito: 520 en likes.summary contra 511 sumando el
    // desglose por tipo. El conteo del post es el exacto; la suma es el respaldo.
    expect(normalizeFacebookPost(videoPost, videoInsights).metrics.likes).toBe(520)
  })

  it('sin el conteo del post, la suma del desglose de reacciones es el likes', () => {
    const post = normalizeFacebookPost(statusPost, {
      data: [{ name: 'post_reactions_by_type_total', values: [{ value: { like: 3, wow: 2 } }] }],
    })
    expect(post.metrics.likes).toBe(5)
  })

  it('un desglose presente pero vacío es un cero real, no un null', () => {
    const post = normalizeFacebookPost(statusPost, {
      data: [{ name: 'post_reactions_by_type_total', values: [{ value: {} }] }],
    })
    expect(post.metrics.likes).toBe(0)
  })

  it('deja en null lo que no vino: ausente no es cero', () => {
    const post = normalizeFacebookPost(statusPost, statusInsights)
    expect(post.metrics.shares).toBeNull()
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.reach).toBeNull()
    expect(post.metrics.likes).toBeNull()
    expect(post.metrics.comments).toBeNull()
  })

  it('saves es siempre null: Facebook no lo reporta', () => {
    expect(normalizeFacebookPost(videoPost, videoInsights).metrics.saves).toBeNull()
  })

  it('tolera un post sin message ni full_picture', () => {
    const post = normalizeFacebookPost(statusPost, statusInsights)
    expect(post.caption).toBeNull()
    expect(post.thumbnailUrl).toBeNull()
  })

  it('mapea el media_type del attachment al vocabulario del catálogo', () => {
    const base = { id: 'x', created_time: '2026-08-01T12:00:00+0000' }
    const withType = (media_type: string): FacebookPost => ({
      ...base,
      attachments: { data: [{ media_type }] },
    })
    expect(normalizeFacebookPost(withType('video'), {}).mediaType).toBe('video')
    expect(normalizeFacebookPost(withType('photo'), {}).mediaType).toBe('image')
    expect(normalizeFacebookPost(withType('album'), {}).mediaType).toBe('carousel')
    expect(normalizeFacebookPost(withType('share'), {}).mediaType).toBe('link')
    // Sin attachment (un estado de texto) también cae en link.
    expect(normalizeFacebookPost(statusPost, {}).mediaType).toBe('link')
  })
})

describe('isPostWithoutInsights', () => {
  it('tolera un 404: la publicación no tiene estadísticas', () => {
    expect(isPostWithoutInsights(new FacebookHttpError(404, 'Facebook 404: ...'))).toBe(true)
  })

  it('no tolera un 400, un 429 ni un 5xx, que son sistémicos', () => {
    expect(isPostWithoutInsights(new FacebookHttpError(400, 'Facebook 400: ...'))).toBe(false)
    expect(isPostWithoutInsights(new FacebookHttpError(429, 'rate limit'))).toBe(false)
    expect(isPostWithoutInsights(new FacebookHttpError(500, 'boom'))).toBe(false)
  })

  it('no tolera un error que no venga de una respuesta HTTP', () => {
    expect(isPostWithoutInsights(new Error('fetch failed'))).toBe(false)
  })
})

describe('collectPublishedPosts', () => {
  /** Sirve páginas de `count` posts; `next` dice si la página entrega cursor. */
  function serving(pages: Array<{ count: number; next: boolean }>) {
    let served = 0
    let calls = 0
    const fetchJson = async () => {
      const page = pages[calls] ?? { count: 0, next: true }
      calls++
      const data = Array.from({ length: page.count }, () => ({ id: String(served++) }))
      return { data, paging: page.next ? { next: `https://graph.test/p${calls}` } : {} }
    }
    return { fetchJson, callCount: () => calls }
  }

  it('junta todas las páginas hasta que se acaba el cursor', async () => {
    const { fetchJson, callCount } = serving([
      { count: 2, next: true },
      { count: 3, next: false },
    ])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts.map((p) => p.id)).toEqual(['0', '1', '2', '3', '4'])
    expect(windowWasCapped).toBe(false)
    expect(callCount()).toBe(2)
  })

  it('corta en MAX_POSTS_PER_SYNC y lo declara como ventana', async () => {
    const { fetchJson, callCount } = serving(
      Array.from({ length: 10 }, () => ({ count: 50, next: true })),
    )
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(200)
    expect(windowWasCapped).toBe(true)
    expect(callCount()).toBe(4)
  })

  it('un cursor que no trae datos no lo hace loopear para siempre', async () => {
    // Graph puede devolver data: [] con paging.next presente; sin tope de páginas el
    // while nunca llenaría el array y nunca saldría.
    const { fetchJson, callCount } = serving([])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(0)
    expect(callCount()).toBe(50)
    // Con el cursor todavía en mano, lo honesto es declarar la ventana recortada.
    expect(windowWasCapped).toBe(true)
  })

  it('exactamente 200 sin cursor pendiente también es ventana', async () => {
    // Los items de la última página se descartan cuando el array se llena, diga lo
    // que diga el cursor — mismo razonamiento que el conector de Instagram.
    const { fetchJson } = serving([
      { count: 100, next: true },
      { count: 100, next: false },
    ])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(200)
    expect(windowWasCapped).toBe(true)
  })
})

describe('página demasiado pesada (Graph code 1)', () => {
  // El cuerpo literal que devolvió Meta el 2026-09-09, con status 500.
  const TOO_MUCH = new FacebookHttpError(
    500,
    'Facebook 500: {"error":{"code":1,"message":"Please reduce the amount of data you\'re asking for, then retry your request"}}',
  )

  it('isTooMuchData reconoce el code 1 y nada más', () => {
    expect(isTooMuchData(TOO_MUCH)).toBe(true)
    expect(isTooMuchData(new FacebookHttpError(500, 'Facebook 500: {"error":{"code":17}}'))).toBe(false)
    expect(isTooMuchData(new FacebookHttpError(404, 'Facebook 404: {"error":{"code":100}}'))).toBe(false)
    expect(isTooMuchData(new Error('code":1'))).toBe(false)
  })

  it('halveLimit reduce el limit de la URL a la mitad sin tocar el resto', () => {
    const url = 'https://graph.test/p/published_posts?fields=id,likes.summary(true)&limit=50&access_token=T'
    expect(halveLimit(url)).toBe(
      'https://graph.test/p/published_posts?fields=id,likes.summary(true)&limit=25&access_token=T',
    )
    expect(halveLimit('https://graph.test/p?limit=25')).toBe('https://graph.test/p?limit=12')
    expect(halveLimit('https://graph.test/p?limit=6')).toBe('https://graph.test/p?limit=5')
  })

  it('halveLimit devuelve null en el piso o sin limit: no hay más que recortar', () => {
    expect(halveLimit('https://graph.test/p?limit=5')).toBeNull()
    expect(halveLimit('https://graph.test/p?fields=id')).toBeNull()
  })

  it('collectPublishedPosts reintenta la misma página con la mitad y sigue', async () => {
    const seen: string[] = []
    const fetchJson = async (url: string) => {
      seen.push(url)
      const limit = Number(/limit=(\d+)/.exec(url)?.[1])
      if (limit >= 50) throw TOO_MUCH
      return { data: [{ id: 'a' }, { id: 'b' }], paging: {} }
    }
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p?limit=50', fetchJson)
    expect(posts.map((p) => p.id)).toEqual(['a', 'b'])
    expect(windowWasCapped).toBe(false)
    expect(seen).toEqual(['https://graph.test/p?limit=50', 'https://graph.test/p?limit=25'])
  })

  it('en el piso, el code 1 sube tal cual: ya no es un problema de tamaño', async () => {
    const fetchJson = async () => {
      throw TOO_MUCH
    }
    await expect(collectPublishedPosts('https://graph.test/p?limit=5', fetchJson)).rejects.toBe(TOO_MUCH)
  })

  it('cualquier otro error sube sin reintento', async () => {
    const otro = new FacebookHttpError(500, 'Facebook 500: {"error":{"code":2}}')
    let calls = 0
    const fetchJson = async () => {
      calls++
      throw otro
    }
    await expect(collectPublishedPosts('https://graph.test/p?limit=50', fetchJson)).rejects.toBe(otro)
    expect(calls).toBe(1)
  })
})
