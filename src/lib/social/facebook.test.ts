import { describe, expect, it } from 'vitest'
import fixture from './fixtures/facebook-posts.json'
import {
  AMBIGUOUS_FACEBOOK_PAGE,
  FacebookPageError,
  FacebookHttpError,
  NO_FACEBOOK_PAGE,
  PINNED_FACEBOOK_PAGE_MISSING,
  isPostWithoutInsights,
  pickFacebookPage,
  normalizeFacebookPost,
  collectPublishedPosts,
  type FacebookPagesList,
  type FacebookInsights,
  type FacebookPost,
} from './facebook'

describe('pickFacebookPage', () => {
  it('elige la única página administrable', () => {
    const pages: FacebookPagesList = {
      data: [{ id: '61550000000001', name: 'Ribs', access_token: 'PAGE_TOKEN' }],
    }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000001',
      name: 'Ribs',
      accessToken: 'PAGE_TOKEN',
    })
  })

  it('tolera una página sin nombre o sin token, con null y no inventando', () => {
    const pages: FacebookPagesList = { data: [{ id: '61550000000002' }] }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000002',
      name: null,
      accessToken: null,
    })
  })

  it('falla cuando no hay páginas', () => {
    expect(() => pickFacebookPage({ data: [] })).toThrowError(NO_FACEBOOK_PAGE)
    expect(() => pickFacebookPage({})).toThrowError(NO_FACEBOOK_PAGE)
  })

  const varias: FacebookPagesList = {
    data: [
      { id: '61550000000010', name: 'Personal', access_token: 'T10' },
      { id: '61550000000011', name: 'Gimnasio', access_token: 'T11' },
      { id: '61550000000012', name: 'Proyecto', access_token: 'T12' },
    ],
  }

  it('se niega a elegir cuando hay varias candidatas', () => {
    // Nunca la primera: el orden de me/accounts no es una promesa, y conectar otra
    // página archiva el catálogo entero de la anterior.
    expect(() => pickFacebookPage(varias)).toThrowError(AMBIGUOUS_FACEBOOK_PAGE)
  })

  it('con varias candidatas elige la fijada, no la primera', () => {
    expect(pickFacebookPage(varias, '61550000000012')).toEqual({
      id: '61550000000012',
      name: 'Proyecto',
      accessToken: 'T12',
    })
  })

  it('falla si la página fijada no está entre las disponibles', () => {
    expect(() => pickFacebookPage(varias, '61550000000099')).toThrowError(
      PINNED_FACEBOOK_PAGE_MISSING,
    )
  })

  it('con un pin que no calza, nombra los ids encontrados y no los nombres', () => {
    try {
      pickFacebookPage(varias, '61550000000099')
      expect.unreachable('debía lanzar')
    } catch (error) {
      const { message } = error as FacebookPageError
      expect(message).toContain('61550000000010')
      expect(message).toContain('61550000000012')
      expect(message).not.toContain('Gimnasio')
    }
  })

  it('sin ninguna candidata dice que no hay páginas, aunque haya pin', () => {
    expect(() => pickFacebookPage({ data: [] }, '61550000000099')).toThrowError(
      NO_FACEBOOK_PAGE,
    )
  })

  it('deja las candidatas en el error, no en el mensaje', () => {
    // Los nombres vienen de Meta: sirven para el log del servidor, nunca para el
    // texto que se le muestra a nadie.
    try {
      pickFacebookPage(varias)
      expect.unreachable('debía lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(FacebookPageError)
      const pageError = error as FacebookPageError
      expect(pageError.message).toBe(AMBIGUOUS_FACEBOOK_PAGE)
      expect(pageError.candidates.map((c) => c.id)).toEqual([
        '61550000000010',
        '61550000000011',
        '61550000000012',
      ])
    }
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
      likes: 511,
      comments: 48,
      shares: 34,
      saves: null,
    })
  })

  it('deja en null lo que no vino: shares ausente no es cero', () => {
    const post = normalizeFacebookPost(statusPost, statusInsights)
    expect(post.metrics.shares).toBeNull()
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.reach).toBeNull()
    // Un conteo que sí vino en cero es un cero real, no un null.
    expect(post.metrics.comments).toBe(0)
    expect(post.metrics.likes).toBe(12)
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
