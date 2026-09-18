import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contraste, simular } from '../components/charts/color'
import { COCCION, GRASA, ORDEN_COCCION, calorDelDia, coccionDe } from './parrilla'

describe('calorDelDia', () => {
  it('sin cortes la parrilla está apagada', () => {
    expect(calorDelDia(0)).toBe('apagada')
  })

  it('uno o dos cortes la dejan prendida', () => {
    expect(calorDelDia(1)).toBe('prendida')
    expect(calorDelDia(2)).toBe('prendida')
  })

  // El umbral sale de la promesa del producto: publicar a volumen. Tres es un día de
  // trabajo normal, no un trofeo. Los dos bordes van explícitos porque mover este
  // número es una decisión de producto, no un ajuste.
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

  // Un fallo gana sobre todo lo demás porque es lo que necesita el ojo. Es la misma
  // precedencia que tenía calendar.tsx antes del rediseño.
  it('un fallo gana sobre publicado y sobre en curso', () => {
    expect(coccionDe(['published', 'failed'])).toBe('quemada')
    expect(coccionDe(['publishing', 'failed'])).toBe('quemada')
    expect(coccionDe(['failed', 'published', 'publishing'])).toBe('quemada')
  })
})

// El texto del corte, que es el `--color-fg` de `.acerado`.
const TEXTO = '#f2ebe2'

describe('los colores de la carne', () => {
  // Se mide contra el extremo claro de cada degradado porque es el peor caso: si el
  // texto se lee ahí, se lee en todo el corte.
  it('el texto pasa AA sobre las cuatro cocciones', () => {
    for (const nombre of ORDEN_COCCION) {
      const ratio = contraste(TEXTO, COCCION[nombre].claro)
      expect(ratio, `${nombre} da ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('las cocciones van estrictamente de clara a oscura', () => {
    // `contraste` contra negro es una lectura directa de la luminosidad relativa.
    const luces = ORDEN_COCCION.map((n) => contraste(COCCION[n].claro, '#000000'))
    for (let i = 1; i < luces.length; i++) {
      expect(luces[i], `${ORDEN_COCCION[i]} no es más oscura que la anterior`).toBeLessThan(
        luces[i - 1],
      )
    }
  })

  it('cada cocción se distingue de su vecina', () => {
    for (let i = 1; i < ORDEN_COCCION.length; i++) {
      const ratio = contraste(COCCION[ORDEN_COCCION[i - 1]].claro, COCCION[ORDEN_COCCION[i]].claro)
      expect(ratio, `${ORDEN_COCCION[i - 1]} vs ${ORDEN_COCCION[i]}`).toBeGreaterThanOrEqual(1.25)
    }
  })

  it('la cruda y la quemada se separan de lejos', () => {
    expect(contraste(COCCION.cruda.claro, COCCION.quemada.claro)).toBeGreaterThanOrEqual(2)
  })

  /*
   * El umbral bajo daltonismo es más bajo que el de visión normal a propósito: la
   * simulación comprime los rojos hacia el pardo y achica todas las distancias. Lo que
   * tiene que sobrevivir es el orden de la escalera, no su tamaño — por eso el test
   * exige orden estricto y solo un piso mínimo de separación.
   */
  it.each(['protan', 'deutan'] as const)('la escalera sobrevive a %s', (tipo) => {
    const luces = ORDEN_COCCION.map((n) => contraste(simular(COCCION[n].claro, tipo), '#000000'))
    for (let i = 1; i < luces.length; i++) {
      expect(luces[i], `${ORDEN_COCCION[i]} bajo ${tipo}`).toBeLessThan(luces[i - 1])
      const vecinas = contraste(
        simular(COCCION[ORDEN_COCCION[i - 1]].claro, tipo),
        simular(COCCION[ORDEN_COCCION[i]].claro, tipo),
      )
      expect(
        vecinas,
        `${ORDEN_COCCION[i - 1]} vs ${ORDEN_COCCION[i]} bajo ${tipo}`,
      ).toBeGreaterThanOrEqual(1.15)
    }
  })

  it('el veteado se lee sobre la cocción más clara', () => {
    expect(contraste(GRASA, COCCION.cruda.claro)).toBeGreaterThanOrEqual(3)
  })
})

/*
 * El guardia contra la deriva. `globals.css` repite estos hexes como tokens de Tailwind
 * porque las clases los necesitan, y dos copias de un valor se separan solas tarde o
 * temprano. Este test lee el CSS y compara.
 */
describe('los tokens del CSS no se separaron de TypeScript', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

  it.each(ORDEN_COCCION)('%s coincide en los dos lados', (nombre) => {
    expect(css).toContain(`--color-carne-${nombre}: ${COCCION[nombre].claro};`)
    expect(css).toContain(`--color-carne-${nombre}-honda: ${COCCION[nombre].oscuro};`)
  })

  it('la grasa coincide en los dos lados', () => {
    expect(css).toContain(`--color-grasa: ${GRASA};`)
  })
})
