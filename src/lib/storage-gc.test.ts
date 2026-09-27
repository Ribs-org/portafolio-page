import { describe, expect, it, vi } from 'vitest'
import { getTableName } from 'drizzle-orm'
import { COLUMNAS_DE_ARCHIVO, GRACIA_MS, keysReferenciadas, objetosABorrar, urlsReferenciadas } from './storage-gc'
import type { ObjetoAlmacenado } from './storage'

const BASE = 'https://media.ejemplo.com'

// `urlsReferenciadas` es la única parte del barrido que habla con la base, y es la que
// decide qué archivo sobrevive: una consulta que lee de la tabla equivocada devuelve cero
// referencias y el barrido borra lo que no debía. No hace falta una base para probarla —
// basta un `getDb` que anote contra qué tabla se corrió cada consulta y devuelva una fila.
const { tablasConsultadas } = vi.hoisted(() => ({ tablasConsultadas: [] as unknown[] }))

vi.mock('@/db', async (original) => {
  const real = await original<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      select: () => ({
        from: (tabla: unknown) => {
          tablasConsultadas.push(tabla)
          return Promise.resolve([{ valor: `${BASE}/scheduled/${tablasConsultadas.length}.bin` }])
        },
      }),
    }),
  }
})

const AHORA = new Date('2026-09-07T12:00:00Z')
const VIEJO = new Date(AHORA.getTime() - 3 * 60 * 60 * 1000) // 3 horas
const RECIEN = new Date(AHORA.getTime() - 5 * 60 * 1000) // 5 minutos

function obj(nombre: string, uploadedAt: Date, size = 100): ObjetoAlmacenado {
  return { key: `scheduled/${nombre}`, url: `${BASE}/scheduled/${nombre}`, size, uploadedAt }
}

describe('COLUMNAS_DE_ARCHIVO', () => {
  it('la lista de columnas de archivo cubre las seis que hay', () => {
    // Una lista escrita a mano envejece: el día que alguien agregue una columna que guarde
    // una URL nuestra y olvide registrarla, sus archivos se borran solos y nadie se entera
    // hasta que un enlace da 404. Este test es lo que obliga a tocar las dos cosas juntas.
    const nombres = COLUMNAS_DE_ARCHIVO.map((c) => `${c.tabla}.${c.columna}`).sort()
    expect(nombres).toEqual(
      [
        'links.image_url',
        'profiles.avatar_url',
        'profiles.og_image_url',
        'reglas_clave.documento_url',
        'scheduled_post_media.blob_url',
        'scheduled_posts.cover_url',
      ].sort(),
    )
  })
})

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

describe('urlsReferenciadas', () => {
  it('consulta las seis tablas de la lista y recoge el valor de cada una', async () => {
    // La lista dejó de estar *al lado* de las consultas: ahora las genera, con la tabla
    // sacada de `c.ref.table`. Eso quita el riesgo de que lista y consultas se
    // desincronicen, y pone otro en su lugar: una entrada cuya `ref` no pertenezca a la
    // tabla que dice su etiqueta haría que el barrido lea donde no hay nada. Con cero
    // referencias encontradas la guarda de `objetosABorrar` salva el bucket entero, pero
    // un solo grupo mal leído no la activa: se borran los archivos de esa tabla y nadie se
    // entera hasta que un enlace da 404.
    tablasConsultadas.length = 0
    const urls = await urlsReferenciadas()
    expect(tablasConsultadas.map((t) => getTableName(t as never)).sort()).toEqual(
      COLUMNAS_DE_ARCHIVO.map((c) => c.tabla).sort(),
    )
    // Y que ninguna se pierda por el camino: seis consultas, seis URLs en el conjunto.
    expect(urls.size).toBe(COLUMNAS_DE_ARCHIVO.length)
  })
})
