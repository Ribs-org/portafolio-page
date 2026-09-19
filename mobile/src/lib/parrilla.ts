/**
 * Las reglas de la parrilla en el teléfono.
 *
 * Es un gemelo de `src/lib/parrilla.ts` del panel web. Está copiado y no importado
 * porque `mobile/` es un paquete aparte con su propio empaquetador: Metro no sale de
 * esta carpeta, así que no hay forma de compartir el módulo sin montar un paquete
 * común, que para cuatro colores y dos funciones cuesta más de lo que ahorra.
 *
 * Lo que sí hay contra la deriva: el test del panel (`src/lib/parrilla.test.ts`) lee
 * este archivo y compara los hexes con los suyos. Si alguien cambia un lado, falla el
 * otro.
 *
 * Ver `docs/superpowers/specs/2026-09-18-parrilla-de-verdad-design.md`.
 */

export type Coccion = 'cruda' | 'sellada' | 'punto' | 'quemada'
export type Calor = 'apagada' | 'prendida' | 'llena'

/**
 * Los dos extremos de cada cocción. Ordenados de claro a oscuro, y ese orden es la
 * información: contar la cocción por luminosidad y no por tono es lo que hace que la
 * escala se siga leyendo con daltonismo.
 */
export const COCCION: Record<Coccion, { claro: string; oscuro: string }> = {
  cruda: { claro: '#a84c46', oscuro: '#8f453f' },
  sellada: { claro: '#8c3f36', oscuro: '#73342c' },
  punto: { claro: '#6e3128', oscuro: '#4e231c' },
  quemada: { claro: '#3a2a26', oscuro: '#241a17' },
}

/** El veteado de la grasa del corte. */
export const GRASA = '#e8d7b8'

/** De claro a oscuro. */
export const ORDEN_COCCION: readonly Coccion[] = ['cruda', 'sellada', 'punto', 'quemada']

/** Cómo se llama cada cocción, para el lector de pantalla y para la leyenda. */
export const NOMBRE_COCCION: Record<Coccion, string> = {
  cruda: 'Programada',
  sellada: 'Saliendo ahora',
  punto: 'Publicada',
  quemada: 'Falló',
}

/**
 * Cuánto fuego tiene un día según cuántos cortes lleve. El tres de «llena» sale de la
 * promesa del producto, que es publicar a volumen: tiene que alcanzarse en un día de
 * trabajo normal.
 */
/** Cómo salió un corte comparado con los demás del período. */
export type Marca = 'se-paso' | 'salio-bien' | 'normal' | 'sin-datos'

/**
 * La mediana de un conjunto de números, o `null` si no hay ninguno.
 *
 * Mediana y no promedio: a un creador con un post viral el promedio se le va arriba y
 * todo lo demás le aparece frío, que es el mensaje contrario al que el producto quiere
 * dar. La mediana aguanta el outlier sin moverse.
 */
export function medianaDe(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 0 ? (orden[medio - 1]! + orden[medio]!) / 2 : orden[medio]!
}

/**
 * Cómo salió un corte, comparado con la mediana del período.
 *
 * Se compara contra vistas ganadas en el período y no contra el acumulado: el acumulado
 * premia la antigüedad y haría que los posts nuevos, que son los que hay que evaluar,
 * salgan siempre fríos.
 */
export function comoSalio(ganadas: number | null, mediana: number | null): Marca {
  if (ganadas === null || mediana === null || mediana <= 0) return 'sin-datos'
  if (ganadas >= mediana * 2) return 'se-paso'
  if (ganadas >= mediana) return 'salio-bien'
  return 'normal'
}

export function calorDelDia(cortes: number): Calor {
  if (cortes <= 0) return 'apagada'
  if (cortes < 3) return 'prendida'
  return 'llena'
}

/**
 * La cocción de un post según el estado de sus destinos: un fallo en cualquiera gana
 * sobre todo lo demás, todos publicados es «a punto», algo en curso es «sellada», el
 * resto queda cruda.
 *
 * Un post sin destinos queda crudo y no «a punto»: `every` sobre una lista vacía
 * devuelve `true`, así que sin el largo explícito se vería como publicado.
 */
export function coccionDe(estados: readonly string[]): Coccion {
  if (estados.some((estado) => estado === 'failed')) return 'quemada'
  if (estados.length > 0 && estados.every((estado) => estado === 'published')) return 'punto'
  if (estados.some((estado) => estado === 'publishing')) return 'sellada'
  return 'cruda'
}
