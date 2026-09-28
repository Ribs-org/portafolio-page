import { sql, type SQL } from 'drizzle-orm'

// Por qué existe esto: TikTok, Instagram y Facebook le dan a la misma persona un
// identificador distinto por cada app. Al pasar del sandbox a la app real (o al crear una
// app nueva), la misma cuenta vuelve a conectarse como una fila nueva —otra identidad
// `(red, id externo)`— y la fila vieja queda sin credencial para siempre, con sus posts,
// sus métricas y su historial de publicaciones colgando. Fusionar es decir «esta es la
// misma cuenta que aquella»: todo lo de la vieja pasa a la viva, y la vieja se borra.

export const FUSION_MISMA_CUENTA = 'Una cuenta no se fusiona en sí misma.'
export const FUSION_NO_ES_TUYA = 'Una de las cuentas no es tuya.'
export const FUSION_DISTINTA_RED = 'Solo se fusionan dos cuentas de la misma red.'
export const FUSION_MUERTA_VIVA = 'La cuenta que se absorbe tiene que estar sin credencial. Desconéctala primero si es lo que quieres.'
export const FUSION_VIVA_SIN_CREDENCIAL = 'La cuenta que absorbe tiene que estar conectada.'
export const FUSION_FALLO = 'No se pudo fusionar. Inténtalo de nuevo.'

/** Lo mínimo de una fila de `social_accounts` que la decisión necesita. */
export type CuentaParaFusion = { id: string; ownerId: string | null; network: string; conectada: boolean }

/**
 * Si `muerta` se puede absorber en `viva`. Pura, para probarse sin base; la acción la
 * corre con las dos filas ya leídas y solo entra a la transacción con un `ok`.
 *
 * La absorbida tiene que estar sin credencial a propósito: la fusión la borra, y una
 * cuenta viva se desconecta primero, como decisión, no de pasada dentro de otra acción.
 */
export function decidirFusion(
  muerta: CuentaParaFusion,
  viva: CuentaParaFusion,
  ownerId: string,
): { ok: true } | { error: string } {
  if (muerta.id === viva.id) return { error: FUSION_MISMA_CUENTA }
  if (muerta.ownerId !== ownerId || viva.ownerId !== ownerId) return { error: FUSION_NO_ES_TUYA }
  if (muerta.network !== viva.network) return { error: FUSION_DISTINTA_RED }
  if (muerta.conectada) return { error: FUSION_MUERTA_VIVA }
  if (!viva.conectada) return { error: FUSION_VIVA_SIN_CREDENCIAL }
  return { ok: true }
}

/**
 * Los pasos de la fusión, en orden, para correr dentro de una sola transacción. Cada
 * tabla que cuelga de una cuenta se trata según su unique:
 *
 * - `social_posts` (unique `external_id, account_id`): el mismo video sincronizado bajo
 *   las dos identidades existe dos veces. Las métricas por día del duplicado pasan al
 *   post de la viva —solo los días que a ese le faltan, por la unique `post_id, day`—,
 *   el duplicado se borra (su `post_metrics` restante cae en cascada), y los posts que la
 *   viva no tiene cambian de cuenta.
 * - `account_metrics` (unique `day, account_id`) y `scheduled_post_targets` (unique
 *   `post_id, account_id`): se mueve lo que no choca y se borra lo que sí. En un choque
 *   la fila de la viva gana: es la que sigue viva.
 * - `post_comments`: sin unique, se mueve entero.
 * - `social_accounts`: al final, cuando ya nada la referencia; las tres tablas sin
 *   cascada impedirían borrarla antes. Atada al dueño, no solo al id.
 *
 * Los ids viajan siempre como parámetros. Devuelve `SQL` y no texto para que el test
 * pueda renderizarlo con el dialecto y afirmar el orden y los parámetros.
 */
export function pasosDeFusion(muertaId: string, vivaId: string, ownerId: string): SQL[] {
  return [
    sql`update post_metrics m set post_id = v.id
        from social_posts d, social_posts v
        where m.post_id = d.id
          and d.account_id = ${muertaId}
          and v.account_id = ${vivaId}
          and v.external_id = d.external_id
          and not exists (select 1 from post_metrics x where x.post_id = v.id and x.day = m.day)`,
    sql`delete from social_posts d
        where d.account_id = ${muertaId}
          and exists (select 1 from social_posts v where v.account_id = ${vivaId} and v.external_id = d.external_id)`,
    sql`update social_posts set account_id = ${vivaId} where account_id = ${muertaId}`,
    sql`update account_metrics m set account_id = ${vivaId}
        where m.account_id = ${muertaId}
          and not exists (select 1 from account_metrics x where x.account_id = ${vivaId} and x.day = m.day)`,
    sql`delete from account_metrics where account_id = ${muertaId}`,
    sql`update scheduled_post_targets t set account_id = ${vivaId}
        where t.account_id = ${muertaId}
          and not exists (select 1 from scheduled_post_targets x where x.account_id = ${vivaId} and x.post_id = t.post_id)`,
    sql`delete from scheduled_post_targets where account_id = ${muertaId}`,
    sql`update post_comments set account_id = ${vivaId} where account_id = ${muertaId}`,
    sql`delete from social_accounts where id = ${muertaId} and owner_id = ${ownerId}`,
  ]
}
