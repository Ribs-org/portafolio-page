// Qué dice el chip de un destino. Puro: la fila que lo dibuja no es la que decide.

import { networkLabel } from '@/lib/networks'

const ESTADO: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

/**
 * Quién es el destino: su red y su handle. Las dos cosas: el calendario y la cola ya
 * dibujan un icono de la red (`Redes`, en `redes.tsx`), pero este nombre sigue haciendo
 * falta para el `title` de cada icono, el `sr-only` y el editor, donde no hay icono. Y la
 * red sola no distingue dos cuentas de la misma red en el mismo corte, que es la lectura
 * que importa.
 *
 * Sin handle queda el nombre de la red, que ahí no es ambiguo: una cuenta sin handle es
 * una que todavía no sincronizó.
 */
export function nombreDestino(destino: { network: string; handle: string | null }): string {
  const red = networkLabel(destino.network)
  return destino.handle ? `${red} · ${destino.handle}` : red
}

/**
 * Cómo va ese destino: programado, publicando, en la bandeja de TikTok. «Publicado» en
 * TikTok tiene dos formas: el post en el perfil, o el borrador que llegó a la bandeja
 * del dueño para terminarlo desde el teléfono. El segundo no tiene id de video —no
 * existe hasta que el dueño lo publique— y el chip lo dice.
 */
export function etiquetaDestino(target: {
  network: string
  status: string
  externalId: string | null
  opciones: unknown
}): string {
  if (target.network === 'tiktok' && target.status === 'published' && esBorrador(target.opciones)) {
    return 'En tu bandeja de TikTok'
  }
  return ESTADO[target.status] ?? target.status
}

function esBorrador(opciones: unknown): boolean {
  return typeof opciones === 'object' && opciones !== null && (opciones as { modo?: unknown }).modo === 'borrador'
}

/**
 * Qué tiñe el icono de un destino. Solo dos cosas: que se quemó (rojo) o que ya salió
 * (verde). Programado y publicando quedan sin teñir a propósito —el color del corte lo
 * pone la cocción, y un icono de colores encima competiría con ella—, y siguen devolviendo
 * `'gris'` como nombre del caso aunque el icono no pinte gris: sobre la carne cruda el
 * atenuado no llega al mínimo de contraste, así que ese caso pinta con el color del texto
 * a opacidad plena (`redes.tsx` decide la clase).
 */
export function colorDeDestino(status: string): 'gris' | 'positivo' | 'negativo' {
  if (status === 'failed') return 'negativo'
  if (status === 'published') return 'positivo'
  return 'gris'
}
