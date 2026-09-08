import { describe, expect, it } from 'vitest'
import { GRACIA_MS, keysReferenciadas, objetosABorrar } from './storage-gc'
import type { ObjetoAlmacenado } from './storage'

const BASE = 'https://media.ejemplo.com'
const AHORA = new Date('2026-09-07T12:00:00Z')
const VIEJO = new Date(AHORA.getTime() - 3 * 60 * 60 * 1000) // 3 horas
const RECIEN = new Date(AHORA.getTime() - 5 * 60 * 1000) // 5 minutos

function obj(nombre: string, uploadedAt: Date, size = 100): ObjetoAlmacenado {
  return { key: `scheduled/${nombre}`, url: `${BASE}/scheduled/${nombre}`, size, uploadedAt }
}

describe('objetosABorrar', () => {
  it('borra lo huérfano y viejo', () => {
    const huerfano = obj('a.mp4', VIEJO)
    expect(objetosABorrar([huerfano], new Set(['scheduled/otra.mp4']), AHORA)).toEqual([huerfano])
  })

  it('no toca lo que alguna fila referencia', () => {
    const vivo = obj('a.mp4', VIEJO)
    expect(objetosABorrar([vivo], new Set([vivo.key]), AHORA)).toEqual([])
  })

  it('respeta la ventana de gracia aunque esté huérfano', () => {
    // Entre el put() y el insert() hay una ventana real: sin la gracia el barrido
    // puede matar un archivo cuya fila todavía no se escribió.
    const recien = obj('a.mp4', RECIEN)
    expect(objetosABorrar([recien], new Set(['scheduled/otra.mp4']), AHORA)).toEqual([])
  })

  it('con el conjunto de referencias vacío no borra nada', () => {
    // Cero referencias con objetos en el bucket no es un estado que esta app produzca:
    // cada archivo nace junto a la fila que lo apunta. Es mucho más probable que la
    // lectura haya fallado —o que R2_PUBLIC_BASE haya cambiado—, y vaciar el bucket
    // por eso no tiene vuelta.
    expect(objetosABorrar([obj('a.mp4', VIEJO), obj('b.mp4', VIEJO)], new Set(), AHORA)).toEqual([])
  })

  it('separa un lote mixto', () => {
    const vivo = obj('vivo.mp4', VIEJO)
    const huerfano = obj('huerfano.mp4', VIEJO)
    const nuevo = obj('nuevo.mp4', RECIEN)
    expect(objetosABorrar([vivo, huerfano, nuevo], new Set([vivo.key]), AHORA)).toEqual([huerfano])
  })

  it('la gracia por defecto es de una hora', () => {
    expect(GRACIA_MS).toBe(60 * 60 * 1000)
    const justoDentro = obj('a.mp4', new Date(AHORA.getTime() - GRACIA_MS + 1000))
    const justoFuera = obj('b.mp4', new Date(AHORA.getTime() - GRACIA_MS - 1000))
    const refs = new Set(['scheduled/otra.mp4'])
    expect(objetosABorrar([justoDentro, justoFuera], refs, AHORA)).toEqual([justoFuera])
  })
})

describe('keysReferenciadas', () => {
  it('resuelve una URL de la base actual a su key', () => {
    expect(keysReferenciadas(new Set([`${BASE}/scheduled/a.mp4`]), BASE)).toEqual(
      new Set(['scheduled/a.mp4']),
    )
  })

  it('una URL en otra base no resuelve a ninguna key', () => {
    // El escenario que rompía el barrido: si R2_PUBLIC_BASE cambia (subdominio
    // movido, r2.dev → dominio propio), las URLs guardadas quedan en el host viejo.
    // keyDesdeUrl las descarta en vez de devolver una key que nunca va a calzar.
    const urls = new Set(['https://media-vieja.ejemplo.com/scheduled/a.mp4'])
    expect(keysReferenciadas(urls, BASE)).toEqual(new Set())
  })

  it('una URL ajena (CDN de Instagram) no resuelve a ninguna key', () => {
    const urls = new Set(['https://scontent.cdninstagram.com/v/foto.jpg'])
    expect(keysReferenciadas(urls, BASE)).toEqual(new Set())
  })

  it('descarta lo que no resuelve y conserva lo que sí, en el mismo lote', () => {
    const urls = new Set([
      `${BASE}/scheduled/a.mp4`,
      'https://media-vieja.ejemplo.com/scheduled/b.mp4',
      'https://scontent.cdninstagram.com/v/foto.jpg',
    ])
    expect(keysReferenciadas(urls, BASE)).toEqual(new Set(['scheduled/a.mp4']))
  })
})

describe('objetosABorrar + keysReferenciadas: un cambio de base no vacía el bucket', () => {
  it('si R2_PUBLIC_BASE cambió, el barrido no borra nada en vez de borrar todo', () => {
    // Antes del fix esto comparaba URLs completas: el objeto seguía en el bucket,
    // la fila seguía apuntando a él, pero con URLs compuestas en bases distintas la
    // intersección quedaba vacía y la guarda de "cero referencias" no se activaba
    // —porque el conjunto de referencias sí tenía algo, solo que nada calzaba—.
    // Resultado: el barrido borraba el bucket entero. Comparando por key, una base
    // vieja resuelve a un conjunto de keys vacío y la guarda sí se activa.
    const objeto = obj('a.mp4', VIEJO)
    const urlsEnBaseVieja = new Set(['https://media-vieja.ejemplo.com/scheduled/a.mp4'])
    const referenciadas = keysReferenciadas(urlsEnBaseVieja, BASE)
    expect(objetosABorrar([objeto], referenciadas, AHORA)).toEqual([])
  })

  it('una referencia en la base actual protege su objeto y deja borrar el resto', () => {
    const protegido = obj('vivo.mp4', VIEJO)
    const huerfano = obj('huerfano.mp4', VIEJO)
    const urls = new Set([`${BASE}/scheduled/vivo.mp4`, 'https://scontent.cdninstagram.com/v/foto.jpg'])
    const referenciadas = keysReferenciadas(urls, BASE)
    expect(objetosABorrar([protegido, huerfano], referenciadas, AHORA)).toEqual([huerfano])
  })
})
