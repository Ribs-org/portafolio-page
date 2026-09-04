import type { PostProgramado } from './tipos'

/**
 * El día sale de los dígitos del ISO, que ya viene con el offset del sitio: construir
 * un Date lo traduciría a la zona del teléfono y un post de las 23:00 en Chile
 * aparecería al día siguiente para quien viaja.
 */
export function agruparPorDia(
  posts: PostProgramado[],
): { dia: string; posts: PostProgramado[] }[] {
  const mapa = new Map<string, PostProgramado[]>()
  for (const post of posts) {
    const dia = post.cuando.slice(0, 10)
    mapa.set(dia, [...(mapa.get(dia) ?? []), post])
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, lista]) => ({ dia, posts: lista }))
}
