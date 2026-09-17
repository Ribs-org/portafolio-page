import 'server-only'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, postComments, scheduledPostTargets, scheduledPosts, socialAccounts, socialPosts } from '@/db'
import { leerAjuste } from '@/lib/ajustes'
import { reglasPara } from './automatico'
import { CLAVE_INSTRUCCIONES, normalizarInstrucciones } from './instrucciones'
import { comentaristaFor } from './index'
import { hayPasarela, pedirBorrador, SIN_BORRADOR } from './modelo'
import { limpiarBorrador } from './prompt'
import { coincide, type ReglaLimpia } from './reglas'
import { MAX_BORRADORES_POR_CORRIDA, seAcaboElTiempo } from './ventana'

/** Tres fallos seguidos no son tres comentarios raros: es la pasarela, y marcarlos por ella envenenaría la cola. */
const MAX_FALLOS_SEGUIDOS = 3

export type RedaccionReport = {
  redactados: number
  fallidos: number
  /** Sin credencial de la pasarela no se redacta nada, y no es un fallo. */
  sinPasarela: boolean
}

/**
 * El caption de la publicación comentada: del sync si ya la trajo, y si no del post
 * programado que la publicó (la red aún no la devolvió). Null si ninguno la tiene.
 */
async function captionDe(accountId: string, postExternalId: string): Promise<string | null> {
  const db = getDb()
  const [post] = await db
    .select({ caption: socialPosts.caption })
    .from(socialPosts)
    .where(and(eq(socialPosts.accountId, accountId), eq(socialPosts.externalId, postExternalId)))
    .limit(1)
  if (post?.caption) return post.caption
  const [programado] = await db
    .select({ caption: scheduledPosts.caption })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPosts.id, scheduledPostTargets.postId))
    .where(and(eq(scheduledPostTargets.accountId, accountId), eq(scheduledPostTargets.externalId, postExternalId)))
    .limit(1)
  return programado?.caption ?? null
}

/**
 * Solo la parte del modelo. Lanza si falla o devuelve vacío; quien llama decide qué
 * marcar, porque la fase y el botón marcan distinto.
 */
async function redactarFila(
  fila: { text: string; author: string | null },
  caption: string | null,
  instrucciones: string,
  limite: number,
): Promise<string> {
  const crudo = await pedirBorrador({ instrucciones, caption, comentario: fila.text, autor: fila.author })
  const borrador = limpiarBorrador(crudo, limite)
  // Un borrador vacío no sirve de nada en la cola: cuenta como fallo, y el dueño
  // reintenta o escribe a mano.
  if (borrador.length === 0) throw new Error('el modelo devolvió una respuesta vacía')
  return borrador
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
  // Sin tiempo no se consulta nada: la pasada siguiente lo va a encontrar igual de pendiente.
  if (seAcaboElTiempo(inicio, Date.now())) return reporte
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

  // Un comentario que dice la palabra clave lo responde la regla en el sondeo, no el
  // modelo: si quedó pendiente fue por el cupo de la corrida o el reloj, y el sondeo
  // (`aplicarReglas`, no esta función) lo retoma en la corrida siguiente.
  const porCuenta = new Map<string, string[]>()
  for (const f of pendientes) porCuenta.set(f.accountId, [...(porCuenta.get(f.accountId) ?? []), f.postExternalId])
  const reglasPorCuenta = new Map<string, Map<string, ReglaLimpia>>()
  for (const [accountId, posts] of porCuenta) reglasPorCuenta.set(accountId, await reglasPara(accountId, [...new Set(posts)]))
  const aRedactar = pendientes.filter((f) => {
    const regla = reglasPorCuenta.get(f.accountId)?.get(f.postExternalId)
    return !regla || !coincide(f.text, regla.palabra)
  })

  const cuentas = await db
    .select({ id: socialAccounts.id, ownerId: socialAccounts.ownerId })
    .from(socialAccounts)
    .where(inArray(socialAccounts.id, [...porCuenta.keys()]))
  const ownerPorCuenta = new Map(cuentas.map((c) => [c.id, c.ownerId]))
  const instruccionesPorOwner = new Map<string, string>()
  const instruccionesDe = async (accountId: string): Promise<string> => {
    const ownerId = ownerPorCuenta.get(accountId)
    if (!ownerId) return normalizarInstrucciones(null)
    if (!instruccionesPorOwner.has(ownerId)) {
      instruccionesPorOwner.set(ownerId, normalizarInstrucciones(await leerAjuste(ownerId, CLAVE_INSTRUCCIONES)))
    }
    return instruccionesPorOwner.get(ownerId)!
  }

  // La marca no se estampa en el momento del fallo: se junta acá y se decide al final.
  const fallidos: string[] = []
  let seguidos = 0
  let abandonada = false

  for (const fila of aRedactar) {
    if (seAcaboElTiempo(inicio, Date.now())) break

    const comentarista = comentaristaFor(fila.network)
    if (!comentarista) continue

    // Todo el cuerpo va adentro: un tropiezo de la base no es un borrador fallido, así que
    // la fila queda pendiente y sin marca, y la pasada siguiente la vuelve a tomar.
    try {
      const caption = await captionDe(fila.accountId, fila.postExternalId)
      const instrucciones = await instruccionesDe(fila.accountId)

      let borrador: string
      try {
        borrador = await redactarFila(fila, caption, instrucciones, comentarista.limiteTexto)
      } catch (error) {
        // Solo el modelo llega acá: es el único fallo que puede marcar la fila y sacarla de
        // las pasadas siguientes hasta que el dueño reintente.
        console.error(`[comentarios] borrador ${fila.network}:`, String(error).slice(0, 300))
        fallidos.push(fila.id)
        seguidos += 1
        if (seguidos >= MAX_FALLOS_SEGUIDOS) {
          console.error(
            `[comentarios] redacción: se abandona la redacción en esta pasada tras ${seguidos} fallos seguidos.`,
          )
          // Nadie queda marcado: el problema es la pasarela, no estos comentarios, y la
          // pasada siguiente los vuelve a tomar igual de pendientes.
          abandonada = true
          break
        }
        continue
      }
      seguidos = 0

      await db
        .update(postComments)
        .set({ draft: borrador, draftError: null, updatedAt: new Date() })
        .where(eq(postComments.id, fila.id))
      reporte.redactados += 1
    } catch (error) {
      console.error(`[comentarios] borrador ${fila.network}:`, String(error).slice(0, 300))
    }
  }

  // Un fallo aislado entre éxitos sí es del comentario, y esa marca sí corresponde.
  if (!abandonada && fallidos.length > 0) {
    try {
      await db
        .update(postComments)
        .set({ draftError: SIN_BORRADOR, updatedAt: new Date() })
        .where(inArray(postComments.id, fallidos))
      reporte.fallidos = fallidos.length
    } catch (error) {
      // Un tropiezo de la base tampoco es un borrador fallido: sin la marca, esas filas
      // siguen pendientes y la pasada siguiente las vuelve a intentar.
      console.error('[comentarios] marca de borradores:', String(error).slice(0, 300))
    }
  }

  return reporte
}

/**
 * El botón «Reintentar borrador» de la cola. A diferencia de la fase, acá el dueño está
 * mirando: se marca de inmediato, en cualquier dirección. La lectura va atada al dueño
 * (mismo molde que `contarPendientes` en comentarios-cola.ts): un comentario de otro
 * dueño no existe para esta llamada.
 */
export async function redactarUno(ownerId: string, id: string): Promise<{ ok: true } | { error: string }> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(postComments)
    .where(
      and(
        eq(postComments.id, id),
        inArray(
          postComments.accountId,
          db.select({ id: socialAccounts.id }).from(socialAccounts).where(eq(socialAccounts.ownerId, ownerId)),
        ),
      ),
    )
    .limit(1)
  if (!fila || (fila.state !== 'pendiente' && fila.state !== 'fallido')) return { ok: true }
  const comentarista = comentaristaFor(fila.network)
  if (!comentarista) return { error: SIN_BORRADOR }
  if (!hayPasarela()) return { error: SIN_BORRADOR }
  // La fila ya viene filtrada por `ownerId`: su cuenta es de este dueño, y sus instrucciones también.
  const instrucciones = normalizarInstrucciones(await leerAjuste(ownerId, CLAVE_INSTRUCCIONES))
  const caption = await captionDe(fila.accountId, fila.postExternalId)
  try {
    const borrador = await redactarFila(fila, caption, instrucciones, comentarista.limiteTexto)
    await db
      .update(postComments)
      .set({ draft: borrador, draftError: null, updatedAt: new Date() })
      .where(eq(postComments.id, id))
    return { ok: true }
  } catch (error) {
    console.error(`[comentarios] reintento ${fila.network}:`, String(error).slice(0, 300))
    await db
      .update(postComments)
      .set({ draftError: SIN_BORRADOR, updatedAt: new Date() })
      .where(eq(postComments.id, id))
    return { error: SIN_BORRADOR }
  }
}
