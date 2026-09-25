import { getDb, reglasClave, scheduledPostMedia, scheduledPosts, scheduledPostTargets } from '@/db'
import type { CuentaDestino } from '../cuentas'
import type { ReglaLimpia } from '../comentarios/reglas'
import type { OpcionesDestino } from './opciones'

export type MediaSubida = { url: string; mediaType: 'image' | 'video' }

/**
 * Las tres inserciones de un post programado, en el orden que el resto del sistema
 * espera: el post, su media en posición de carrusel, y un target por cuenta elegida con
 * lo que esa cuenta exigió elegir. Compartido por el compositor web y la ruta móvil para
 * que ambos escriban exactamente lo mismo. La media ya vive en el almacén: subirla es
 * problema de quien llama. Las opciones llegan ya validadas por `validarOpcionesPorCuenta`.
 *
 * Las cuentas ya vienen verificadas por quien llama: esta función no habla con el
 * navegador y no tiene con qué comprobar pertenencia. Ver `verificarCuentas`.
 */
export async function crearPostProgramado(
  ownerId: string,
  input: {
    caption: string
    scheduledAt: Date
    media: MediaSubida[]
    cuentas: CuentaDestino[]
    opciones?: Record<string, OpcionesDestino>
    regla?: ReglaLimpia | null
  },
): Promise<string> {
  const db = getDb()
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
    input.cuentas.map((cuenta) => ({
      postId: post!.id,
      network: cuenta.network,
      accountId: cuenta.id,
      opciones: input.opciones?.[cuenta.id] ?? null,
    })),
  )
  if (input.regla) {
    await db.insert(reglasClave).values({ postId: post!.id, ...input.regla })
  }
  return post!.id
}
