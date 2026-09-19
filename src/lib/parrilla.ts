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

import type { TargetStatus } from '@/db/schema'

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

/**
 * El veteado de la grasa del corte. `globals.css` lo consume como `--color-grasa` y le
 * aplica la opacidad ahí; acá vive el color pleno, que es lo que se puede comprobar.
 */
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
 *
 * Toma `TargetStatus` y no `string` a propósito: así, el día que alguien agregue un quinto
 * estado al enum, este archivo queda enlazado a ese cambio. Con `string` el estado nuevo
 * caería en `'cruda'` sin que nada se queje.
 */
export function coccionDe(estados: readonly TargetStatus[]): Coccion {
  if (estados.some((estado) => estado === 'failed')) return 'quemada'
  if (estados.length > 0 && estados.every((estado) => estado === 'published')) return 'punto'
  if (estados.some((estado) => estado === 'publishing')) return 'sellada'
  return 'cruda'
}

/** Cómo está el fierro de una cuenta: al rojo, enfriándose o frío. */
export type Fierro = 'al-rojo' | 'enfriandose' | 'frio'

/**
 * Cuántos días antes de que el token muera empieza el aviso.
 *
 * Siete porque los tokens largos de Meta duran sesenta días y el de refresco de TikTok
 * un año: una semana alcanza de sobra para reconectar sin que el aviso viva encendido
 * la mitad del tiempo y se vuelva paisaje.
 */
export const DIAS_AVISO_FIERRO = 7

/**
 * El estado de una conexión, leído como temperatura.
 *
 * Existe porque `expires_at` está en la base desde siempre y **no se mostraba en ninguna
 * parte**: el dueño se enteraba de que un token había muerto cuando le fallaba una
 * publicación, o sea tarde. La temperatura convierte una fecha que hay que calcular en
 * algo que se ve.
 *
 * Un error de sincronización deja el fierro frío aunque el token siga vigente: la
 * credencial puede estar viva y la conexión rota igual —permisos revocados desde la red,
 * por ejemplo— y para el caso da lo mismo, hay que reconectar.
 */
export function estadoDelFierro(
  cuenta: { connected: boolean; expiraEn: string | null; ultimoError: string | null },
  ahora: Date,
): Fierro {
  if (!cuenta.connected) return 'frio'
  if (cuenta.ultimoError) return 'frio'
  if (!cuenta.expiraEn) return 'al-rojo'

  const faltan = new Date(cuenta.expiraEn).getTime() - ahora.getTime()
  if (faltan <= 0) return 'frio'
  if (faltan <= DIAS_AVISO_FIERRO * 86_400_000) return 'enfriandose'
  return 'al-rojo'
}
