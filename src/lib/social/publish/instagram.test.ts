import { describe, expect, it } from 'vitest'
import {
  carouselChildParams,
  carouselParentParams,
  classifyContainerStatus,
  photoContainerParams,
  reelContainerParams,
} from './instagram'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('payloads de contenedores', () => {
  it('foto: image_url y caption, nada más', () => {
    expect(photoContainerParams('Hola', image)).toEqual({
      image_url: 'https://blob.test/a.jpg',
      caption: 'Hola',
    })
  })

  it('video: media_type REELS con video_url', () => {
    expect(reelContainerParams('Hola', video, null)).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob.test/b.mp4',
      caption: 'Hola',
    })
  })

  it('hijo de carrusel: imagen y video llevan is_carousel_item', () => {
    expect(carouselChildParams(image)).toEqual({
      image_url: 'https://blob.test/a.jpg',
      is_carousel_item: 'true',
    })
    expect(carouselChildParams(video)).toEqual({
      media_type: 'VIDEO',
      video_url: 'https://blob.test/b.mp4',
      is_carousel_item: 'true',
    })
  })

  it('padre de carrusel: children en orden, separados por coma', () => {
    expect(carouselParentParams('Hola', ['C1', 'C2', 'C3'])).toEqual({
      media_type: 'CAROUSEL',
      children: 'C1,C2,C3',
      caption: 'Hola',
    })
  })
})

describe('reelContainerParams con portada', () => {
  const media = { url: 'https://blob/v.mp4', mediaType: 'video' as const, position: 0 }

  it('con portada agrega cover_url', () => {
    expect(reelContainerParams('Hola', media, 'https://blob/p.jpg')).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob/v.mp4',
      caption: 'Hola',
      cover_url: 'https://blob/p.jpg',
    })
  })

  it('sin portada el cuerpo queda como siempre', () => {
    expect(reelContainerParams('Hola', media, null)).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob/v.mp4',
      caption: 'Hola',
    })
  })
})

describe('classifyContainerStatus', () => {
  it('FINISHED está listo para publicar', () => {
    expect(classifyContainerStatus({ status_code: 'FINISHED' })).toBe('finished')
  })

  it('ERROR y EXPIRED son veredictos, no esperas', () => {
    expect(classifyContainerStatus({ status_code: 'ERROR' })).toBe('error')
    expect(classifyContainerStatus({ status_code: 'EXPIRED' })).toBe('error')
  })

  it('IN_PROGRESS, ausente o desconocido siguen esperando', () => {
    expect(classifyContainerStatus({ status_code: 'IN_PROGRESS' })).toBe('in_progress')
    expect(classifyContainerStatus({})).toBe('in_progress')
    expect(classifyContainerStatus({ status_code: 'PUBLISHED' })).toBe('in_progress')
  })
})
