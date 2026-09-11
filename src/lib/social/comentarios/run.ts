import 'server-only'
import { and, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb, postComments, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { connectorFor } from '../index'
import { comentaristaFor } from './index'
import { redactarPendientes, type RedaccionReport } from './redaccion'
import { DIAS_VENTANA, estadoInicial, postsAsondear, seAcaboElTiempo, tocaSondear } from './ventana'

/**
 * Lo único que el dueño llega a leer de un sondeo fallido. El detalle de la red —que trae
 * el cuerpo crudo de Meta— se queda en el log del servidor y no viaja en la respuesta.
 */
export const SONDEO_FALLIDO = 'No se pudieron leer los comentarios de esta cuenta.'

/**
 * Cuántos fallos seguidos bastan para abandonar una cuenta en esta pasada: una cuenta a la
 * que todavía no le concedieron el permiso falla en todas sus publicaciones, y no vale la
 * pena gastarle veinte llamadas por pasada para confirmarlo.
 */
const MAX_FALLOS_SEGUIDOS = 3

export type SondeoReport = {
  cuentas: Array<{
    network: string
    handle: string | null
    posts: number
    nuevos: number
    /** Publicaciones que la red no dejó leer en esta pasada; las demás igual se sondearon. */
    salteados: number
    error?: string
  }>
  /** Cuentas que el tope de tiempo dejó para la pasada siguiente; no es un fallo. */
  sinSondear: number
  /** Lo que la fase de redacción alcanzó a hacer en esta misma corrida. */
  redaccion: RedaccionReport
}

type Cuenta = { posts: number; nuevos: number; salteados: number }

async function sondearCuenta(account: SocialAccount, now: Date): Promise<Cuenta> {
  const vacio: Cuenta = { posts: 0, nuevos: 0, salteados: 0 }
  const comentarista = comentaristaFor(account.network)
  if (!comentarista) return vacio
  const db = getDb()

  // La credencial del comentarista cuando difiere de la de lectura, y si no la del
  // conector: el mismo molde que usa `attempt` en publish/run.ts.
  const ensure = comentarista.ensureCredential ?? connectorFor(account.network)?.ensureCredential
  const token = ensure ? await ensure(account) : null
  // Sin credencial no es un fallo: es una cuenta que el dueño desconectó, o una red
  // cuyo permiso nuevo todavía no autorizó. Se sale antes de tocar la red.
  if (!token) return vacio

  // Las publicaciones ya están en la base: la sincronización diaria las trajo. El sondeo
  // no vuelve a preguntarle a la red cuáles son.
  const desde = new Date(now.getTime() - DIAS_VENTANA * 864e5)
  const recientes = await db
    .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.accountId, account.id),
        isNull(socialPosts.archivedAt),
        gte(socialPosts.publishedAt, desde),
      ),
    )
    .orderBy(desc(socialPosts.publishedAt))

  const ids = postsAsondear(recientes, now)
  if (ids.length === 0) return vacio

  // Todos los comentarios ya conocidos de esta cuenta en esos posts, de una consulta:
  // preguntar por cada comentario sería una consulta por comentario y por pasada.
  const conocidos = new Set(
    (
      await db
        .select({ externalId: postComments.externalId })
        .from(postComments)
        .where(and(eq(postComments.accountId, account.id), inArray(postComments.postExternalId, ids)))
    ).map((fila) => fila.externalId),
  )

  let nuevos = 0
  let salteados = 0
  let seguidos = 0
  for (const [i, postExternalId] of ids.entries()) {
    // Cada publicación va sola. Una borrada en la red sigue sin `archivedAt` hasta el sync
    // de la mañana, y con veinte o menos la rotación tampoco la esquiva: dejar que su
    // fallo saliera de acá dejaría a la cuenta sin descubrir nada por hasta un día entero.
    try {
      const leidos = await comentarista.listar(account, token, postExternalId)
      seguidos = 0
      const frescos = leidos.filter((c) => !conocidos.has(c.externalId))
      if (frescos.length === 0) continue

      await db
        .insert(postComments)
        .values(
          frescos.map((c) => ({
            accountId: account.id,
            network: account.network,
            postExternalId: c.postExternalId,
            externalId: c.externalId,
            author: c.author,
            authorExternalId: c.authorExternalId,
            text: c.text,
            publishedAt: c.publishedAt,
            state: estadoInicial(c.authorExternalId, account.externalId),
          })),
        )
        // Dos pasadas que se solapan verían los mismos comentarios; la unique decide y la
        // segunda no pisa nada.
        .onConflictDoNothing({ target: [postComments.accountId, postComments.externalId] })
      for (const c of frescos) conocidos.add(c.externalId)
      nuevos += frescos.length
    } catch (error) {
      console.error(
        `[comentarios] ${account.network} ${postExternalId}:`,
        String(error).slice(0, 300),
      )
      salteados += 1
      seguidos += 1
      if (seguidos >= MAX_FALLOS_SEGUIDOS) {
        console.error(
          `[comentarios] ${account.network}: se abandona la cuenta en esta pasada tras ${seguidos} fallos seguidos.`,
        )
        // Las que quedaron sin mirar cuentan como salteadas, para que el reporte cuadre.
        salteados += ids.length - i - 1
        break
      }
    }
  }

  return { posts: ids.length, nuevos, salteados }
}

/**
 * Una pasada de descubrimiento. Corre dentro de la corrida de publicación, después de
 * publicar: el fallo de una cuenta no detiene a las demás, y ninguno detiene la corrida.
 */
export async function sondearComentarios(now: Date = new Date()): Promise<SondeoReport> {
  const inicio = Date.now()
  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .where(isNotNull(socialAccounts.accessToken))

  // A la que no le toca esta pasada se la salta acá: antes de pedirle credencial y antes
  // de preguntarle nada a la base. No lleva entrada en el reporte porque no es un fallo,
  // es que todavía no es su turno.
  const aSondear = cuentas.filter(
    (cuenta) => comentaristaFor(cuenta.network) && tocaSondear(cuenta.network, now),
  )
  const reporte: SondeoReport = {
    cuentas: [],
    sinSondear: 0,
    redaccion: { redactados: 0, fallidos: 0, sinPasarela: false },
  }
  // En serie, como la sincronización: la casa nunca pega concurrente contra Meta.
  for (const [i, cuenta] of aSondear.entries()) {
    // El tope por cuenta no acota la corrida: con varias cuentas son veinte llamadas por
    // cada una. Lo que queda se sondea en la pasada siguiente, y no es un fallo.
    if (seAcaboElTiempo(inicio, Date.now())) {
      reporte.sinSondear = aSondear.length - i
      break
    }
    try {
      reporte.cuentas.push({
        network: cuenta.network,
        handle: cuenta.handle,
        ...(await sondearCuenta(cuenta, now)),
      })
    } catch (error) {
      // El detalle de la red se queda en el log: la respuesta del cron lleva una frase fija.
      console.error(`[comentarios] ${cuenta.network}:`, String(error).slice(0, 300))
      reporte.cuentas.push({
        network: cuenta.network,
        handle: cuenta.handle,
        posts: 0,
        nuevos: 0,
        salteados: 0,
        error: SONDEO_FALLIDO,
      })
    }
  }
  try {
    reporte.redaccion = await redactarPendientes(inicio)
  } catch (error) {
    // Publicar y descubrir mandan sobre redactar: si la fase entera revienta, la corrida
    // conserva lo que ya descubrió y los borradores esperan la pasada siguiente.
    console.error('[comentarios] redacción:', String(error).slice(0, 300))
  }
  return reporte
}
