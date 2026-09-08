import { describe, expect, it } from 'vitest'
import { GRACIA_MS, objetosABorrar } from './storage-gc'
import type { ObjetoAlmacenado } from './storage'

const AHORA = new Date('2026-09-07T12:00:00Z')
const VIEJO = new Date(AHORA.getTime() - 3 * 60 * 60 * 1000) // 3 horas
const RECIEN = new Date(AHORA.getTime() - 5 * 60 * 1000) // 5 minutos

function obj(nombre: string, uploadedAt: Date, size = 100): ObjetoAlmacenado {
  return { key: `scheduled/${nombre}`, url: `https://media.ejemplo.com/scheduled/${nombre}`, size, uploadedAt }
}

describe('objetosABorrar', () => {
  it('borra lo huérfano y viejo', () => {
    const huerfano = obj('a.mp4', VIEJO)
    expect(objetosABorrar([huerfano], new Set(['https://media.ejemplo.com/otra.mp4']), AHORA)).toEqual([
      huerfano,
    ])
  })

  it('no toca lo que alguna fila referencia', () => {
    const vivo = obj('a.mp4', VIEJO)
    expect(objetosABorrar([vivo], new Set([vivo.url]), AHORA)).toEqual([])
  })

  it('respeta la ventana de gracia aunque esté huérfano', () => {
    // Entre el put() y el insert() hay una ventana real: sin la gracia el barrido
    // puede matar un archivo cuya fila todavía no se escribió.
    const recien = obj('a.mp4', RECIEN)
    expect(objetosABorrar([recien], new Set(['https://media.ejemplo.com/otra.mp4']), AHORA)).toEqual([])
  })

  it('con el conjunto de referencias vacío no borra nada', () => {
    // Cero referencias con objetos en el bucket no es un estado que esta app produzca:
    // cada archivo nace junto a la fila que lo apunta. Es mucho más probable que la
    // lectura haya fallado, y vaciar el bucket por eso no tiene vuelta.
    expect(objetosABorrar([obj('a.mp4', VIEJO), obj('b.mp4', VIEJO)], new Set(), AHORA)).toEqual([])
  })

  it('separa un lote mixto', () => {
    const vivo = obj('vivo.mp4', VIEJO)
    const huerfano = obj('huerfano.mp4', VIEJO)
    const nuevo = obj('nuevo.mp4', RECIEN)
    expect(objetosABorrar([vivo, huerfano, nuevo], new Set([vivo.url]), AHORA)).toEqual([huerfano])
  })

  it('la gracia por defecto es de una hora', () => {
    expect(GRACIA_MS).toBe(60 * 60 * 1000)
    const justoDentro = obj('a.mp4', new Date(AHORA.getTime() - GRACIA_MS + 1000))
    const justoFuera = obj('b.mp4', new Date(AHORA.getTime() - GRACIA_MS - 1000))
    const refs = new Set(['https://media.ejemplo.com/otra.mp4'])
    expect(objetosABorrar([justoDentro, justoFuera], refs, AHORA)).toEqual([justoFuera])
  })
})
