import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  carouselChildParams,
  carouselParentParams,
  classifyContainerStatus,
  instagramPublisher,
  motivoDeRechazo,
  photoContainerParams,
  reelContainerParams,
} from './instagram'
import { PUBLISH_NETWORK_ERROR, TRIAL_REEL_NO_DISPONIBLE } from './publisher'

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

describe('reelContainerParams con trial reel', () => {
  const media = { url: 'https://blob/v.mp4', mediaType: 'video' as const, position: 0 }

  it('con trialReel agrega trial_params en MANUAL, como JSON en el form', () => {
    expect(reelContainerParams('Hola', media, null, { trialReel: true })).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob/v.mp4',
      caption: 'Hola',
      trial_params: '{"graduation_strategy":"MANUAL"}',
    })
  })

  it('con portada y trial, van las dos', () => {
    expect(reelContainerParams('Hola', media, 'https://blob/p.jpg', { trialReel: true })).toMatchObject({
      cover_url: 'https://blob/p.jpg',
      trial_params: '{"graduation_strategy":"MANUAL"}',
    })
  })

  it('sin opciones, o con las de otra red, no hay trial_params', () => {
    expect(reelContainerParams('Hola', media, null, null)).not.toHaveProperty('trial_params')
    expect(reelContainerParams('Hola', media, null, { modo: 'borrador' })).not.toHaveProperty('trial_params')
  })
})

describe('motivoDeRechazo', () => {
  const cuerpo = '{"error":{"message":"Trial reels are not available for this account","code":100}}'

  it('un rechazo que habla de trial, en un trial reel, es la frase fija', () => {
    expect(motivoDeRechazo(cuerpo, { trialReel: true })).toBe(TRIAL_REEL_NO_DISPONIBLE)
  })

  it('el mismo cuerpo sin trial reel pedido no es esa frase: se trata como hasta ahora', () => {
    expect(motivoDeRechazo(cuerpo, null)).toBeNull()
  })

  it('otro rechazo en un trial reel tampoco: solo se explica lo que se sabe explicar', () => {
    expect(motivoDeRechazo('{"error":{"message":"Invalid parameter","code":100}}', { trialReel: true })).toBeNull()
  })
})

describe('publish: el rechazo de un trial reel', () => {
  afterEach(() => vi.unstubAllGlobals())

  const input = {
    caption: 'Hola',
    media: [{ url: 'https://blob/v.mp4', mediaType: 'video' as const, position: 0 }],
    containerId: null,
    token: 't',
    accountExternalId: '123',
    coverUrl: null,
  }
  const cuatrocientos = () =>
    new Response('{"error":{"message":"Trial reels are not available for this account"}}', { status: 400 })

  it('en un trial reel, falla con la frase fija y no se reintenta como fallo de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => cuatrocientos()))
    const salida = await instagramPublisher.publish({ ...input, opciones: { trialReel: true } })
    expect(salida).toEqual({ kind: 'failed', reason: TRIAL_REEL_NO_DISPONIBLE })
  })

  it('en un reel normal, el mismo 400 sigue siendo el fallo de red de siempre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => cuatrocientos()))
    const salida = await instagramPublisher.publish({ ...input, opciones: null })
    expect(salida).toEqual({ kind: 'failed', reason: PUBLISH_NETWORK_ERROR })
  })
})
