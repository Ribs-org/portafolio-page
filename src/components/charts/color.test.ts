import { describe, expect, it } from 'vitest'
import { contraste, distancia, simular } from './color'
import { CHART, SERIES } from './theme'

const TIPOS = ['protan', 'deutan', 'tritan'] as const

describe('matemática de color', () => {
  it('el contraste conocido de blanco sobre negro es 21', () => {
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('un color contra sí mismo no tiene distancia', () => {
    expect(distancia('#3987e5', '#3987e5')).toBeCloseTo(0, 5)
  })

  it('el naranja viejo y el cian nuevo están lejos, y era el problema a resolver', () => {
    // El acento de marca es brasa; una serie naranja se confundía con «esto es interactivo».
    expect(distancia('#d95926', '#1f9aa8')).toBeGreaterThan(40)
  })
})

describe('la paleta de series sobre la superficie del panel', () => {
  it('las ocho se leen sobre la chapa', () => {
    for (const color of SERIES) {
      expect(contraste(color, CHART.surface), `${color} sobre ${CHART.surface}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('ninguna vecina se confunde con la siguiente', () => {
    for (let i = 1; i < SERIES.length; i++) {
      const previa = SERIES[i - 1]!
      const actual = SERIES[i]!
      expect(distancia(previa, actual), `${previa} junto a ${actual}`).toBeGreaterThan(15)
    }
  })

  it('ninguna serie se confunde con la brasa de la marca', () => {
    // Si una serie se parece al acento, el lector no distingue dato de control.
    for (const color of SERIES) {
      expect(distancia(color, '#e8621f'), `${color} contra la brasa`).toBeGreaterThan(20)
    }
  })

  it('ninguna vecina se confunde con la siguiente bajo daltonismo', () => {
    // Piso histórico documentado en theme.ts: por debajo de 8.4, dos series adyacentes
    // se vuelven indistinguibles bajo alguna dicromacia, aunque en visión normal se lean bien.
    for (let i = 1; i < SERIES.length; i++) {
      const previa = SERIES[i - 1]!
      const actual = SERIES[i]!
      for (const tipo of TIPOS) {
        const distanciaSimulada = distancia(simular(previa, tipo), simular(actual, tipo))
        expect(distanciaSimulada, `${previa} junto a ${actual} bajo ${tipo}`).toBeGreaterThan(8.4)
      }
    }
  })
})
