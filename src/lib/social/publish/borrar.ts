import { and, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { impideBorrar } from '@/lib/schedule-api'

export type ResultadoBorrado = 'borrado' | 'no-existe' | 'publicado'

/**
 * Borra un post programado con la regla que comparten el panel y la API, para que las
 * dos no puedan divergir: borrar la fila no despublica nada en la red, así que si algún
 * destino ya está publicado o publicando se rechaza (`impideBorrar`). Se lleva el post,
 * sus destinos, su media y su regla —todo cuelga de él en cascada—; los archivos quedan
 * en R2 hasta el barrido del día siguiente, como con cualquier borrado.
 *
 * Una sola lectura, atada al dueño en el `where` (no en el `on` del join, que es lo que
 * el arnés de aislamiento vigila): trae el post y el estado de cada destino a la vez.
 * Cero filas es «no existe»; «no existe» y «no es tuyo» son la misma respuesta a
 * propósito. El `DELETE` vuelve a atarse al dueño por su cuenta.
 */
export async function borrarPostProgramado(ownerId: string, postId: string): Promise<ResultadoBorrado> {
  const db = getDb()
  const filas = await db
    .select({ postId: scheduledPosts.id, status: scheduledPostTargets.status })
    .from(scheduledPosts)
    .leftJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.ownerId, ownerId)))
  if (filas.length === 0) return 'no-existe'

  // Un post sin destinos trae una fila con `status` null (el leftJoin): no impide nada.
  const targets = filas.flatMap((f) => (f.status === null ? [] : [{ status: f.status }]))
  if (impideBorrar(targets)) return 'publicado'

  await db.delete(scheduledPosts).where(and(eq(scheduledPosts.id, postId), eq(scheduledPosts.ownerId, ownerId)))
  return 'borrado'
}
