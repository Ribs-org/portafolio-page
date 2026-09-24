import { slugify } from './utils'

/**
 * Las direcciones que la app ya ocupa.
 *
 * Hacen falta desde que la dirección de cada página se genera sola a partir del correo.
 * Alguien con correo `admin@unaempresa.cl` recibiría `admin`, y su página quedaría en
 * `/admin`, que es el panel: Next resuelve primero las rutas reales y la comodín `/[slug]`
 * pierde. Vería el panel en vez de su página, sin ningún mensaje que se lo explique.
 *
 * `slugs.test.ts` lee las rutas del disco y exige que todas estén acá, así que agregar una
 * ruta y olvidarse de esta lista rompe el test en vez de romper a un usuario.
 */
export const RESERVADOS: ReadonlySet<string> = new Set([
  // Rutas de `src/app`
  'admin',
  'api',
  'ingresar',
  'landing',
  'privacidad',
  'terminos',
  // Archivos servidos desde la raíz. Una dirección generada nunca los alcanza, porque
  // `slugify` borra los puntos; se reservan por si alguien escribe uno a mano en el panel.
  'icon.svg',
  'robots.txt',
  'sitemap.xml',
  // `public/`
  'docs',
  'file.svg',
  'globe.svg',
  'next.svg',
  'vercel.svg',
  'window.svg',
  // Del framework, nunca llegan a `/[slug]` pero se reservan igual
  '_next',
  'favicon.ico',
])

export function esReservado(slug: string): boolean {
  return RESERVADOS.has(slug.trim().toLowerCase())
}

/**
 * La dirección que le toca a un correo. `pagina` es el piso: un correo cuya parte local no
 * deja ninguna letra ni número —`...@gmail.com`— no puede terminar en cadena vacía, porque
 * la columna es única y una segunda cadena vacía haría fallar el alta sin explicar por qué.
 *
 * El `replace` final no es cosmético: `slugify` recorta los guiones de los bordes ANTES de
 * cortar a 60 caracteres, así que un guión que cae justo en esa posición 60 sobrevive al
 * corte. No es cadena vacía —el `|| 'pagina'` no lo ve— y queda una dirección con un guión
 * colgante, peor todavía si `candidato` la numera después (`algo--2`).
 */
export function direccionBase(correo: string): string {
  const local = correo.split('@')[0] ?? ''
  return slugify(local).replace(/-+$/, '') || 'pagina'
}

/** El intento 1 es la base pelada; del 2 en adelante se numera. */
export function candidato(base: string, intento: number): string {
  return intento <= 1 ? base : `${base}-${intento}`
}

/**
 * La primera dirección de la serie que quede.
 *
 * `intentar` es el efecto —en producción, insertar la fila— y devuelve si quedó. Está
 * inyectado a propósito: la única garantía real de unicidad es la restricción de la base,
 * porque dos invitaciones simultáneas pueden elegir el mismo número y solo una gana. Con
 * el efecto afuera, toda esta lógica se prueba sin base, que es lo que hace falta para que
 * corra en CI.
 */
export async function primeraDireccionLibre(
  base: string,
  intentar: (slug: string) => Promise<boolean>,
  tope = 20,
): Promise<string> {
  for (let intento = 1; intento <= tope; intento++) {
    const slug = candidato(base, intento)
    if (esReservado(slug)) continue
    if (await intentar(slug)) return slug
  }
  throw new Error(`No se pudo elegir una dirección para «${base}» en ${tope} intentos.`)
}
