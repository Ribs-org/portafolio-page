import { describe, expect, it } from 'vitest'
import { DIAS_VENTANA, MAX_POSTS_POR_PASADA, postsAsondear, recortar } from './ventana'

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

  it('corta en el tope por pasada, quedándose con los más nuevos', () => {
    const muchos = Array.from({ length: MAX_POSTS_POR_PASADA + 5 }, (_, i) => ({
      externalId: `p${i}`,
      // p0 es el más viejo; los últimos son los más nuevos.
      publishedAt: new Date(now.getTime() - (MAX_POSTS_POR_PASADA + 5 - i) * 3600_000),
    }))
    // `now` cae en un múltiplo de 25 minutos, donde la rotación arranca en el principio:
    // por eso la pasada es justo la de los más nuevos.
    const elegidos = postsAsondear(muchos, now)
    expect(elegidos).toHaveLength(MAX_POSTS_POR_PASADA)
    expect(elegidos[0]).toBe(`p${MAX_POSTS_POR_PASADA + 4}`)
    expect(elegidos).not.toContain('p0')
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
