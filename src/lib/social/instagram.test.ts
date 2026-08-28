import { describe, expect, it } from 'vitest'
import fixture from './fixtures/instagram-media.json'
import {
  normalizeInstagramMedia,
  pickInstagramAccount,
  type FacebookPages,
  type InstagramInsights,
  type InstagramMedia,
} from './instagram'

const media = fixture.media as InstagramMedia
const insights = fixture.insights as InstagramInsights
const imageMedia = fixture.imageMedia as InstagramMedia
const imageInsights = fixture.imageInsights as InstagramInsights

describe('normalizeInstagramMedia', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.externalId).toBe('17912345678901234')
    expect(post.permalink).toBe('https://www.instagram.com/reel/C8xK2Lp/')
    expect(post.caption).toBe('Rutina de gimnasio completa 💪 link en bio')
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/thumb.jpg')
    expect(post.mediaType).toBe('reel')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T18:22:04.000Z')
  })

  it('aplana la forma anidada de insights', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.metrics).toEqual({
      views: 42130,
      reach: 38104,
      likes: 3211,
      comments: 180,
      saves: 640,
      shares: 212,
    })
  })

  it('deja en null la métrica que no vino', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.metrics.reach).toBe(900)
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.likes).toBeNull()
  })

  it('usa media_url cuando no hay thumbnail, que es el caso de las fotos', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/foto.jpg')
    expect(post.mediaType).toBe('image')
  })

  it('tolera un post sin caption', () => {
    expect(normalizeInstagramMedia(imageMedia, imageInsights).caption).toBeNull()
  })
})

describe('pickInstagramAccount', () => {
  it('saca la cuenta de la única página que la tiene', () => {
    const pages: FacebookPages = {
      data: [
        {
          id: '61550000000001',
          name: 'Vicente Pareja',
          instagram_business_account: { id: '17841400000000001', username: 'vicente' },
        },
      ],
    }
    expect(pickInstagramAccount(pages)).toEqual({
      id: '17841400000000001',
      username: 'vicente',
    })
  })

  it('salta las páginas sin cuenta y devuelve la que sí la tiene', () => {
    const pages: FacebookPages = {
      data: [
        { id: '61550000000002', name: 'Página vieja' },
        { id: '61550000000003', name: 'Página sin Instagram', instagram_business_account: null },
        {
          id: '61550000000004',
          name: 'Página buena',
          instagram_business_account: { id: '17841400000000009', username: 'gimnasio' },
        },
      ],
    }
    // El id que importa es el de Instagram, nunca el de la página que lo contiene.
    expect(pickInstagramAccount(pages)).toEqual({
      id: '17841400000000009',
      username: 'gimnasio',
    })
  })

  it('devuelve null si ninguna página tiene cuenta de Instagram', () => {
    const pages: FacebookPages = {
      data: [{ id: '61550000000005', name: 'Solo Facebook' }],
    }
    expect(pickInstagramAccount(pages)).toBeNull()
  })

  it('devuelve null cuando no hay páginas', () => {
    expect(pickInstagramAccount({ data: [] })).toBeNull()
    expect(pickInstagramAccount({})).toBeNull()
  })

  it('acepta una cuenta sin username en vez de inventarlo', () => {
    const pages: FacebookPages = {
      data: [{ id: '6155000000006', instagram_business_account: { id: '17841400000000010' } }],
    }
    expect(pickInstagramAccount(pages)).toEqual({ id: '17841400000000010', username: null })
  })
})
