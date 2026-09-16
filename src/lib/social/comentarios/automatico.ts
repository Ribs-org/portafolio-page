import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, postComments, reglasClave, scheduledPostTargets } from '@/db'
import type { SocialAccount } from '@/db'
import { env } from '@/lib/env'
import { COMENTARIO_AUSENTE, RED_RECHAZO } from './comentarista'
import { comentaristaFor } from './index'
import { decidirAutomatica, type ReglaLimpia } from './reglas'
import { seAcaboElTiempo } from './ventana'

/**
 * El host del sitio propio, para etiquetar el enlace del mensaje. `SITE_URL` si el dueño
 * la puso; si no, el dominio de producción que Vercel inyecta; sin ninguno, null y el
 * enlace va sin etiqueta.
 */
export function hostDelSitio(): string | null {
  const crudo = env('SITE_URL') ?? env('VERCEL_PROJECT_PRODUCTION_URL')
  if (!crudo) return null
  try {
    return new URL(crudo.startsWith('http') ? crudo : `https://${crudo}`).hostname
  } catch {
    return null
  }
}

/** Las reglas de los posts de una cuenta, por id de red del post. */
export async function reglasPara(accountId: string, postExternalIds: string[]): Promise<Map<string, ReglaLimpia>> {
  const mapa = new Map<string, ReglaLimpia>()
  if (postExternalIds.length === 0) return mapa
  const filas = await getDb()
    .select({
      externalId: scheduledPostTargets.externalId,
      palabra: reglasClave.palabra,
      mensaje: reglasClave.mensaje,
      respuestaPublica: reglasClave.respuestaPublica,
    })
    .from(reglasClave)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, reglasClave.postId))
    .where(
      and(eq(scheduledPostTargets.accountId, accountId), inArray(scheduledPostTargets.externalId, postExternalIds)),
    )
  for (const f of filas) {
    if (f.externalId) mapa.set(f.externalId, { palabra: f.palabra, mensaje: f.mensaje, respuestaPublica: f.respuestaPublica })
  }
  return mapa
}

type Nuevo = {
  id: string
  postExternalId: string
  externalId: string
  authorExternalId: string | null
  text: string
  publishedAt: Date
  state: string
}

/**
 * Responde en el acto los comentarios nuevos que dicen la palabra clave de su post. Corre
 * dentro del sondeo, sobre los recién insertados de una cuenta, con el token que el sondeo
 * ya consiguió. El privado llega en la entrega 2: hoy el plan siempre se decide sin él.
 * `cupo.restantes` es compartido por toda la corrida.
 */
export async function aplicarReglas(
  account: SocialAccount,
  token: string,
  nuevos: Nuevo[],
  cupo: { restantes: number },
  inicio: number,
): Promise<{ respondidos: number; fallidos: number }> {
  const resultado = { respondidos: 0, fallidos: 0 }
  const candidatos = nuevos.filter((n) => n.state === 'pendiente')
  if (candidatos.length === 0 || cupo.restantes <= 0) return resultado
  const comentarista = comentaristaFor(account.network)
  if (!comentarista) return resultado
  // Solo la credencial del propio comentarista escribe; si no tiene una propia, la del
  // sondeo (que viene del conector) es la misma que usaría el dueño al responder a mano.
  const tokenEscritura = comentarista.ensureCredential ? await comentarista.ensureCredential(account) : token
  if (!tokenEscritura) return resultado

  const reglas = await reglasPara(account.id, [...new Set(candidatos.map((c) => c.postExternalId))])
  if (reglas.size === 0) return resultado
  const db = getDb()
  const sitioHost = hostDelSitio()
  const now = new Date()

  for (const c of candidatos) {
    if (cupo.restantes <= 0 || seAcaboElTiempo(inicio, Date.now())) break
    const regla = reglas.get(c.postExternalId)
    if (!regla) continue

    const plan = decidirAutomatica({
      texto: c.text,
      esPropio: false,
      yaRecibioPrivado: false,
      network: account.network,
      publishedAt: c.publishedAt,
      now,
      privadoEncendido: false,
      regla,
      sitioHost,
    })
    if (plan.accion === 'ignorar') continue

    cupo.restantes -= 1
    try {
      const replyId = await comentarista.responder(account, tokenEscritura, c.externalId, plan.publico)
      await db
        .update(postComments)
        .set({ state: 'enviado', replyExternalId: replyId, draft: plan.publico, error: null, automatico: true, updatedAt: new Date() })
        .where(eq(postComments.id, c.id))
      resultado.respondidos += 1
    } catch (error) {
      console.error(`[comentarios] automática ${account.network}:`, String(error).slice(0, 300))
      const borrado = error instanceof Error && error.message === COMENTARIO_AUSENTE
      await db
        .update(postComments)
        .set({
          state: borrado ? 'descartado' : 'fallido',
          error: borrado ? COMENTARIO_AUSENTE : RED_RECHAZO,
          draft: plan.publico,
          automatico: true,
          updatedAt: new Date(),
        })
        .where(eq(postComments.id, c.id))
      resultado.fallidos += 1
    }
  }
  return resultado
}
