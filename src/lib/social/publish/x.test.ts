import { describe, expect, it } from 'vitest'
import { X_NO_VIDEO, X_REJECTED, X_TOO_MANY_IMAGES, tweetBody } from './x'

describe('tweetBody', () => {
  it('texto puro no lleva bloque de media', () => {
    expect(tweetBody('Hola', [])).toEqual({ text: 'Hola' })
  })

  it('con imágenes adjunta los media_ids en orden', () => {
    expect(tweetBody('Hola', ['M1', 'M2'])).toEqual({
      text: 'Hola',
      media: { media_ids: ['M1', 'M2'] },
    })
  })
})

describe('frases fijas', () => {
  it('nombran a X, no a otra red', () => {
    expect(X_REJECTED).toBe('X rechazó la publicación.')
    expect(X_NO_VIDEO).toBe('X aún no recibe video desde el calendario.')
    expect(X_TOO_MANY_IMAGES).toBe('X recibe hasta cuatro imágenes.')
  })
})
