import { describe, expect, it } from 'vitest'
import { problemasTikTok, type MediaMedida } from './limites'

const foto = (extra: Partial<MediaMedida> = {}): MediaMedida => ({
  nombre: 'foto.jpg',
  tipo: 'foto',
  bytes: 200_000,
  ancho: 1080,
  alto: 1920,
  segundos: null,
  ...extra,
})

const video = (extra: Partial<MediaMedida> = {}): MediaMedida => ({
  nombre: 'corto.mp4',
  tipo: 'video',
  bytes: 5_000_000,
  ancho: 1080,
  alto: 1920,
  segundos: 30,
  ...extra,
})

describe('fotos', () => {
  it('una vertical de 1080×1920 pasa', () => {
    expect(problemasTikTok(foto())).toEqual([])
  })

  it('el caso que falló en producción: más de 1080p de lado corto', () => {
    const problemas = problemasTikTok(foto({ ancho: 1440, alto: 2560 }))
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toContain('1080p')
    expect(problemas[0]).toContain('1440×2560')
  })

  it('una horizontal de 1920×1080 pasa: el límite es el lado corto', () => {
    expect(problemasTikTok(foto({ ancho: 1920, alto: 1080 }))).toEqual([])
  })

  it('más de veinte megas no pasa', () => {
    const problemas = problemasTikTok(foto({ bytes: 25 * 1024 * 1024 }))
    expect(problemas).toHaveLength(1)
    expect(problemas[0]).toContain('25 MB')
  })

  it('acumula los dos problemas cuando los tiene', () => {
    expect(problemasTikTok(foto({ bytes: 30 * 1024 * 1024, ancho: 3000, alto: 4000 }))).toHaveLength(2)
  })

  it('sin medidas legibles no inventa un problema', () => {
    expect(problemasTikTok(foto({ ancho: null, alto: null }))).toEqual([])
  })
})

describe('videos', () => {
  it('un vertical corriente pasa', () => {
    expect(problemasTikTok(video())).toEqual([])
  })

  it('un video de 1440×2560 pasa: en video el techo es 4096, no 1080', () => {
    expect(problemasTikTok(video({ ancho: 1440, alto: 2560 }))).toEqual([])
  })

  it('demasiado chico o demasiado grande no pasa', () => {
    expect(problemasTikTok(video({ ancho: 240, alto: 320 }))[0]).toContain('360')
    expect(problemasTikTok(video({ ancho: 5000, alto: 8000 }))[0]).toContain('4096')
  })

  it('más de diez minutos no pasa', () => {
    expect(problemasTikTok(video({ segundos: 15 * 60 }))[0]).toContain('10')
  })

  it('sin duración legible no inventa un problema', () => {
    expect(problemasTikTok(video({ segundos: null }))).toEqual([])
  })
})
