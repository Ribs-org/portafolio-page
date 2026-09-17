import { NextResponse } from 'next/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { accountMetrics, getDb, socialAccounts } from '@/db'
import { localDay } from '@/lib/analytics'
import { buildAccountCards, buildAccountSeries } from '@/lib/account-stats'
import { requireMobileUser } from '@/lib/mobile-guardia'
import { parseRango } from '@/lib/mobile-api'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const now = new Date()
  const { from, to } = parseRango(new URL(request.url).searchParams.get('rango'), now)

  // Sin filtro de fecha: la variación necesita la lectura anterior a la ventana.
  const filas = await getDb()
    .select({
      network: accountMetrics.network,
      day: accountMetrics.day,
      followers: accountMetrics.followers,
      profileViews: accountMetrics.profileViews,
      reach: accountMetrics.reach,
    })
    .from(accountMetrics)
    .where(
      inArray(
        accountMetrics.accountId,
        getDb().select({ id: socialAccounts.id }).from(socialAccounts).where(eq(socialAccounts.ownerId, usuario.id)),
      ),
    )
    .orderBy(asc(accountMetrics.day), asc(accountMetrics.network))

  const desde = localDay(from)
  const hasta = localDay(to)

  // Mismos datos que account-stats.ts arma para el panel, traducidos al español que
  // habla el resto de la API móvil (account-stats.ts sigue sirviendo al panel web).
  const cuentas = buildAccountCards(filas, desde, hasta).map((cuenta) => ({
    red: cuenta.network,
    seguidores: cuenta.followers,
    seguidoresGanados: cuenta.followersChange,
    visitasAlPerfil: cuenta.profileViews,
    alcance: cuenta.reach,
    dia: cuenta.dayLabel,
  }))
  const serie = buildAccountSeries(filas, desde, hasta).map((punto) => ({
    fecha: punto.date,
    visitasAlPerfil: punto.profileViews,
    alcance: punto.reach,
  }))

  return NextResponse.json({ desde, hasta, cuentas, serie })
}
