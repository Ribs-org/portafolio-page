import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb, sourceAuthors, sourcePosts } from '@/db'
import { guardarAjuste, leerAjuste } from '@/lib/ajustes'
import { fuenteFor } from './index'
import { AUTOR_ILEGIBLE } from './fuente'
import {
  CLAVE_CONTADOR,
  CLAVE_TOPE,
  diaDe,
  idMayor,
  leidasHoy,
  normalizarTope,
  serializarContador,
} from './tope'

/**
 * Cuántos creadores seguidos fallando bastan para cortar la corrida: uno es un creador que
 * se puso privado, tres seguidos ya no es un creador, es X.
 */
const MAX_FALLOS_SEGUIDOS = 3

export type TraidaReport = {
  autores: Array<{ username: string; nuevas: number; error?: string }>
  leidas: number
  topeAlcanzado: boolean
}

async function marcar(id: string, error: string | null): Promise<void> {
  await getDb()
    .update(sourceAuthors)
    .set({ lastError: error, updatedAt: new Date() })
    .where(eq(sourceAuthors.id, id))
}

/**
 * Una pasada de la traída. Corre en su propio cron, pocas veces al día: se paga por
 * publicación leída, y un creador publica tres o cuatro veces, no cada cinco minutos.
 */
export async function traerIdeas(now: Date = new Date()): Promise<TraidaReport> {
  const db = getDb()
  const reporte: TraidaReport = { autores: [], leidas: 0, topeAlcanzado: false }

  const hoy = diaDe(now)
  const tope = normalizarTope(await leerAjuste(CLAVE_TOPE))
  let leidas = leidasHoy(await leerAjuste(CLAVE_CONTADOR), hoy)
  if (leidas >= tope) {
    reporte.topeAlcanzado = true
    return reporte
  }

  const autores = await db.select().from(sourceAuthors).where(eq(sourceAuthors.active, true))

  let seguidos = 0
  for (const autor of autores) {
    const fuente = fuenteFor(autor.network)
    // Una red sin fuente se ignora en silencio: no es un fallo, es que todavía no existe.
    if (!fuente) continue

    const restante = tope - leidas
    if (restante <= 0) {
      reporte.topeAlcanzado = true
      break
    }

    try {
      let externalId = autor.externalId
      if (!externalId) {
        externalId = await fuente.resolverAutor(autor.username)
        await db
          .update(sourceAuthors)
          .set({ externalId, updatedAt: new Date() })
          .where(eq(sourceAuthors.id, autor.id))
      }

      const ajenos = await fuente.traer(externalId, autor.username, autor.sinceId, restante)
      leidas += ajenos.length
      seguidos = 0

      if (ajenos.length > 0) {
        await db
          .insert(sourcePosts)
          .values(
            ajenos.map((p) => ({
              authorId: autor.id,
              network: autor.network,
              externalId: p.externalId,
              url: p.url,
              authorHandle: p.authorHandle,
              originalText: p.text,
              publishedAt: p.publishedAt,
            })),
          )
          // Dos corridas que se solapen verían los mismos tuits; la unique decide y la
          // segunda no pisa nada.
          .onConflictDoNothing({
            target: [sourcePosts.authorId, sourcePosts.externalId],
          })

        let masNuevo = autor.sinceId
        for (const p of ajenos) masNuevo = idMayor(masNuevo, p.externalId)
        await db
          .update(sourceAuthors)
          .set({ sinceId: masNuevo, lastError: null, updatedAt: new Date() })
          .where(eq(sourceAuthors.id, autor.id))
      } else if (autor.lastError) {
        await marcar(autor.id, null)
      }

      reporte.autores.push({ username: autor.username, nuevas: ajenos.length })
    } catch (error) {
      // El detalle de X se queda en el log: el reporte lleva una frase fija.
      console.error(`[ideas] ${autor.username}:`, String(error).slice(0, 300))
      await marcar(autor.id, AUTOR_ILEGIBLE)
      reporte.autores.push({ username: autor.username, nuevas: 0, error: AUTOR_ILEGIBLE })
      seguidos += 1
      if (seguidos >= MAX_FALLOS_SEGUIDOS) {
        console.error(`[ideas] se abandona la corrida tras ${seguidos} cuentas seguidas fallando.`)
        break
      }
    }
  }

  reporte.leidas = leidas
  await guardarAjuste(CLAVE_CONTADOR, serializarContador(hoy, leidas))
  return reporte
}
