import { getDb, links, profiles, scheduledPostMedia, scheduledPosts } from '@/db'
import { basePublica, borrar, keyDesdeUrl, listar, type ObjetoAlmacenado } from '@/lib/storage'

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
 * `referenciadas` son keys del almacén, no URLs completas —comparar por key es lo
 * que hace que un cambio en la base pública (R2_PUBLIC_BASE) no vacíe el bucket: si
 * la base con la que se compuso una URL guardada ya no coincide con la actual,
 * `keyDesdeUrl` la resuelve a null en vez de a una key que nunca va a calzar, y
 * `keysReferenciadas` la descarta antes de llegar acá.
 *
 * El conjunto vacío es el caso peligroso y se trata aparte. Un bucket con objetos y
 * cero referencias no es un estado que esta app produzca —cada archivo nace junto a
 * la fila que lo apunta—, así que es mucho más probable una lectura fallida (o, ahora,
 * un cambio de base) que un bucket legítimamente huérfano. Ante la duda no se borra:
 * postergar el barrido un día no cuesta nada, vaciar el bucket no tiene vuelta.
 */
export function objetosABorrar(
  objetos: ObjetoAlmacenado[],
  referenciadas: Set<string>,
  ahora: Date,
  graciaMs: number = GRACIA_MS,
): ObjetoAlmacenado[] {
  if (referenciadas.size === 0) return []
  const limite = ahora.getTime() - graciaMs
  return objetos.filter((o) => !referenciadas.has(o.key) && o.uploadedAt.getTime() < limite)
}

/**
 * Resuelve URLs guardadas en la base de datos a keys del almacén actual. Una URL que
 * no resuelve —de otra base, o de un host ajeno como una miniatura de Instagram—
 * devuelve null y se descarta: exactamente las URLs que no deben proteger ningún
 * objeto.
 */
export function keysReferenciadas(urls: Set<string>, base: string): Set<string> {
  const keys = new Set<string>()
  for (const url of urls) {
    const key = keyDesdeUrl(base, url)
    if (key) keys.add(key)
  }
  return keys
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
    const [objetos, urls] = await Promise.all([listar(), urlsReferenciadas()])
    // listar() ya lanzó SIN_ALMACEN si no hay base configurada, así que en la
    // práctica esto siempre es no-null acá. El `?? new Set()` es solo para que el
    // tipo cierre sin forzar un throw redundante.
    const base = basePublica()
    const referenciadas = base ? keysReferenciadas(urls, base) : new Set<string>()
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
