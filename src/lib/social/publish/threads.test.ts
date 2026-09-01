import { describe, expect, it } from 'vitest'
import {
  THREADS_REJECTED,
  THREADS_SINGLE_FILE,
  classifyThreadsStatus,
  threadsContainerParams,
} from './threads'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('threadsContainerParams', () => {
  it('sin archivo es un post de texto', () => {
    expect(threadsContainerParams('Hola', null)).toEqual({ media_type: 'TEXT', text: 'Hola' })
  })

  it('imagen y video llevan su url y el texto', () => {
    expect(threadsContainerParams('Hola', image)).toEqual({
      media_type: 'IMAGE',
      image_url: 'https://blob.test/a.jpg',
      text: 'Hola',
    })
    expect(threadsContainerParams('Hola', video)).toEqual({
      media_type: 'VIDEO',
      video_url: 'https://blob.test/b.mp4',
      text: 'Hola',
    })
  })
})

describe('classifyThreadsStatus', () => {
  it('FINISHED publica; ERROR y EXPIRED son veredictos', () => {
    expect(classifyThreadsStatus({ status: 'FINISHED' })).toBe('finished')
    expect(classifyThreadsStatus({ status: 'ERROR' })).toBe('error')
    expect(classifyThreadsStatus({ status: 'EXPIRED' })).toBe('error')
  })

  it('IN_PROGRESS, ausente o desconocido siguen esperando', () => {
    expect(classifyThreadsStatus({ status: 'IN_PROGRESS' })).toBe('in_progress')
    expect(classifyThreadsStatus({})).toBe('in_progress')
  })
})

describe('frases fijas', () => {
  it('nombran a Threads, no a otra red', () => {
    expect(THREADS_REJECTED).toBe('Threads rechazó la publicación.')
    expect(THREADS_SINGLE_FILE).toBe('Threads recibe un solo archivo por post.')
  })
})
