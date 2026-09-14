import { env } from '@/lib/env'
import type { SocialAccount } from '@/db'

const GRAPH = 'https://graph.facebook.com/v23.0'

/** Meta acepta un solo privado a quien comentó, dentro de este plazo desde el comentario. */
export const DIAS_PRIVADO = 7

const REDES_CON_PRIVADO = new Set(['instagram', 'facebook'])

/**
 * Apagado salvo que la bandera diga `1`. Exige `pages_messaging` con acceso avanzado, que
 * pasa por revisión de Meta; hasta entonces, encenderla solo produce fallos con frase fija.
 */
export function privadoActivo(): boolean {
  return env('COMENTARIOS_DM') === '1'
}

export function tocaPrivado(
  network: string,
  publishedAt: Date,
  now: Date,
  activo: boolean,
): boolean {
  if (!activo) return false
  if (!REDES_CON_PRIVADO.has(network)) return false
  return now.getTime() - publishedAt.getTime() < DIAS_PRIVADO * 864e5
}

/**
 * `POST /{page-id}/messages` con `recipient.comment_id`: el mismo endpoint para la página de
 * Facebook y para la cuenta de Instagram, cada una con su id externo y su token.
 */
export async function mandarPrivado(
  account: SocialAccount,
  token: string,
  comentarioExternalId: string,
  texto: string,
): Promise<string> {
  const response = await fetch(`${GRAPH}/${account.externalId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: comentarioExternalId },
      message: { text: texto },
      access_token: token,
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Meta ${response.status}: ${body.slice(0, 200)}`)
  }
  const body = (await response.json()) as { message_id?: string }
  if (!body.message_id) throw new Error('Meta no devolvió el id del mensaje')
  return body.message_id
}
