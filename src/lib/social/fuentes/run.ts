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
  // Sin esto, un corte del cortacircuitos se lee igual que una lista de tres creadores.
  sinMirar: number
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
  const reporte: TraidaReport = { autores: [], leidas: 0, topeAlcanzado: false, sinMirar: 0 }

  const hoy = diaDe(now)
  const tope = normalizarTope(await leerAjuste(CLAVE_TOPE))
  let leidas = leidasHoy(await leerAjuste(CLAVE_CONTADOR), hoy)
  if (leidas >= tope) {
    reporte.topeAlcanzado = true
    reporte.leidas = leidas
    return reporte
  }

  const autores = await db.select().from(sourceAuthors).where(eq(sourceAuthors.active, true))

  let seguidos = 0
  for (const [indice, autor] of autores.entries()) {
    const fuente = fuenteFor(autor.network)
    // Una red sin fuente se ignora en silencio: no es un fallo, es que todavía no existe.
    if (!fuente) continue

    const restante = tope - leidas
    if (restante <= 0) {
      reporte.topeAlcanzado = true
      reporte.sinMirar = autores.length - indice
      break
    }

    try {
      let externalId = autor.externalId
      if (!externalId) {
        externalId = await fuente.resolverAutor(autor.username)
        // Resolver un creador nuevo también es una llamada que X cobra, una sola vez en
        // toda su vida, pero ninguna llamada queda fuera de la cuenta del día.
        leidas += 1
        await db
          .update(sourceAuthors)
          .set({ externalId, updatedAt: new Date() })
          .where(eq(sourceAuthors.id, autor.id))
      }

      const traida = await fuente.traer(externalId, autor.username, autor.sinceId, restante)
      // Se suma lo que la red entregó y no lo que sobrevivió al normalizador: X cobra por
      // publicación leída, la descarte quien la descarte.
      leidas += traida.leidas

      if (traida.posts.length > 0 || traida.masNuevo) {
        if (traida.posts.length > 0) {
          await db
            .insert(sourcePosts)
            .values(
              traida.posts.map((p) => ({
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
        }

        // La marca avanza aunque no sobreviva ninguna publicación: si no, esa misma página
        // se vuelve a pedir, y a pagar, en cada corrida.
        await db
          .update(sourceAuthors)
          .set({
            sinceId: idMayor(autor.sinceId, traida.masNuevo),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(sourceAuthors.id, autor.id))
      } else if (autor.lastError) {
        await marcar(autor.id, null)
      }

      // El reinicio va acá y no apenas responde X: si fuera antes de las escrituras, una
      // lectura buena con escritura mala nunca dejaría que el cortacircuitos saltara.
      seguidos = 0
      reporte.autores.push({ username: autor.username, nuevas: traida.posts.length })
    } catch (error) {
      // El detalle de X se queda en el log: el reporte lleva una frase fija.
      console.error(`[ideas] ${autor.username}:`, String(error).slice(0, 300))
      try {
        await marcar(autor.id, AUTOR_ILEGIBLE)
      } catch (fallo) {
        // Si esta escritura se saliera, se perdería el contador del día entero.
        console.error(`[ideas] no se pudo marcar ${autor.username}:`, String(fallo).slice(0, 300))
      }
      reporte.autores.push({ username: autor.username, nuevas: 0, error: AUTOR_ILEGIBLE })
      seguidos += 1
      if (seguidos >= MAX_FALLOS_SEGUIDOS) {
        console.error(`[ideas] se abandona la corrida tras ${seguidos} cuentas seguidas fallando.`)
        reporte.sinMirar = autores.length - indice - 1
        break
      }
    }
  }

  reporte.leidas = leidas
  await guardarAjuste(CLAVE_CONTADOR, serializarContador(hoy, leidas))
  return reporte
}
