import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidato, direccionBase, esReservado } from './slugs'

describe('direccionBase', () => {
  it('toma lo que va antes de la arroba', () => {
    expect(direccionBase('juanito@gmail.com')).toBe('juanito')
  })

  it('pasa por slugify: tildes, mayúsculas y puntos', () => {
    expect(direccionBase('Juan.Pérez@empresa.cl')).toBe('juan-perez')
  })

  it('un correo sin parte usable cae en algo válido y nunca en cadena vacía', () => {
    expect(direccionBase('...@gmail.com')).toBe('pagina')
    expect(direccionBase('')).toBe('pagina')
  })

  it('el corte a 60 caracteres de slugify nunca deja un guión colgando', () => {
    // `slugify` recorta los guiones de los bordes ANTES de cortar a 60 caracteres. Si el
    // corte cae justo después de un carácter que se convirtió en guión, el resultado queda
    // con un guión al final —y no es cadena vacía, así que el `|| 'pagina'` no lo atrapa—.
    // Este correo produce exactamente esa posición: 59 letras, un punto, y más texto.
    const local = `${'a'.repeat(59)}.b`
    expect(direccionBase(`${local}@empresa.cl`).endsWith('-')).toBe(false)
  })
})

describe('esReservado', () => {
  it('protege las rutas que la app ya usa', () => {
    expect(esReservado('admin')).toBe(true)
    expect(esReservado('api')).toBe(true)
    expect(esReservado('ingresar')).toBe(true)
  })

  it('no distingue mayúsculas', () => {
    expect(esReservado('ADMIN')).toBe(true)
  })

  it('deja pasar una dirección normal', () => {
    expect(esReservado('juanito')).toBe(false)
  })
})

describe('candidato', () => {
  it('el primer intento es la base pelada', () => {
    expect(candidato('juanito', 1)).toBe('juanito')
  })

  it('a partir del segundo, numera', () => {
    expect(candidato('juanito', 2)).toBe('juanito-2')
    expect(candidato('juanito', 3)).toBe('juanito-3')
  })
})

/**
 * Esta es la que no envejece. Una lista escrita a mano se queda atrás: el día que alguien
 * agregue `/precios`, nadie se va a acordar de `RESERVADOS`, y el primer usuario con correo
 * `precios@` se encontraría con una página invisible y ningún error que se lo explique.
 * Por eso no se compara contra una lista fija: se leen del disco las rutas que existen.
 */
describe('la lista cubre las rutas reales', () => {
  const deApp = readdirSync('src/app', { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('('))
    .map((e) => e.name)

  // Solo lo que podría colisionar: `slugify` borra los puntos, así que una dirección
  // generada nunca contiene uno y un nombre con punto —los .svg, los .txt de TikTok— no
  // puede chocar con ninguna. Se filtran para que el test mida lo que importa.
  const sinPunto = (n: string) => !n.includes('.')
  const dePublic = readdirSync('public', { withFileTypes: true }).map((e) => e.name).filter(sinPunto)

  // Los grupos de rutas como `(legal)` no salen en la URL, pero sus hijos sí.
  const deGrupos = readdirSync('src/app', { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('('))
    .flatMap((g) =>
      readdirSync(`src/app/${g.name}`, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    )

  // `it.each([])` no genera ningún caso y no falla: si `readdirSync` alguna vez corriera
  // con otro directorio de trabajo y devolviera una lista vacía, este archivo quedaría en
  // verde sin haber mirado nada. Estas dos aserciones exigen que la lectura del disco haya
  // encontrado algo, para que el test falle en vez de aprobar por omisión.
  it('encontró rutas en src/app para comparar', () => {
    expect(deApp.length).toBeGreaterThan(0)
  })

  it('encontró entradas en public/ para comparar', () => {
    expect(dePublic.length).toBeGreaterThan(0)
  })

  it.each([...deApp, ...deGrupos, ...dePublic])('«%s» está reservada', (ruta) => {
    expect(esReservado(ruta)).toBe(true)
  })
})
