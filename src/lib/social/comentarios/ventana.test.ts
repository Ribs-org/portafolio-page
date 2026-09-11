import { describe, expect, it } from 'vitest'
import {
  DIAS_VENTANA,
  MAX_POSTS_POR_PASADA,
  PASADAS_YOUTUBE,
  estadoInicial,
  postsAsondear,
  recortar,
  tocaSondear,
} from './ventana'

const now = new Date('2026-09-11T12:00:00Z')
const hace = (dias: number) => new Date(now.getTime() - dias * 864e5)

describe('postsAsondear', () => {
  it('deja pasar lo de los últimos siete días, del más nuevo al más viejo', () => {
    expect(
      postsAsondear(
        [
          { externalId: 'viejo', publishedAt: hace(3) },
          { externalId: 'nuevo', publishedAt: hace(1) },
        ],
        now,
      ),
    ).toEqual(['nuevo', 'viejo'])
  })

  it('descarta lo que quedó fuera de la ventana', () => {
    expect(
      postsAsondear(
        [
          { externalId: 'dentro', publishedAt: hace(DIAS_VENTANA - 0.1) },
          { externalId: 'fuera', publishedAt: hace(DIAS_VENTANA + 0.1) },
        ],
        now,
      ),
    ).toEqual(['dentro'])
  })

  it('corta en el tope por pasada, en la tanda que le toca a esa pasada', () => {
    // Epoch explícito y aritmética a mano, porque cuál es la tanda depende de en qué pasada
    // cae `now`, no de la hora a la que corra el test: 1_789_128_300_000 es
    // 2026-09-11T12:05:00Z, que dividido por los 300_000 ms de una pasada da la pasada
    // 5_963_761 exacta; 5_963_761 * 20 = 119_275_220, que entre las 25 publicaciones de la
    // ventana deja resto 20. O sea que la tanda arranca en la vigesimoprimera más nueva —p4—
    // y da la vuelta por la más nueva hasta completar veinte.
    expect(MAX_POSTS_POR_PASADA).toBe(20)
    const cuando = new Date(1_789_128_300_000)
    const muchos = Array.from({ length: 25 }, (_, i) => ({
      externalId: `p${i}`,
      // p0 es la más vieja; p24 la más nueva.
      publishedAt: new Date(cuando.getTime() - (25 - i) * 3600_000),
    }))

    const elegidos = postsAsondear(muchos, cuando)
    expect(elegidos).toHaveLength(20)
    expect(elegidos).toEqual([
      'p4',
      'p3',
      'p2',
      'p1',
      'p0',
      ...Array.from({ length: 15 }, (_, i) => `p${24 - i}`),
    ])
  })

  it('rota entre pasadas, para que la que no cupo hoy entre en la siguiente', () => {
    const muchos = Array.from({ length: MAX_POSTS_POR_PASADA + 5 }, (_, i) => ({
      externalId: `p${i}`,
      publishedAt: new Date(now.getTime() - (MAX_POSTS_POR_PASADA + 5 - i) * 3600_000),
    }))
    const cincoMinutos = 5 * 60_000

    const primera = postsAsondear(muchos, now)
    const segunda = postsAsondear(muchos, new Date(now.getTime() + cincoMinutos))
    expect(segunda).toHaveLength(MAX_POSTS_POR_PASADA)
    expect(new Set(segunda)).not.toEqual(new Set(primera))

    // Ninguna publicación de la ventana se queda sin mirar: basta con dejar correr unas
    // cuantas pasadas seguidas.
    const vistas = new Set<string>()
    for (let i = 0; i < muchos.length; i++) {
      for (const id of postsAsondear(muchos, new Date(now.getTime() + i * cincoMinutos))) {
        vistas.add(id)
      }
    }
    expect(vistas.size).toBe(muchos.length)
  })

  it('un post del futuro no rompe nada: entra, porque su fecha está dentro', () => {
    expect(postsAsondear([{ externalId: 'f', publishedAt: new Date(now.getTime() + 864e5) }], now)).toEqual(['f'])
  })

  it('sin publicaciones no hay nada que sondear', () => {
    expect(postsAsondear([], now)).toEqual([])
  })
})

describe('recortar', () => {
  it('deja intacto lo que cabe', () => {
    expect(recortar('hola', 10)).toBe('hola')
  })

  it('corta en el límite, sin puntos suspensivos: es un texto que se publica', () => {
    expect(recortar('hola mundo', 4)).toBe('hola')
  })

  it('recorta los espacios de los bordes antes de medir', () => {
    expect(recortar('  hola  ', 10)).toBe('hola')
  })

  it('no parte un emoji por la mitad: cuenta puntos de código', () => {
    const texto = 'hola 👋🏽 mundo'
    const resultado = recortar(texto, 6)
    expect([...resultado]).toHaveLength(6)
    expect(resultado).toBe([...texto].slice(0, 6).join(''))
  })

  it('no deja un espacio colgando cuando el corte cae justo ahí', () => {
    expect(recortar('hola mundo', 5)).toBe('hola')
  })
})

describe('tocaSondear', () => {
  // Epoch explícito, calculado a mano: 1789128000000 es 2026-09-11T12:00:00Z, y por caer
  // en una hora en punto es múltiplo exacto de media hora, o sea de seis pasadas. Nada de
  // `new Date()` acá: el resultado no puede depender de la hora a la que corra el test.
  const ARRANQUE = 1_789_128_000_000
  const PASADA_MS = 5 * 60_000
  const pasada = (n: number) => new Date(ARRANQUE + n * PASADA_MS)

  it('a instagram y a facebook les toca en todas las pasadas', () => {
    for (let i = 0; i < PASADAS_YOUTUBE * 2; i++) {
      expect(tocaSondear('instagram', pasada(i))).toBe(true)
      expect(tocaSondear('facebook', pasada(i))).toBe(true)
    }
  })

  it('a youtube le toca una de cada seis pasadas: media hora entre sondeos', () => {
    expect(tocaSondear('youtube', pasada(0))).toBe(true)
    for (let i = 1; i < PASADAS_YOUTUBE; i++) {
      expect(tocaSondear('youtube', pasada(i))).toBe(false)
    }
    expect(tocaSondear('youtube', pasada(PASADAS_YOUTUBE))).toBe(true)
  })

  it('vale en toda la pasada, no solo en su primer milisegundo', () => {
    expect(tocaSondear('youtube', new Date(ARRANQUE + PASADA_MS - 1))).toBe(true)
    expect(tocaSondear('youtube', new Date(ARRANQUE + PASADA_MS))).toBe(false)
  })
})

describe('estadoInicial', () => {
  const cuenta = '17841400000000000'

  it('un comentario del propio dueño entra como propio: nunca a la cola', () => {
    expect(estadoInicial(cuenta, cuenta)).toBe('propio')
  })

  it('un comentario de otra persona entra pendiente', () => {
    expect(estadoInicial('99999', cuenta)).toBe('pendiente')
  })

  it('sin id de autor o sin id de cuenta no hay con qué reconocer al dueño: pendiente', () => {
    expect(estadoInicial(null, cuenta)).toBe('pendiente')
    expect(estadoInicial(cuenta, null)).toBe('pendiente')
    expect(estadoInicial(null, null)).toBe('pendiente')
  })
})
