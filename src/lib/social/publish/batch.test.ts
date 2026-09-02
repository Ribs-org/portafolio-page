import { describe, expect, it } from 'vitest'
import {
  mediaTypeFromUrl,
  typeFromContentType,
  validateBatchItem,
  PORTADA_NEEDS_VIDEO,
  PORTADA_NOT_IMAGE,
  type BatchItem,
} from './batch'

const now = new Date('2026-09-02T12:00:00Z')
const base: BatchItem = {
  fecha: '2026-09-03 10:00',
  texto: 'Hola lote',
  redes: ['threads', 'x'],
  media: [],
}

describe('mediaTypeFromUrl', () => {
  it('infiere por extensión, ignorando mayúsculas y querystrings', () => {
    expect(mediaTypeFromUrl('https://ej.com/a.JPG')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/b.png?token=x')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/c.mp4')).toBe('video')
    expect(mediaTypeFromUrl('https://ej.com/d.webm')).toBe('video')
  })

  it('extensión desconocida es null: no se adivina', () => {
    expect(mediaTypeFromUrl('https://ej.com/archivo.pdf')).toBeNull()
    expect(mediaTypeFromUrl('https://ej.com/sin-extension')).toBeNull()
  })
})

describe('validateBatchItem', () => {
  it('acepta un item de texto puro válido', () => {
    expect(validateBatchItem(base, now)).toBeNull()
  })

  it('rechaza la fecha ilegible con la pista del formato', () => {
    expect(validateBatchItem({ ...base, fecha: 'mañana a las diez' }, now)).toMatch(/YYYY-MM-DD/)
  })

  it('rechaza redes desconocidas o sin publisher', () => {
    expect(validateBatchItem({ ...base, redes: ['tiktok'] }, now)).toMatch(/tiktok/)
    expect(validateBatchItem({ ...base, redes: ['myspace'] }, now)).toMatch(/myspace/)
  })

  it('difiere la extensión desconocida: la URL de Drive pasa y el content-type decide', () => {
    const drive = 'https://drive.usercontent.google.com/download?id=abc&export=download'
    expect(validateBatchItem({ ...base, media: [drive] }, now)).toBeNull()
  })

  it('la media de tipo diferido igual cuenta como archivo en las reglas por cantidad', () => {
    const url = 'https://ej.com/sin-extension'
    expect(validateBatchItem({ ...base, redes: ['instagram'], media: [url] }, now)).toBeNull()
    expect(validateBatchItem({ ...base, redes: ['threads'], media: [url, url] }, now)).toMatch(
      /un solo archivo/,
    )
    expect(validateBatchItem({ ...base, redes: ['x'], media: Array(5).fill(url) }, now)).toMatch(
      /cuatro/,
    )
  })

  it('delega en las reglas del compositor: límites y formas por red', () => {
    expect(validateBatchItem({ ...base, texto: 'x'.repeat(281) }, now)).toMatch(/280/)
    expect(
      validateBatchItem(
        { ...base, redes: ['instagram'], media: [] },
        now,
      ),
    ).toMatch(/archivo/)
    expect(
      validateBatchItem(
        { ...base, redes: ['x'], media: ['https://ej.com/v.mp4'] },
        now,
      ),
    ).toMatch(/video/)
  })

  it('rechaza redes repetidas: el destino es único por post', () => {
    expect(validateBatchItem({ ...base, redes: ['x', 'x'] }, now)).toMatch(/repetidas/)
  })

  it('rechaza fechas ISO con zona o segundos: solo YYYY-MM-DD HH:MM', () => {
    expect(validateBatchItem({ ...base, fecha: '2026-09-03T10:00:00Z' }, now)).toMatch(/YYYY-MM-DD/)
  })
})

describe('typeFromContentType', () => {
  it('mapea image/* y video/* a tipo y extensión, tolerando parámetros', () => {
    expect(typeFromContentType('image/jpeg')).toEqual({ mediaType: 'image', extension: 'jpg' })
    expect(typeFromContentType('image/png')).toEqual({ mediaType: 'image', extension: 'png' })
    expect(typeFromContentType('video/mp4; codecs=avc1')).toEqual({
      mediaType: 'video',
      extension: 'mp4',
    })
    expect(typeFromContentType('video/quicktime')).toEqual({ mediaType: 'video', extension: 'mov' })
  })

  it('cualquier otro content-type es null: la fila se rechaza al descargar', () => {
    expect(typeFromContentType('application/pdf')).toBeNull()
    expect(typeFromContentType('text/html; charset=utf-8')).toBeNull()
    expect(typeFromContentType('')).toBeNull()
  })
})

describe('portada en validateBatchItem', () => {
  const conVideo = { ...base, redes: ['facebook'], media: ['https://ej.com/v.mp4'] }

  it('portada con video en media pasa', () => {
    expect(
      validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.jpg' }, now),
    ).toBeNull()
  })

  it('portada sin ningún video posible es la frase fija', () => {
    expect(
      validateBatchItem({ ...base, media: ['https://ej.com/a.jpg'], redes: ['facebook'], portada: 'https://ej.com/p.jpg' }, now),
    ).toBe(PORTADA_NEEDS_VIDEO)
    expect(validateBatchItem({ ...base, portada: 'https://ej.com/p.jpg' }, now)).toBe(
      PORTADA_NEEDS_VIDEO,
    )
  })

  it('media de tipo diferido mantiene viva la portada: el content-type decidirá', () => {
    const drive = 'https://drive.usercontent.google.com/download?id=x&export=download'
    expect(
      validateBatchItem({ ...base, redes: ['facebook'], media: [drive], portada: 'https://ej.com/p.jpg' }, now),
    ).toBeNull()
  })

  it('portada con extensión de video es la otra frase fija', () => {
    expect(
      validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.mp4' }, now),
    ).toBe(PORTADA_NOT_IMAGE)
  })

  it('portada vacía o ausente no exige nada', () => {
    expect(validateBatchItem({ ...conVideo, portada: '' }, now)).toBeNull()
    expect(validateBatchItem(conVideo, now)).toBeNull()
  })
})
