// Qué dice el chip de un destino. Puro: la fila que lo dibuja no es la que decide.

const ESTADO: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

/**
 * «Publicado» en TikTok tiene dos formas: el post en el perfil, o el borrador que
 * llegó a la bandeja del dueño para terminarlo desde el teléfono. El segundo no tiene
 * id de video —no existe hasta que el dueño lo publique— y el chip lo dice.
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
