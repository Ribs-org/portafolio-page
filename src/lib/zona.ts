import { env } from '@/lib/env'

// La zona de cada usuario. `SITE_TIMEZONE` es solo el default: la de los usuarios nuevos y
// la del sitio público, donde no hay un dueño a mano.
//
// Quien inserta en `users` pasa `ZONA_POR_DEFECTO` a mano (`asegurarAdmin`, `invitar`, el
// seed y el migrador que adopta huérfanas): es la variable la que manda al crear a alguien.
// El literal `'America/Santiago'` que la columna trae de default es solo la red de
// seguridad para una fila escrita sin pasar por acá — un `insert` a mano, una migración.
//
// La columna es `text` pelado, sin CHECK: la única escritura que no pasa por
// `guardarCuenta` —que valida con `esZonaValida`— es ese insert, y lo que inserta ya viene
// validado de la derivación de abajo. Una zona que `Intl` no conozca en la columna haría
// reventar con `RangeError` cada render del panel de ese usuario, así que las dos puertas
// se cierran en el código y no en el esquema (un CHECK costaría otra migración y fijaría
// la lista de zonas del Postgres del día en que se escribió).
//
// La derivación vive acá y no en `lib/analytics.ts` (que la reexporta con el mismo nombre)
// porque ese archivo importa `server-only`: cargarlo desde este módulo puro rompería
// `zona.test.ts`, que no corre en el runtime del servidor. Mismo criterio que
// `schedule-week.ts`, que evita el mismo import por el mismo motivo.

const ZONA_DE_RESPALDO = 'America/Santiago'

/** Válida si `Intl` la conoce: es la misma lista que usa el resto de la app para formatear. */
export function esZonaValida(zona: string): boolean {
  if (zona.trim() === '' || zona !== zona.trim()) return false
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona })
    return true
  } catch {
    return false
  }
}

/**
 * La zona del despliegue, validada una vez al cargar el módulo. Una errata en el `.env`
 * («Europa/Madrid») entraría a `users.zona` y haría reventar con `RangeError` cada render
 * que formatee una hora: se avisa y se sigue con el respaldo, porque un despliegue mudo
 * por una letra es peor que uno en la zona equivocada.
 */
function zonaDelSitio(): string {
  const declarada = env('SITE_TIMEZONE')
  if (declarada === undefined) return ZONA_DE_RESPALDO
  if (esZonaValida(declarada)) return declarada
  console.warn(`[zona] SITE_TIMEZONE="${declarada}" no es una zona IANA conocida; se usa ${ZONA_DE_RESPALDO}.`)
  return ZONA_DE_RESPALDO
}

export const SITE_TIMEZONE = zonaDelSitio()
export const ZONA_POR_DEFECTO = SITE_TIMEZONE
export const ZONA_INVALIDA = 'Esa zona horaria no existe.'

/** Las zonas IANA que el runtime conoce, para el selector. */
export function zonasDisponibles(): string[] {
  return Intl.supportedValuesOf('timeZone')
}

/** «HH:MM» en esa zona, para decir «ahora son las…» al lado del selector. */
export function horaEn(zona: string, now: Date): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(now)
}
