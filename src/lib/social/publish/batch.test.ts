import { describe, expect, it } from 'vitest'
import { mediaTypeFromUrl, validateBatchItem, type BatchItem } from './batch'

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

  it('rechaza media con extensión indescifrable', () => {
    expect(validateBatchItem({ ...base, media: ['https://ej.com/x.pdf'] }, now)).toMatch(/tipo/)
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
