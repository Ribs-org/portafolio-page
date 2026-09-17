import { getDb, reglasClave, scheduledPostMedia, scheduledPosts, scheduledPostTargets } from '@/db'
import { exigirCuentas } from '../cuentas'
import type { ReglaLimpia } from '../comentarios/reglas'
import type { OpcionesDestino } from './opciones'

export type MediaSubida = { url: string; mediaType: 'image' | 'video' }

/**
 * Las tres inserciones de un post programado, en el orden que el resto del sistema
 * espera: el post, su media en posición de carrusel, y un target por red con lo que esa
 * red exigió elegir. Compartido por el compositor web y la ruta móvil para que ambos
 * escriban exactamente lo mismo. La media ya vive en el almacén: subirla es problema de
 * quien llama. Las opciones llegan ya validadas por `validarOpcionesPorRed`.
 *
 * Lanza `SinCuenta` si una red no tiene cuenta conectada; el llamador la traduce a su
 * frase.
 */
export async function crearPostProgramado(
  ownerId: string,
  input: {
    caption: string
    scheduledAt: Date
    media: MediaSubida[]
    networks: string[]
    opciones?: Record<string, OpcionesDestino>
    regla?: ReglaLimpia | null
  },
): Promise<string> {
  const db = getDb()
  // Antes de escribir nada: un post sin cuenta a la que salir no debe quedar a medias.
  const cuentas = await exigirCuentas(ownerId, input.networks)
  const [post] = await db
    .insert(scheduledPosts)
    .values({ ownerId, caption: input.caption, scheduledAt: input.scheduledAt })
    .returning()
  if (input.media.length > 0) {
    await db.insert(scheduledPostMedia).values(
      input.media.map((m, position) => ({
        postId: post!.id,
        blobUrl: m.url,
        mediaType: m.mediaType,
        position,
      })),
    )
  }
  await db.insert(scheduledPostTargets).values(
    input.networks.map((network) => ({
      postId: post!.id,
      network,
      accountId: cuentas.get(network)!,
      opciones: input.opciones?.[network] ?? null,
    })),
  )
  if (input.regla) {
    await db.insert(reglasClave).values({ postId: post!.id, ...input.regla })
  }
  return post!.id
}
