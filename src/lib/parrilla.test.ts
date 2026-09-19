import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contraste, simular } from '../components/charts/color'
import {
  COCCION,
  GRASA,
  ORDEN_COCCION,
  calorDelDia,
  coccionDe,
  estadoDelFierro,
} from './parrilla'

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

describe('estadoDelFierro', () => {
  const AHORA = new Date('2026-09-18T12:00:00Z')
  const en = (dias: number) =>
    new Date(AHORA.getTime() + dias * 86_400_000).toISOString()
  const sano = { connected: true, expiraEn: null, ultimoError: null }

  it('sin credencial el fierro está frío', () => {
    expect(estadoDelFierro({ ...sano, connected: false }, AHORA)).toBe('frio')
  })

  it('una cuenta conectada y sin caducidad está al rojo', () => {
    expect(estadoDelFierro(sano, AHORA)).toBe('al-rojo')
  })

  it('un token con meses por delante está al rojo', () => {
    expect(estadoDelFierro({ ...sano, expiraEn: en(60) }, AHORA)).toBe('al-rojo')
  })

  it('un token que vence dentro de la semana se está enfriando', () => {
    expect(estadoDelFierro({ ...sano, expiraEn: en(3) }, AHORA)).toBe('enfriandose')
  })

  // Los dos bordes explícitos: mover el aviso es una decisión, no un ajuste.
  it('el aviso empieza justo en el día siete', () => {
    expect(estadoDelFierro({ ...sano, expiraEn: en(7) }, AHORA)).toBe('enfriandose')
    expect(estadoDelFierro({ ...sano, expiraEn: en(7.01) }, AHORA)).toBe('al-rojo')
  })

  it('un token vencido deja el fierro frío', () => {
    expect(estadoDelFierro({ ...sano, expiraEn: en(-1) }, AHORA)).toBe('frio')
  })

  /*
   * La credencial puede seguir vigente y la conexión estar rota igual —permisos
   * revocados desde la red, por ejemplo—. Para el caso da lo mismo: hay que reconectar.
   */
  it('un error de sincronización enfría el fierro aunque el token siga vivo', () => {
    expect(
      estadoDelFierro({ connected: true, expiraEn: en(60), ultimoError: 'OAuthException' }, AHORA),
    ).toBe('frio')
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

  /*
   * El veteado se dibuja a 0.18–0.30 de alpha y se desvanece a transparente, así que
   * esto NO mide el contraste que se ve en pantalla —eso no se puede medir sin pintar—.
   * Lo que guarda es la propiedad que hace que la grasa se lea como grasa: que sea más
   * clara que la carne. Si alguien oscurece `GRASA` por debajo de la cocción más clara,
   * el veteado se invierte y pasa a leerse como una sombra; este test lo atrapa.
   */
  it('la grasa es más clara que las cuatro cocciones', () => {
    const luzGrasa = contraste(GRASA, '#000000')
    for (const nombre of ORDEN_COCCION) {
      expect(luzGrasa, `la grasa no supera a ${nombre}`).toBeGreaterThan(
        contraste(COCCION[nombre].claro, '#000000'),
      )
    }
  })
})

/*
 * Los textos que van encima del corte. Van aparte de la tanda anterior porque el peor
 * caso de cada uno es distinto: el texto pleno se mide contra las cuatro cocciones, y la
 * etiqueta «saliendo» solo contra la sellada, que es la única donde aparece.
 *
 * Existen porque la primera versión los tenía mal y ningún test lo vio: la hora iba a
 * `text-fg/70`, que sobre la cruda cae a 3.12:1, y «saliendo» iba en brasa sobre la
 * sellada, que da 2.15:1. El test de arriba no los cubría porque mide el color del
 * caption, no el de ellos.
 */
describe('los textos del corte', () => {
  it('la hora va a opacidad plena, que es lo único que pasa AA sobre la cruda', () => {
    // Al 70% sobre la cruda son 3.12:1. Se deja anotado el número para que quede claro
    // que bajar la opacidad de la hora no es un ajuste estético.
    const alSetenta = mezclar(TEXTO, COCCION.cruda.claro, 0.7)
    expect(contraste(alSetenta, COCCION.cruda.claro)).toBeLessThan(4.5)
    expect(contraste(TEXTO, COCCION.cruda.claro)).toBeGreaterThanOrEqual(4.5)
  })

  it('«saliendo» se lee sobre la carne sellada', () => {
    expect(contraste(TEXTO, COCCION.sellada.claro)).toBeGreaterThanOrEqual(4.5)
  })

  it('la brasa no sirve para texto sobre la carne sellada', () => {
    // El motivo de que «saliendo» vaya en `text-fg` y no en brasa.
    expect(contraste('#e8621f', COCCION.sellada.claro)).toBeLessThan(4.5)
  })
})

/** Compone `frente` sobre `fondo` con una opacidad, como lo haría el navegador. */
function mezclar(frente: string, fondo: string, alfa: number): string {
  const canales = (hex: string) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
  const [rf, gf, bf] = canales(frente)
  const [rb, gb, bb] = canales(fondo)
  const mezcla = (f: number, b: number) => Math.round(f * alfa + b * (1 - alfa))
  return `#${[mezcla(rf, rb), mezcla(gf, gb), mezcla(bf, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/*
 * El guardia contra la deriva. `globals.css` repite estos hexes como tokens de Tailwind
 * porque las clases los necesitan, y dos copias de un valor se separan solas tarde o
 * temprano. Este test lee el CSS y compara.
 */
describe('los tokens del CSS no se separaron de TypeScript', () => {
  const crudo = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  /*
   * Sin quitar los comentarios, `toContain` encuentra la declaración aunque esté
   * comentada. El caso no es teórico: basta que alguien comente el bloque de tokens
   * para probar algo y lo commitee. El test seguiría verde, Tailwind no emitiría las
   * variables, y los `var(--color-carne-*)` de los degradados quedarían inválidos —
   * o sea los cortes sin fondo, transparentes sobre el fuego.
   */
  const css = crudo.replace(/\/\*[\s\S]*?\*\//g, '')

  it.each(ORDEN_COCCION)('%s coincide en los dos lados', (nombre) => {
    expect(css).toContain(`--color-carne-${nombre}: ${COCCION[nombre].claro};`)
    expect(css).toContain(`--color-carne-${nombre}-honda: ${COCCION[nombre].oscuro};`)
  })

  it('la grasa coincide en los dos lados', () => {
    expect(css).toContain(`--color-grasa: ${GRASA};`)
  })

  /*
   * Un token que nadie consume es un token muerto, y el guardia de arriba lo protegería
   * igual: quedarían tres copias del color y cambiar dos no movería nada en pantalla.
   */
  it.each([...ORDEN_COCCION.map((n) => `carne-${n}`), 'grasa'])(
    'alguna regla consume --color-%s',
    (token) => {
      expect(css).toMatch(new RegExp(`var\\(--color-${token}[,)]`))
    },
  )

  /*
   * `TEXTO` es el `--color-fg` que `.acerado` le pone al panel. Es una copia igual que
   * los hexes de carne, así que lleva el mismo guardia: sin esto, alguien retoca
   * `.acerado` y los tests de AA siguen verdes midiendo un color que ya nadie usa.
   */
  it('el color del texto coincide con el que .acerado le da al panel', () => {
    expect(css).toMatch(new RegExp(`\\.acerado\\s*\\{[^}]*--color-fg:\\s*${TEXTO};`))
  })
})

/*
 * La app del teléfono repite estas reglas en `mobile/src/lib/parrilla.ts`. Están
 * copiadas y no importadas porque `mobile/` es un paquete aparte con su propio
 * empaquetador: Metro no sale de esa carpeta. Montar un paquete común para cuatro
 * colores y dos funciones cuesta más de lo que ahorra, pero una copia sin guardia se
 * separa sola — y separada significa que la misma publicación se ve cruda en el panel y
 * quemada en el teléfono.
 */
describe('el teléfono no se separó del panel', () => {
  const movil = readFileSync(new URL('../../mobile/src/lib/parrilla.ts', import.meta.url), 'utf8')
  const sinComentarios = movil.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it.each(ORDEN_COCCION)('%s tiene los mismos dos extremos en el teléfono', (nombre) => {
    expect(sinComentarios).toContain(
      `${nombre}: { claro: '${COCCION[nombre].claro}', oscuro: '${COCCION[nombre].oscuro}' }`,
    )
  })

  it('la grasa es la misma en el teléfono', () => {
    expect(sinComentarios).toContain(`export const GRASA = '${GRASA}'`)
  })

  /*
   * El umbral de «parrilla llena» también: si el panel dice que un día está lleno con
   * tres y el teléfono con cinco, el mismo día se ve distinto en cada pantalla y no hay
   * forma de saber cuál miente.
   */
  it('el umbral de parrilla llena es el mismo en el teléfono', () => {
    expect(sinComentarios).toContain('if (cortes < 3) return \'prendida\'')
  })
})
