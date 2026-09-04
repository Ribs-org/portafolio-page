import { NextResponse } from 'next/server'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { SITE_TIMEZONE, localDay } from '@/lib/analytics'
import { buildMetricPost } from '@/lib/metrics-api'
import { MAX_POSTS, parseRango, requireMobile } from '@/lib/mobile-api'
import { attributesFor } from '@/lib/post-attributes'
import { getPostRows } from '@/lib/posts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const url = new URL(request.url)
  const now = new Date()
  const { from, to } = parseRango(url.searchParams.get('rango'), now)

  // `?red=` repetible, como los chips del panel; una red desconocida se ignora en
  // vez de fallar: el teléfono nunca debe quedarse en blanco por un parámetro.
  const redes = url.searchParams
    .getAll('red')
    .filter((red) => (SOCIAL_NETWORKS as readonly string[]).includes(red))

  const todas = await getPostRows({ from, to, profileId: null, includeBots: false }, false, {
    publishedFrom: from,
    publishedTo: to,
    limit: MAX_POSTS,
  })
  const rows = redes.length > 0 ? todas.filter((row) => redes.includes(row.network)) : todas
  const atributos = await attributesFor(rows)

  return NextResponse.json({
    desde: localDay(from),
    hasta: localDay(to),
    // Sobre lo traído antes del filtro por red, igual que `all` en la API del editor:
    // el tope acota el catálogo completo, no lo que quedó tras filtrar.
    truncado: todas.length >= MAX_POSTS,
    posts: rows.map((row) => ({
      ...buildMetricPost(row, atributos.get(`${row.network}:${row.externalId}`) ?? null, SITE_TIMEZONE),
      // Lo único que la app necesita y el shape del editor-LLM no lleva.
      miniatura: row.thumbnailUrl,
    })),
  })
}
