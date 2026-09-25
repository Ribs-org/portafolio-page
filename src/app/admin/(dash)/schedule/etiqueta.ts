// Qué dice el chip de un destino. Puro: la fila que lo dibuja no es la que decide.

import { networkLabel } from '@/lib/networks'

const ESTADO: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

/**
 * Quién es el destino: su red y su handle. Las dos cosas, porque ni el calendario ni la
 * cola dibujan un icono de la red —se dio por supuesto que sí, y no lo hay—, así que el
 * handle solo obligaba a adivinar de qué red era cada destino. Y la red sola no distingue
 * dos cuentas de la misma red en el mismo corte, que es la lectura que importa.
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
