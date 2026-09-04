import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { accountMetrics, getDb } from '@/db'
import { localDay } from '@/lib/analytics'
import { buildAccountCards, buildAccountSeries } from '@/lib/account-stats'
import { parseRango, requireMobile } from '@/lib/mobile-api'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireMobile(request))) {
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
    .orderBy(asc(accountMetrics.day), asc(accountMetrics.network))

  const desde = localDay(from)
  const hasta = localDay(to)
  return NextResponse.json({
    cuentas: buildAccountCards(filas, desde, hasta),
    serie: buildAccountSeries(filas, desde, hasta),
  })
}
