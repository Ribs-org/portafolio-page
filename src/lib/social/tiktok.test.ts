import { describe, expect, it } from 'vitest'
import fixture from './fixtures/tiktok-videos.json'
import { normalizeTikTokVideo, type TikTokVideo } from './tiktok'

const [video, fresh] = fixture.data.videos as TikTokVideo[]

describe('normalizeTikTokVideo', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.externalId).toBe('7234567890123456789')
    expect(post.permalink).toBe('https://www.tiktok.com/@ribs/video/7234567890123456789')
    expect(post.caption).toBe('Respuesta a @alguien sobre entrenar en casa')
    expect(post.thumbnailUrl).toBe('https://p16.tiktokcdn.com/cover1.jpeg')
    expect(post.mediaType).toBe('video')
  })

  it('lee create_time como segundos epoch, no milisegundos', () => {
    expect(normalizeTikTokVideo(video!).publishedAt.toISOString()).toBe('2026-08-04T00:00:00.000Z')
  })

  it('mapea los cuatro contadores que TikTok sí reporta', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.metrics.views).toBe(91204)
    expect(post.metrics.likes).toBe(7712)
    expect(post.metrics.comments).toBe(620)
    expect(post.metrics.shares).toBe(388)
  })

  it('deja en null lo que la Display API no expone', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.metrics.saves).toBeNull()
    expect(post.metrics.reach).toBeNull()
  })

  it('guarda un cero real como cero, no como ausencia', () => {
    const post = normalizeTikTokVideo(fresh!)
    expect(post.metrics.views).toBe(0)
    expect(post.metrics.likes).toBe(0)
    expect(post.metrics.comments).toBe(0)
    expect(post.metrics.shares).toBe(0)
  })

  it('trata el título vacío como sin caption', () => {
    expect(normalizeTikTokVideo(fresh!).caption).toBeNull()
  })
})
