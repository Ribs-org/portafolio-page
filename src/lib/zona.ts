import { env } from '@/lib/env'

// La zona de cada usuario. `SITE_TIMEZONE` es solo el default: la de los usuarios nuevos y
// la del sitio público, donde no hay un dueño a mano.
//
// La derivación vive acá y no en `lib/analytics.ts` (que la reexporta con el mismo nombre)
// porque ese archivo importa `server-only`: cargarlo desde este módulo puro rompería
// `zona.test.ts`, que no corre en el runtime del servidor. Mismo criterio que
// `schedule-week.ts` y `social/publish/batch.ts`, que evitan el mismo import por el mismo
// motivo.

export const SITE_TIMEZONE = env('SITE_TIMEZONE') ?? 'America/Santiago'
export const ZONA_POR_DEFECTO = SITE_TIMEZONE
export const ZONA_INVALIDA = 'Esa zona horaria no existe.'

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

/** Las zonas IANA que el runtime conoce, para el selector. */
export function zonasDisponibles(): string[] {
  return Intl.supportedValuesOf('timeZone')
}

/** «HH:MM» en esa zona, para decir «ahora son las…» al lado del selector. */
export function horaEn(zona: string, now: Date): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(now)
}
