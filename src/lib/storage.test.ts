import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SIN_ALMACEN, existe, keyDesdeUrl, urlParaSubir, urlPublica } from './storage'

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

describe('sin R2 configurado', () => {
  const guardado: Record<string, string | undefined> = {}
  const VARS = ['R2_BUCKET', 'R2_PUBLIC_BASE', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']

  beforeEach(() => {
    for (const v of VARS) {
      guardado[v] = process.env[v]
      delete process.env[v]
    }
  })
  afterEach(() => {
    for (const v of VARS) {
      if (guardado[v] !== undefined) process.env[v] = guardado[v]
    }
  })

  it('urlParaSubir lanza la misma frase que guardar()', async () => {
    await expect(urlParaSubir('scheduled/a.mp4', 'video/mp4')).rejects.toThrow(SIN_ALMACEN)
  })

  it('existe() es falso: sin almacén nada existe', async () => {
    expect(await existe('https://media.ejemplo.com/scheduled/a.mp4')).toBe(false)
  })
})

describe('existe con una URL ajena', () => {
  it('es falso sin tocar la red, igual que borrar() no toca lo ajeno', async () => {
    process.env.R2_BUCKET = 'b'
    process.env.R2_PUBLIC_BASE = BASE
    try {
      expect(await existe('https://scontent.cdninstagram.com/v/foto.jpg')).toBe(false)
    } finally {
      delete process.env.R2_BUCKET
      delete process.env.R2_PUBLIC_BASE
    }
  })
})
