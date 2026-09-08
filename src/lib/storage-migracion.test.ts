import { describe, expect, it } from 'vitest'
import { esUrlVercelBlob } from './storage-migracion'

describe('esUrlVercelBlob', () => {
  it('reconoce una URL pública del Blob', () => {
    expect(esUrlVercelBlob('https://abc123.public.blob.vercel-storage.com/scheduled/x.mp4')).toBe(true)
  })

  it('reconoce la forma sin `public`', () => {
    expect(esUrlVercelBlob('https://abc123.blob.vercel-storage.com/uploads/y.png')).toBe(true)
  })

  it('rechaza una URL de nuestro bucket de R2', () => {
    expect(esUrlVercelBlob('https://media.ejemplo.com/scheduled/x.mp4')).toBe(false)
  })

  it('rechaza una miniatura de una red social', () => {
    expect(esUrlVercelBlob('https://scontent.cdninstagram.com/v/foto.jpg')).toBe(false)
  })

  it('rechaza un dominio que solo contiene el nombre', () => {
    // Un atacante no aplica acá, pero un typo sí: no queremos migrar lo que no es.
    expect(esUrlVercelBlob('https://blob.vercel-storage.com.ejemplo.com/x.mp4')).toBe(false)
  })

  it('rechaza vacío y basura', () => {
    expect(esUrlVercelBlob('')).toBe(false)
    expect(esUrlVercelBlob('no-es-una-url')).toBe(false)
  })
})
