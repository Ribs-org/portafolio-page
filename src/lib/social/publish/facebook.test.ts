import { describe, expect, it } from 'vitest'
import {
  FACEBOOK_MIXED_MEDIA,
  FACEBOOK_REJECTED,
  classifyVideoStatus,
  hasMixedMedia,
  multiPhotoFeedParams,
  photoPostParams,
  unpublishedPhotoParams,
  videoPostParams,
  storyId,
} from './facebook'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('payloads de publicación en la página', () => {
  it('foto sola: url y caption, publicada de inmediato', () => {
    expect(photoPostParams('Hola', image)).toEqual({
      url: 'https://blob.test/a.jpg',
      caption: 'Hola',
    })
  })

  it('foto de un post múltiple: sin caption y sin publicar todavía', () => {
    // El texto va una sola vez, en el post de /feed; la foto suelta espera invisible.
    expect(unpublishedPhotoParams(image)).toEqual({
      url: 'https://blob.test/a.jpg',
      published: 'false',
    })
  })

  it('el post múltiple adjunta los fbid en orden, como JSON indexado', () => {
    expect(multiPhotoFeedParams('Hola', ['F1', 'F2', 'F3'])).toEqual({
      message: 'Hola',
      'attached_media[0]': '{"media_fbid":"F1"}',
      'attached_media[1]': '{"media_fbid":"F2"}',
      'attached_media[2]': '{"media_fbid":"F3"}',
    })
  })

  it('video: file_url y description', () => {
    expect(videoPostParams('Hola', video)).toEqual({
      file_url: 'https://blob.test/b.mp4',
      description: 'Hola',
    })
  })
})

describe('classifyVideoStatus', () => {
  it('ready está listo para declararse publicado', () => {
    expect(classifyVideoStatus({ status: { video_status: 'ready' } })).toBe('ready')
  })

  it('error es un veredicto, no una espera', () => {
    expect(classifyVideoStatus({ status: { video_status: 'error' } })).toBe('error')
  })

  it('processing, ausente o desconocido siguen esperando', () => {
    expect(classifyVideoStatus({ status: { video_status: 'processing' } })).toBe('processing')
    expect(classifyVideoStatus({})).toBe('processing')
    expect(classifyVideoStatus({ status: { video_status: 'upload_complete' } })).toBe('processing')
  })
})

describe('hasMixedMedia', () => {
  it('video y foto juntos es mezcla; cualquiera solo o repetido no lo es', () => {
    expect(hasMixedMedia([image, video])).toBe(true)
    expect(hasMixedMedia([image, { ...image, position: 1 }])).toBe(false)
    expect(hasMixedMedia([video])).toBe(false)
  })

  it('la frase del rechazo es fija y en español', () => {
    expect(FACEBOOK_MIXED_MEDIA).toBe('Facebook no admite mezclar video y fotos en un post.')
  })

  it('la frase del rechazo nombra a Facebook, no a otra red', () => {
    expect(FACEBOOK_REJECTED).toBe('Facebook rechazó la publicación.')
  })
})

describe('storyId', () => {
  const PAGE = '1203923749477794'

  it('compone páginaID_postID: es el espacio de ids que guardan las métricas', () => {
    expect(storyId({ post_id: '122107507743448275' }, PAGE, '1372222415120746')).toBe(
      '1203923749477794_122107507743448275',
    )
  })

  it('un post_id ya compuesto se respeta tal cual', () => {
    expect(storyId({ post_id: `${PAGE}_999` }, PAGE, 'v-1')).toBe(`${PAGE}_999`)
  })

  it('sin post_id usable cae al id propio: publicar vale más que el calce', () => {
    expect(storyId({}, PAGE, 'v-1')).toBe('v-1')
    expect(storyId({ post_id: '' }, PAGE, 'v-1')).toBe('v-1')
    expect(storyId({ post_id: 42 }, PAGE, 'v-1')).toBe('v-1')
    expect(storyId(null, PAGE, 'v-1')).toBe('v-1')
  })
})
