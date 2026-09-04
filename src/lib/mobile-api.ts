import { mobileTokenIsValid } from './mobile-token'

/** Los tres rangos que ofrece la app; el resto del panel no viaja al teléfono. */
export const RANGOS = ['hoy', '7d', '30d'] as const
export type Rango = (typeof RANGOS)[number]

const DIAS: Record<Rango, number> = { hoy: 1, '7d': 7, '30d': 30 }

/**
 * Un rango ilegible cae en 7d en vez de fallar: en un teléfono, una pantalla vacía
 * por un parámetro mal escrito es peor que una ventana distinta a la pedida.
 */
export function parseRango(value: string | null, now: Date): { from: Date; to: Date } {
  const rango = (RANGOS as readonly string[]).includes(value ?? '') ? (value as Rango) : '7d'
  return { from: new Date(now.getTime() - DIAS[rango] * 864e5), to: now }
}

/** El molde del resto del repo: sin cabecera válida, nadie pasa. */
export async function requireMobile(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  return mobileTokenIsValid(header.slice('Bearer '.length))
}
