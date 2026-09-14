type Agrupable = { id: string; postExternalId: string; publishedAt: Date }

export type Grupo<T extends Agrupable> = { postExternalId: string; comentarios: T[] }

/**
 * La cola se lee por publicación: es más fácil responder tres comentarios del mismo video
 * seguidos que saltar entre videos. Dentro del grupo y entre grupos, lo más nuevo primero.
 */
export function agruparPorPublicacion<T extends Agrupable>(filas: T[]): Grupo<T>[] {
  const porPost = new Map<string, T[]>()
  for (const f of filas) {
    const lista = porPost.get(f.postExternalId) ?? []
    lista.push(f)
    porPost.set(f.postExternalId, lista)
  }
  const grupos = [...porPost.entries()].map(([postExternalId, comentarios]) => ({
    postExternalId,
    comentarios: [...comentarios].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
  }))
  return grupos.sort(
    (a, b) => b.comentarios[0].publishedAt.getTime() - a.comentarios[0].publishedAt.getTime(),
  )
}
