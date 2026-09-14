import { describe, expect, it } from 'vitest'
import { cortarCola, estaCerrado, ordenarCola } from './orden'

function item(id: string, fecha: string, ...estados: string[]) {
  return {
    id,
    post: { scheduledAt: new Date(fecha) },
    targets: estados.map((status) => ({ status })),
  }
}

describe('estaCerrado', () => {
  it('solo cuando todas las redes publicaron', () => {
    expect(estaCerrado([{ status: 'published' }, { status: 'published' }])).toBe(true)
    expect(estaCerrado([{ status: 'published' }, { status: 'scheduled' }])).toBe(false)
    expect(estaCerrado([{ status: 'publishing' }])).toBe(false)
  })

  it('un destino que falló deja el post abierto', () => {
    expect(estaCerrado([{ status: 'published' }, { status: 'failed' }])).toBe(false)
  })

  it('un post sin destinos no cuenta como cerrado', () => {
    expect(estaCerrado([])).toBe(false)
  })
})

describe('ordenarCola', () => {
  it('lo pendiente primero y ascendente, lo publicado después y descendente', () => {
    const ordenado = ordenarCola([
      item('viejo-publicado', '2026-09-01T12:00:00Z', 'published'),
      item('lejano', '2026-12-01T12:00:00Z', 'scheduled'),
      item('reciente-publicado', '2026-09-10T12:00:00Z', 'published'),
      item('proximo', '2026-09-20T12:00:00Z', 'scheduled'),
    ])
    expect(ordenado.map((i) => i.id)).toEqual([
      'proximo',
      'lejano',
      'reciente-publicado',
      'viejo-publicado',
    ])
  })

  it('un fallado viaja con lo pendiente aunque su fecha ya pasó', () => {
    const ordenado = ordenarCola([
      item('publicado', '2026-09-10T12:00:00Z', 'published'),
      item('fallado', '2026-09-02T12:00:00Z', 'published', 'failed'),
      item('futuro', '2026-09-20T12:00:00Z', 'scheduled'),
    ])
    expect(ordenado.map((i) => i.id)).toEqual(['fallado', 'futuro', 'publicado'])
  })

  it('no toca el arreglo que recibe', () => {
    const items = [
      item('b', '2026-09-20T12:00:00Z', 'scheduled'),
      item('a', '2026-09-10T12:00:00Z', 'scheduled'),
    ]
    ordenarCola(items)
    expect(items.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('cortarCola', () => {
  const veinte = Array.from({ length: 20 }, (_, i) => i)

  it('justo en el tope no esconde nada', () => {
    const { visibles, ocultos } = cortarCola(veinte, 20)
    expect(visibles).toHaveLength(20)
    expect(ocultos).toBe(0)
  })

  it('uno más que el tope esconde uno', () => {
    const { visibles, ocultos } = cortarCola([...veinte, 20], 20)
    expect(visibles).toHaveLength(20)
    expect(ocultos).toBe(1)
  })
})
