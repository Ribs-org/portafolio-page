import { describe, expect, it } from 'vitest'
import { calorDelDia, coccionDe } from './parrilla'

describe('calorDelDia', () => {
  it('sin cortes la parrilla está apagada', () => {
    expect(calorDelDia(0)).toBe('apagada')
  })

  it('uno o dos cortes la dejan prendida', () => {
    expect(calorDelDia(1)).toBe('prendida')
    expect(calorDelDia(2)).toBe('prendida')
  })

  // Los dos bordes explícitos: mover el umbral es una decisión de producto.
  it('tres cortes o más la dejan llena', () => {
    expect(calorDelDia(3)).toBe('llena')
    expect(calorDelDia(12)).toBe('llena')
  })
})

describe('coccionDe', () => {
  it('sin destinos queda cruda', () => {
    expect(coccionDe([])).toBe('cruda')
  })

  it('programada sin publicar queda cruda', () => {
    expect(coccionDe(['scheduled', 'scheduled'])).toBe('cruda')
  })

  it('algo en curso la sella', () => {
    expect(coccionDe(['scheduled', 'publishing'])).toBe('sellada')
  })

  it('todos publicados la dejan a punto', () => {
    expect(coccionDe(['published', 'published'])).toBe('punto')
  })

  it('publicados a medias no llegan a punto', () => {
    expect(coccionDe(['published', 'scheduled'])).toBe('cruda')
  })

  it('un fallo gana sobre publicado y sobre en curso', () => {
    expect(coccionDe(['published', 'failed'])).toBe('quemada')
    expect(coccionDe(['publishing', 'failed'])).toBe('quemada')
    expect(coccionDe(['failed', 'published', 'publishing'])).toBe('quemada')
  })

  /*
   * El móvil recibe el estado como `string` desde la API, no como el enum de la base.
   * Un estado que no conoce tiene que caer en «cruda» y no reventar: la app vieja sigue
   * instalada en el teléfono cuando el servidor ya desplegó algo nuevo.
   */
  it('un estado desconocido cae en cruda sin romperse', () => {
    expect(coccionDe(['inventado'])).toBe('cruda')
  })
})
