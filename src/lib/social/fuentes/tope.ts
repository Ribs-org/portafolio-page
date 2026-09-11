export const CLAVE_TOPE = 'tinder_tope_lecturas'
export const CLAVE_CONTADOR = 'tinder_lecturas_hoy'

/**
 * Red de seguridad contra un creador que enloquece, no un límite de curación: el uso
 * esperado ronda las sesenta lecturas diarias, así que está cinco veces arriba.
 */
export const TOPE_POR_DEFECTO = 300

/** UTC y no la zona del servidor: el contador tiene que cambiar de día en un solo sitio. */
export function diaDe(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** El contador viaja como `AAAA-MM-DD:N`; un día distinto al de hoy vale cero. */
export function leidasHoy(valor: string | null, hoy: string): number {
  if (!valor) return 0
  const [dia, n] = valor.split(':')
  if (dia !== hoy) return 0
  const leidas = Number(n)
  return Number.isInteger(leidas) && leidas >= 0 ? leidas : 0
}

export function serializarContador(hoy: string, leidas: number): string {
  return `${hoy}:${leidas}`
}

export function normalizarTope(bruto: string | null): number {
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : TOPE_POR_DEFECTO
}

/**
 * Los ids de X son enteros que crecen y cambian de largo, así que compararlos como texto
 * daría que '9' es mayor que '10'. BigInt porque no caben en un number.
 */
export function idMayor(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return BigInt(a) >= BigInt(b) ? a : b
}
