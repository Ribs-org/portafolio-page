import type { Fuente } from './fuente'
import { xFuente } from './x'

/** Agregar YouTube o Reddit es un archivo y una línea acá, igual que COMENTARISTAS. */
export const FUENTES: Fuente[] = [xFuente]

export function fuenteFor(network: string): Fuente | undefined {
  return FUENTES.find((f) => f.network === network)
}

export * from './fuente'
