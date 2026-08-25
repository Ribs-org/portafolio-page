import { describe, expect, it } from 'vitest'
import fixture from './fixtures/instagram-media.json'
import {
  normalizeInstagramMedia,
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
