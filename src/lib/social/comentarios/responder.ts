import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, postComments, socialAccounts } from '@/db'
import { leerAjuste } from '@/lib/ajustes'
import { COMENTARIO_AUSENTE, PRIVADO_RECHAZADO, RED_RECHAZO, SIN_CREDENCIAL } from './comentarista'
import { comentaristaFor } from './index'
import { CLAVE_TEXTO_PRIVADO, TEXTO_PRIVADO_POR_DEFECTO } from './instrucciones'
import { mandarPrivado, privadoActivo, tocaPrivado } from './privado'
import { validarRespuesta } from './validar'

type Resultado = { ok: true } | { error: string }

/**
 * Manda la respuesta de un comentario. Relee la fila antes de nada: dos toques, o el panel
 * y el teléfono a la vez, tienen que dar un solo envío. Solo `pendiente` y `fallido` salen.
 * La lectura va atada al dueño (mismo molde que `contarPendientes` en comentarios-cola.ts):
 * un comentario de otro dueño no existe para esta llamada, ni distinto de uno borrado.
 */
export async function responderComentario(ownerId: string, id: string, texto: string): Promise<Resultado> {
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
  if (!fila) return { error: COMENTARIO_AUSENTE }
  // Ya salió, o ya se descartó, o es del propio dueño: no hay nada que mandar y no es un
  // error, es la segunda tecla de un mismo toque.
  if (fila.state !== 'pendiente' && fila.state !== 'fallido') return { ok: true }

  const comentarista = comentaristaFor(fila.network)
  if (!comentarista) return { error: RED_RECHAZO }

  const validado = validarRespuesta(texto, comentarista.limiteTexto)
  if ('error' in validado) return validado

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, fila.accountId))
    .limit(1)
  // Solo la credencial del propio comentarista: la del conector genérico puede ser de
  // solo lectura (YouTube lee con API key y comenta con OAuth) y escribiría con la que no sirve.
  const ensure = comentarista.ensureCredential
  const token = account && ensure ? await ensure(account) : null
  if (!account || !token) {
    await marcar(id, 'fallido', SIN_CREDENCIAL)
    return { error: SIN_CREDENCIAL }
  }

  let replyId: string
  try {
    replyId = await comentarista.responder(account, token, fila.externalId, validado.texto)
  } catch (error) {
    console.error(`[comentarios] responder ${fila.network}:`, String(error).slice(0, 300))
    // Un comentario que su autor borró no va a aparecer por reintentar: se descarta con su
    // frase, en vez de quedar en `fallido` invitando a un botón que nunca va a funcionar.
    if (error instanceof Error && error.message === COMENTARIO_AUSENTE) {
      await marcar(id, 'descartado', COMENTARIO_AUSENTE)
      return { error: COMENTARIO_AUSENTE }
    }
    await marcar(id, 'fallido', RED_RECHAZO)
    return { error: RED_RECHAZO }
  }

  // Se guarda lo que salió de verdad, editado o no: es lo que la cola muestra en «enviados».
  // `automatico: false` porque este envío lo mandó el dueño desde la cola, así que la
  // etiqueta «Automática» (y el filtro que la usa) no debe quedarle pegada a una fila que
  // antes había fallado como automática y ahora el dueño reenvió a mano.
  await db
    .update(postComments)
    .set({
      state: 'enviado',
      replyExternalId: replyId,
      draft: validado.texto,
      error: null,
      automatico: false,
      updatedAt: new Date(),
    })
    .where(eq(postComments.id, id))

  await privadoSiToca(fila, account, token)
  return { ok: true }
}

/** Descartar es una decisión: la fila se queda para que el sondeo no la vuelva a traer. */
export async function descartarComentario(ownerId: string, id: string): Promise<void> {
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
  if (!fila || (fila.state !== 'pendiente' && fila.state !== 'fallido')) return
  await marcar(id, 'descartado', null)
}

async function marcar(id: string, state: 'fallido' | 'descartado', error: string | null) {
  await getDb()
    .update(postComments)
    .set({ state, error, updatedAt: new Date() })
    .where(eq(postComments.id, id))
}

/**
 * La sección 7 del diseño, tras la bandera. Su fallo nunca deshace la respuesta que ya
 * salió: se anota en la fila y se sigue.
 */
async function privadoSiToca(
  fila: typeof postComments.$inferSelect,
  account: typeof socialAccounts.$inferSelect,
  token: string,
) {
  if (!tocaPrivado(fila.network, fila.publishedAt, new Date(), privadoActivo())) return
  const db = getDb()
  // Sin id externo de la cuenta no hay a qué endpoint mandar el privado: es una cuenta mal
  // guardada, no un rechazo de la red, pero la fila se marca igual para no reintentar sola.
  if (!account.externalId) {
    console.error(`[comentarios] privado ${fila.network}:`, 'la cuenta no tiene external_id')
    await db
      .update(postComments)
      .set({ dmState: 'fallido', dmError: PRIVADO_RECHAZADO, updatedAt: new Date() })
      .where(eq(postComments.id, fila.id))
    return
  }
  const texto = account.ownerId
    ? (await leerAjuste(account.ownerId, CLAVE_TEXTO_PRIVADO))?.trim() || TEXTO_PRIVADO_POR_DEFECTO
    : TEXTO_PRIVADO_POR_DEFECTO
  try {
    await mandarPrivado(account, token, fila.externalId, texto)
    await db
      .update(postComments)
      .set({ dmState: 'enviado', dmError: null, updatedAt: new Date() })
      .where(eq(postComments.id, fila.id))
  } catch (error) {
    console.error(`[comentarios] privado ${fila.network}:`, String(error).slice(0, 300))
    await db
      .update(postComments)
      .set({ dmState: 'fallido', dmError: PRIVADO_RECHAZADO, updatedAt: new Date() })
      .where(eq(postComments.id, fila.id))
  }
}
