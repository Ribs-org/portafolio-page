// Orden de la cola de programados. Puro y sin dependencias del cliente ni de la base:
// el `<li>` que decide no puede ser el que además ordena.

type ItemCola = {
  post: { scheduledAt: Date }
  targets: Array<{ status: string }>
}

/**
 * Un post está cerrado cuando ya no hay nada que hacer con él: todas sus redes
 * publicaron. Un destino que falló deja el post abierto a propósito — es justo el
 * que pide reprogramarse, y mandarlo al fondo con lo publicado lo esconde.
 */
export function estaCerrado(targets: Array<{ status: string }>): boolean {
  return targets.length > 0 && targets.every((target) => target.status === 'published')
}

/**
 * Primero lo que todavía espera turno, de lo más próximo a lo más lejano; después lo
 * ya publicado, de lo más reciente a lo más viejo. Las dos mitades leen distinto: en
 * lo pendiente uno busca qué viene, y en lo cerrado, qué acaba de salir.
 */
export function ordenarCola<T extends ItemCola>(items: T[]): T[] {
  const abiertos: T[] = []
  const cerrados: T[] = []
  for (const item of items) {
    ;(estaCerrado(item.targets) ? cerrados : abiertos).push(item)
  }
  abiertos.sort((a, b) => a.post.scheduledAt.getTime() - b.post.scheduledAt.getTime())
  cerrados.sort((a, b) => b.post.scheduledAt.getTime() - a.post.scheduledAt.getTime())
  return [...abiertos, ...cerrados]
}
