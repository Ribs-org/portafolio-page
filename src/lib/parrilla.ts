/**
 * Las reglas de la parrilla: cuánto fuego tiene un día y qué tan cocido está un post.
 *
 * Están acá y no dentro de `calendar.tsx` porque son reglas, no estilos. El escalón de
 * calor lo va a querer también el resumen en la entrega siguiente, y un umbral mágico
 * escrito dentro de un `className` es exactamente el tipo de decisión que después nadie
 * encuentra.
 *
 * Ver `docs/superpowers/specs/2026-09-18-parrilla-de-verdad-design.md`.
 */

export type Coccion = 'cruda' | 'sellada' | 'punto' | 'quemada'
export type Calor = 'apagada' | 'prendida' | 'llena'

/**
 * Los dos extremos del degradado de cada cocción.
 *
 * Están ordenados de claro a oscuro y ese orden es la información: cruda es la más
 * clara y quemada la más oscura. Contar la cocción por luminosidad y no por tono es lo
 * que hace que la escala sobreviva a un daltonismo protán o deután, donde los cuatro
 * rojos se vuelven cuatro pardos pero siguen ordenados.
 *
 * `globals.css` repite estos mismos hexes como tokens porque las clases los necesitan.
 * El test de este módulo lee el CSS y comprueba que los dos lados no se separaron.
 */
export const COCCION: Record<Coccion, { claro: string; oscuro: string }> = {
  cruda: { claro: '#a84c46', oscuro: '#8f453f' },
  sellada: { claro: '#8c3f36', oscuro: '#73342c' },
  punto: { claro: '#6e3128', oscuro: '#4e231c' },
  quemada: { claro: '#3a2a26', oscuro: '#241a17' },
}

/** El veteado de la grasa y las marcas de red sobre el corte. */
export const GRASA = '#e8d7b8'

/** De claro a oscuro. El test de luminosidad recorre este orden. */
export const ORDEN_COCCION: readonly Coccion[] = ['cruda', 'sellada', 'punto', 'quemada']

/**
 * Cuánto fuego tiene un día según cuántos cortes lleve.
 *
 * El tres de «llena» sale de la promesa del producto, que es publicar a volumen: tiene
 * que alcanzarse en un día de trabajo normal y no ser un trofeo inalcanzable.
 */
export function calorDelDia(cortes: number): Calor {
  if (cortes <= 0) return 'apagada'
  if (cortes < 3) return 'prendida'
  return 'llena'
}

/**
 * La cocción de un post según el estado de sus destinos.
 *
 * Misma precedencia que tenía `calendar.tsx` antes del rediseño, solo que ahora vestida:
 * un fallo en cualquier destino gana sobre todo lo demás porque es lo que necesita el
 * ojo; todos publicados es «a punto»; algo en curso es «sellada»; el resto queda cruda.
 *
 * Un post sin destinos queda crudo y no «a punto»: `every` sobre una lista vacía devuelve
 * `true`, así que sin el largo explícito un post sin destinos se vería como publicado.
 */
export function coccionDe(estados: readonly string[]): Coccion {
  if (estados.some((estado) => estado === 'failed')) return 'quemada'
  if (estados.length > 0 && estados.every((estado) => estado === 'published')) return 'punto'
  if (estados.some((estado) => estado === 'publishing')) return 'sellada'
  return 'cruda'
}
