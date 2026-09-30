import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { getDb, scheduledPostTargets, socialAccounts, solicitudesBorrado } from '@/db'

// Las dos cosas que Meta puede pedirnos por un usuario que quitó la app: la baja
// (deauthorize) y el borrado (data deletion request).
//
// Buscan por `meta_user_id` y no por dueño **a propósito**: Meta no sabe quién es nuestro
// dueño, y la petición no llega con una sesión sino firmada con el app secret. Es la única
// excepción al arnés de aislamiento de `src/lib` (ver `docs/deuda-tecnica.md`, entrada «El
// arnés de aislamiento solo llega a `src/lib`»), y por eso nada de acá se llama desde una
// acción con sesión sin haber pasado antes por `leerSignedRequest`.

export const BAJA_DESDE_FACEBOOK = 'Quitaste la app desde Facebook: vuelve a conectar.'

/** Las dos redes que salen de la misma app de Meta; nada más se toca por un callback suyo. */
const REDES_META = ['instagram', 'facebook'] as const

/**
 * Deja sin credencial las cuentas de Meta de ese usuario; devuelve cuántas.
 *
 * Es lo mismo que «Desconectar» en el panel, con el motivo escrito en `last_sync_error`
 * para que la tarjeta diga por qué. El historial se queda: quitar la app no es pedir que
 * se borre lo que ya pasó.
 */
export async function darDeBaja(metaUserId: string): Promise<number> {
  const filas = await getDb()
    .update(socialAccounts)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, lastSyncError: BAJA_DESDE_FACEBOOK })
    .where(and(eq(socialAccounts.metaUserId, metaUserId), inArray(socialAccounts.network, [...REDES_META])))
    .returning({ id: socialAccounts.id })
  return filas.length
}

/**
 * Los pasos del borrado, en orden, para correr dentro de una sola transacción.
 *
 * El orden lo manda el esquema: `social_posts`, `account_metrics` y
 * `scheduled_post_targets` referencian `social_accounts` **sin** cascada, así que la fila
 * de la cuenta no se puede borrar mientras alguna de las tres siga en pie; y
 * `post_metrics` cuelga de los posts, no de la cuenta, así que va antes que ellos.
 * `post_comments` sí tiene cascada, pero se borra explícito para que el orden completo se
 * vea de una lectura.
 *
 * Los `scheduled_posts` que conservan algún destino no se tocan: el texto y la media son
 * del dueño, no de Meta. Los que esta operación deja sin ningún destino se borran con
 * ellos (`pasoDeHuerfanos`), porque la parrilla lee por `innerJoin` con los destinos y un
 * post sin ninguno desaparece de todas las vistas sin que el dueño pueda ni abrirlo ni
 * borrarlo.
 *
 * Devuelve `SQL` y no texto —mismo criterio que `pasosDeFusion`— para que el test pueda
 * renderizarlo con el dialecto y afirmar el orden y los parámetros sin base.
 */
export function pasosDeBorrado(metaUserId: string): SQL[] {
  // Las redes van literales y no como parámetros: es la lista cerrada de `REDES_META`,
  // y así la condición se lee en el texto de cada paso.
  const cuentas = sql`select id from social_accounts where meta_user_id = ${metaUserId} and network in ('instagram', 'facebook')`
  return [
    sql`delete from post_metrics where post_id in (select id from social_posts where account_id in (${cuentas}))`,
    sql`delete from post_comments where account_id in (${cuentas})`,
    sql`delete from social_posts where account_id in (${cuentas})`,
    sql`delete from account_metrics where account_id in (${cuentas})`,
    sql`delete from scheduled_post_targets where account_id in (${cuentas})`,
    sql`delete from social_accounts where id in (${cuentas})`,
  ]
}

/**
 * El séptimo paso: los cortes que se quedaron sin ningún destino, del texto a la media.
 *
 * Va aparte de `pasosDeBorrado` porque necesita algo que solo se sabe leyendo antes de
 * borrar —qué cortes tocaban esas cuentas— y porque los seis primeros comparten dos
 * invariantes que este no: llevar el `meta_user_id` como parámetro y acotarse a las dos
 * redes de Meta. Sigue siendo pura, así que su SQL se prueba sin base.
 *
 * El `not exists` es la mitad que importa: borra solo lo que **esta** operación dejó
 * huérfano. Un corte que conserve un destino en otra red sigue en la parrilla, y un
 * borrador que ya estaba sin destinos —el dueño lo dejó así— no se toca. La media y la
 * regla cuelgan de `scheduled_posts` en cascada; los archivos los barre R2 al día
 * siguiente, como con cualquier borrado.
 *
 * Sin ids devuelve `null`: nada que borrar, ningún paso que correr.
 */
export function pasoDeHuerfanos(postIds: string[]): SQL | null {
  if (postIds.length === 0) return null
  const ids = sql.join(
    postIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`delete from scheduled_posts where id in (${ids}) and not exists (select 1 from scheduled_post_targets t where t.post_id = scheduled_posts.id)`
}

/**
 * 16 caracteres de base32 en minúscula: legible en una URL y sin ambigüedad 0/O, 1/l.
 *
 * `b % 32` no sesga nada porque 256 es múltiplo de 32: cada letra sale igual de probable.
 */
export function codigoDeBorrado(): string {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz234567'
  return [...randomBytes(16)].map((b) => alfabeto[b % 32]).join('')
}

/**
 * Borra lo que vino de Meta para ese usuario y deja constancia; devuelve el código que la
 * respuesta a Meta lleva y que la página de estado sabe leer.
 *
 * Las cuentas se cuentan antes de borrarlas: después ya no existen. Y los cortes que
 * tocaban esas cuentas se leen antes también, por la misma razón: el quinto paso borra
 * sus destinos, que es el único camino que llevaba hasta ellos.
 */
export async function borrarDatosDe(metaUserId: string): Promise<{ codigo: string; cuentas: number }> {
  const db = getDb()
  const codigo = codigoDeBorrado()
  return db.transaction(async (tx) => {
    const afectadas = await tx
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.metaUserId, metaUserId), inArray(socialAccounts.network, [...REDES_META])))
    const cuentaIds = afectadas.map((c) => c.id)
    const cortes = cuentaIds.length
      ? await tx
          .selectDistinct({ postId: scheduledPostTargets.postId })
          .from(scheduledPostTargets)
          .where(inArray(scheduledPostTargets.accountId, cuentaIds))
      : []
    for (const paso of pasosDeBorrado(metaUserId)) await tx.execute(paso)
    const huerfanos = pasoDeHuerfanos(cortes.map((c) => c.postId))
    if (huerfanos) await tx.execute(huerfanos)
    await tx.insert(solicitudesBorrado).values({ codigo, red: 'meta', metaUserId, cuentas: afectadas.length })
    return { codigo, cuentas: afectadas.length }
  })
}
