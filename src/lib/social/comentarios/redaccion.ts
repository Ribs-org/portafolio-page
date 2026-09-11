import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb, postComments, socialPosts } from '@/db'
import { leerAjuste } from '@/lib/ajustes'
import { CLAVE_INSTRUCCIONES, normalizarInstrucciones } from './instrucciones'
import { comentaristaFor } from './index'
import { hayPasarela, pedirBorrador, SIN_BORRADOR } from './modelo'
import { limpiarBorrador } from './prompt'
import { MAX_BORRADORES_POR_CORRIDA, seAcaboElTiempo } from './ventana'

export type RedaccionReport = {
  redactados: number
  fallidos: number
  /** Sin credencial de la pasarela no se redacta nada, y no es un fallo. */
  sinPasarela: boolean
}

/**
 * Le pide un borrador a cada comentario pendiente que todavía no tiene ninguno, del más
 * nuevo al más viejo. Una fila que ya falló conserva su `draft_error` y no se reintenta
 * sola: reintentar es un botón de la cola, no un bucle del cron.
 */
export async function redactarPendientes(inicio: number): Promise<RedaccionReport> {
  const reporte: RedaccionReport = { redactados: 0, fallidos: 0, sinPasarela: false }
  if (!hayPasarela()) {
    reporte.sinPasarela = true
    return reporte
  }
  const db = getDb()

  const pendientes = await db
    .select({
      id: postComments.id,
      network: postComments.network,
      text: postComments.text,
      author: postComments.author,
      postExternalId: postComments.postExternalId,
      accountId: postComments.accountId,
    })
    .from(postComments)
    .where(
      and(
        eq(postComments.state, 'pendiente'),
        isNull(postComments.draft),
        isNull(postComments.draftError),
      ),
    )
    .orderBy(desc(postComments.publishedAt))
    .limit(MAX_BORRADORES_POR_CORRIDA)

  if (pendientes.length === 0) return reporte

  const instrucciones = normalizarInstrucciones(await leerAjuste(CLAVE_INSTRUCCIONES))

  for (const fila of pendientes) {
    // El mismo tope de la corrida que acota el descubrimiento: lo que no alcanzó espera la
    // pasada siguiente, que lo va a volver a encontrar igual de pendiente.
    if (seAcaboElTiempo(inicio, Date.now())) break

    const comentarista = comentaristaFor(fila.network)
    if (!comentarista) continue

    const [post] = await db
      .select({ caption: socialPosts.caption })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.accountId, fila.accountId),
          eq(socialPosts.externalId, fila.postExternalId),
        ),
      )
      .limit(1)

    try {
      const crudo = await pedirBorrador({
        instrucciones,
        caption: post?.caption ?? null,
        comentario: fila.text,
        autor: fila.author,
      })
      const borrador = limpiarBorrador(crudo, comentarista.limiteTexto)
      // Un borrador vacío no sirve de nada en la cola: cuenta como fallo, y el dueño
      // reintenta o escribe a mano.
      if (borrador.length === 0) throw new Error('el modelo devolvió una respuesta vacía')
      await db
        .update(postComments)
        .set({ draft: borrador, draftError: null, updatedAt: new Date() })
        .where(eq(postComments.id, fila.id))
      reporte.redactados += 1
    } catch (error) {
      console.error(`[comentarios] borrador ${fila.network}:`, String(error).slice(0, 300))
      await db
        .update(postComments)
        .set({ draftError: SIN_BORRADOR, updatedAt: new Date() })
        .where(eq(postComments.id, fila.id))
      reporte.fallidos += 1
    }
  }

  return reporte
}
