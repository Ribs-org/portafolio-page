import { describe, expect, it } from 'vitest'
import { keyDesdeUrl, urlPublica } from './storage'

const BASE = 'https://media.ejemplo.com'

describe('urlPublica', () => {
  it('cuelga la key de la base', () => {
    expect(urlPublica(BASE, 'scheduled/abc.mp4')).toBe('https://media.ejemplo.com/scheduled/abc.mp4')
  })

  it('tolera una base con barra final', () => {
    expect(urlPublica(`${BASE}/`, 'scheduled/abc.mp4')).toBe(
      'https://media.ejemplo.com/scheduled/abc.mp4',
    )
  })

  it('codifica cada segmento por separado, sin comerse las barras', () => {
    // Las keys llevan el nombre del archivo que subió el dueño: espacios y tildes.
    expect(urlPublica(BASE, 'uploads/uuid-mi vídeo (1).mp4')).toBe(
      'https://media.ejemplo.com/uploads/uuid-mi%20v%C3%ADdeo%20(1).mp4',
    )
  })
})

describe('keyDesdeUrl', () => {
  it('es la inversa de urlPublica, incluso con nombres raros', () => {
    const key = 'uploads/uuid-mi vídeo (1).mp4'
    expect(keyDesdeUrl(BASE, urlPublica(BASE, key))).toBe(key)
  })

  it('tolera una base con barra final', () => {
    expect(keyDesdeUrl(`${BASE}/`, `${BASE}/scheduled/abc.mp4`)).toBe('scheduled/abc.mp4')
  })

  it('ignora la query string', () => {
    expect(keyDesdeUrl(BASE, `${BASE}/scheduled/abc.mp4?v=2`)).toBe('scheduled/abc.mp4')
  })

  it('devuelve null para una URL de otro dominio', () => {
    // Es lo que hace que borrar() no toque una miniatura de Instagram ni un blob viejo.
    expect(keyDesdeUrl(BASE, 'https://scontent.cdninstagram.com/v/foto.jpg')).toBeNull()
    expect(keyDesdeUrl(BASE, 'https://abc.public.blob.vercel-storage.com/scheduled/x.mp4')).toBeNull()
  })

  it('devuelve null si la base no trae key', () => {
    expect(keyDesdeUrl(BASE, BASE)).toBeNull()
    expect(keyDesdeUrl(BASE, `${BASE}/`)).toBeNull()
  })

  it('devuelve null si el percent-encoding está roto', () => {
    expect(keyDesdeUrl(BASE, `${BASE}/scheduled/%E0%A4%A.mp4`)).toBeNull()
  })
})
