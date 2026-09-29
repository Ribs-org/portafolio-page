// La URL de la parrilla, armada aparte de la página: es una regla pura —qué parámetro
// sobrevive a un clic y cuál no— y acá se la puede pinchar con un test, como a `orden.ts`.

/** Los parámetros de un solo uso: valen para el render que los trajo y no viajan al siguiente. */
const UN_SOLO_USO = new Set([
  // El desenlace de una vuelta de OAuth.
  'mensaje',
  // La orden de abrir el compositor con que llega «Poner al fuego» desde El Fuego.
  'componer',
])

/**
 * Rebuilds the page URL flipping one key, carrying the rest — the content page's
 * `contentHref` mold. One-shot keys (`UN_SOLO_USO`) never carry over.
 */
export function scheduleHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key in changes || UN_SOLO_USO.has(key)) continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/admin/schedule?${query}` : '/admin/schedule'
}
