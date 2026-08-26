import { describe, expect, it } from 'vitest'
import fixture from './fixtures/youtube-videos.json'
import { normalizeYouTubeVideo, type YouTubeVideo } from './youtube'

const [video, short] = fixture.items as YouTubeVideo[]

describe('normalizeYouTubeVideo', () => {
  it('mapea los campos que sí vienen', () => {
    const post = normalizeYouTubeVideo(video!)
    expect(post.externalId).toBe('dQw4w9WgXcQ')
    expect(post.permalink).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(post.caption).toBe('Cómo edito mis reels')
    expect(post.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T14:03:11.000Z')
    expect(post.metrics.views).toBe(8412)
    expect(post.metrics.likes).toBe(402)
    expect(post.metrics.comments).toBe(51)
  })

  it('deja en null lo que la Data API no reporta', () => {
    const post = normalizeYouTubeVideo(video!)
    expect(post.metrics.shares).toBeNull()
    expect(post.metrics.saves).toBeNull()
    expect(post.metrics.reach).toBeNull()
  })

  it('distingue un contador oculto de un cero', () => {
    const post = normalizeYouTubeVideo(short!)
    expect(post.metrics.views).toBe(1203)
    expect(post.metrics.likes).toBeNull()
    expect(post.metrics.comments).toBeNull()
  })

  it('llama short a lo que dura menos de un minuto', () => {
    expect(normalizeYouTubeVideo(short!).mediaType).toBe('short')
    expect(normalizeYouTubeVideo(video!).mediaType).toBe('video')
  })
})
