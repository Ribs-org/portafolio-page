import { getDb, links, profiles, scheduledPostMedia, scheduledPosts } from '@/db'
import { borrar, listar, type ObjetoAlmacenado } from '@/lib/storage'

/**
 * Entre el `guardar()` y el `insert()` de la fila hay una ventana real. Una hora es
 * holgadísima para la más lenta de esas escrituras y sigue siendo corta frente a la
 * cadencia diaria del barrido.
 */
export const GRACIA_MS = 60 * 60 * 1000

export type Barrido = { borrados: number; bytes: number; error?: string }

/**
 * La regla: se va lo que ninguna fila referencia y lleva más de `graciaMs` subido.
 *
 * El conjunto vacío es el caso peligroso y se trata aparte. Un bucket con objetos y
 * cero referencias no es un estado que esta app produzca —cada archivo nace junto a
 * la fila que lo apunta—, así que es mucho más probable una lectura fallida que un
 * bucket legítimamente huérfano. Ante la duda no se borra: postergar el barrido un
 * día no cuesta nada, vaciar el bucket no tiene vuelta.
 */
export function objetosABorrar(
  objetos: ObjetoAlmacenado[],
  referenciadas: Set<string>,
  ahora: Date,
  graciaMs: number = GRACIA_MS,
): ObjetoAlmacenado[] {
  if (referenciadas.size === 0) return []
  const limite = ahora.getTime() - graciaMs
  return objetos.filter((o) => !referenciadas.has(o.url) && o.uploadedAt.getTime() < limite)
}

/**
 * Las cinco columnas que pueden guardar una URL nuestra. `social_posts.thumbnail_url`
 * no está a propósito: esa URL es de la red social, no del almacén.
 */
async function urlsReferenciadas(): Promise<Set<string>> {
  const db = getDb()
  const [perfiles, enlaces, posts, media] = await Promise.all([
    db.select({ avatar: profiles.avatarUrl, og: profiles.ogImageUrl }).from(profiles),
    db.select({ imagen: links.imageUrl }).from(links),
    db.select({ portada: scheduledPosts.coverUrl }).from(scheduledPosts),
    db.select({ blob: scheduledPostMedia.blobUrl }).from(scheduledPostMedia),
  ])

  const urls = new Set<string>()
  for (const p of perfiles) {
    if (p.avatar) urls.add(p.avatar)
    if (p.og) urls.add(p.og)
  }
  for (const e of enlaces) if (e.imagen) urls.add(e.imagen)
  for (const p of posts) if (p.portada) urls.add(p.portada)
  for (const m of media) urls.add(m.blob)
  return urls
}

/**
 * Un barrido. Cierra la fuga como regla en vez de como parche: cualquier camino que
 * borre una fila y olvide el archivo queda cubierto al día siguiente.
 *
 * Nunca lanza. Un barrido que falla no puede ensuciar una publicación que funcionó,
 * que es el trabajo real del cron que lo llama.
 */
export async function barrerHuerfanos(ahora: Date = new Date()): Promise<Barrido> {
  try {
    const [objetos, referenciadas] = await Promise.all([listar(), urlsReferenciadas()])
    let borrados = 0
    let bytes = 0
    for (const objeto of objetosABorrar(objetos, referenciadas, ahora)) {
      await borrar(objeto.url)
      borrados += 1
      bytes += objeto.size
    }
    return { borrados, bytes }
  } catch (error) {
    console.error('El barrido de huérfanos falló:', String(error).slice(0, 300))
    return { borrados: 0, bytes: 0, error: 'El barrido falló.' }
  }
}
