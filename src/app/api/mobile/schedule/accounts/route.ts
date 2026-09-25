import { NextResponse } from 'next/server'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { REDES_MOVIL } from '@/lib/mobile-api'
import { requireMobileUser } from '@/lib/mobile-guardia'

export const dynamic = 'force-dynamic'

/**
 * Las cuentas del dueño, para que la app elija destino por cuenta y no por red (Tarea
 * 7). Todas las suyas, conectadas o no: una desconectada igual se lista, para que el
 * dueño vea que existe y por qué no puede elegirla — `conectada` es lo que decide si
 * el chip se puede tocar, no si aparece.
 *
 * Solo las redes de `REDES_MOVIL`: una cuenta de TikTok no sale de acá, para que ese
 * chip no llegue a existir en la app. `resolverDestinos` (`mobile-api.ts`) repite este
 * mismo filtro sobre el destino ya resuelto, porque el cuerpo que llega a esas rutas
 * puede no venir de este endpoint — el servidor decide, no el cliente.
 */
export async function GET(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) return new NextResponse('No autorizado', { status: 401 })

  const filas = await getDb()
    .select({
      id: socialAccounts.id,
      network: socialAccounts.network,
      handle: socialAccounts.handle,
      // El booleano se calcula en la consulta: seleccionar `accessToken` para
      // descartarlo después igual lo trae a este proceso, y es un secreto que no hace
      // falta materializar solo para preguntarle si es null.
      conectada: sql<boolean>`${socialAccounts.accessToken} is not null`,
    })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.ownerId, usuario.id), inArray(socialAccounts.network, [...REDES_MOVIL])))
    .orderBy(asc(socialAccounts.network), asc(socialAccounts.createdAt))

  return NextResponse.json({
    cuentas: filas.map((f) => ({ id: f.id, red: f.network, handle: f.handle, conectada: f.conectada })),
  })
}
