import type { Comentarista } from './comentarista'
import { facebookComentarista } from './facebook'
import { instagramComentarista } from './instagram'
import { youtubeComentarista } from './youtube'

/** Agregar Threads o X es un archivo y una línea acá, igual que CONNECTORS y PUBLISHERS. */
export const COMENTARISTAS: Comentarista[] = [
  instagramComentarista,
  facebookComentarista,
  youtubeComentarista,
]

export function comentaristaFor(network: string): Comentarista | undefined {
  return COMENTARISTAS.find((c) => c.network === network)
}

export * from './comentarista'
