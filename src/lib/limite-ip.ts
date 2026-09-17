import 'server-only'
import { headers } from 'next/headers'

/**
 * Mejor esfuerzo, igual que el que tenía el login anterior: las instancias son efímeras y
 * hay varias, así que esto frena un intento a mano, no una botnet. La defensa real es que
 * el código viva diez minutos y se agote a los cinco intentos.
 */
const intentos = new Map<string, { cuenta: number; hasta: number }>()

export async function demasiadosIntentos(balde: string, tope: number, ventanaMs: number): Promise<boolean> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida'
  const clave = `${balde}:${ip}`
  const ahora = Date.now()
  const entrada = intentos.get(clave)
  if (!entrada || ahora > entrada.hasta) {
    intentos.set(clave, { cuenta: 1, hasta: ahora + ventanaMs })
    return false
  }
  entrada.cuenta += 1
  return entrada.cuenta > tope
}
