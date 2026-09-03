import { NextResponse } from 'next/server'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { env } from '@/lib/env'
import { buildMetricPost, parseRango } from '@/lib/metrics-api'
import { getPostRows } from '@/lib/posts'
import type { Atributos } from '@/lib/social/publish/atributos'

export const dynamic = 'force-dynamic'

// Un mes de la parrilla actual (20 posts/día × 3 redes) cabe holgado; `truncado`
// avisa cuando el tope mordió, para que nadie concluya sobre datos a medias.
const MAX_POSTS = 2000

export async function GET(request: Request) {
  const key = env('SCHEDULE_API_KEY')
  // Sin llave configurada el endpoint queda cerrado — molde del batch.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const url = new URL(request.url)
  const rango = parseRango(
    url.searchParams.get('desde'),
    url.searchParams.get('hasta'),
    new Date(),
    SITE_TIMEZONE,
  )
  if ('error' in rango) return NextResponse.json({ error: rango.error }, { status: 400 })

  const red = url.searchParams.get('red')
  if (red !== null && !(SOCIAL_NETWORKS as readonly string[]).includes(red)) {
    return NextResponse.json({ error: `Red desconocida: ${red}.` }, { status: 400 })
  }

  // Mismo motor que el panel: acumulado + ganado en la ventana, visitas por ?s=. La
  // ventana viaja además como filtro de publicación, para que el tope acote lo pedido
  // y no las 200 filas más nuevas del catálogo entero.
  const all = await getPostRows(
    { from: rango.from, to: rango.to, profileId: null, includeBots: false },
    false,
    { publishedFrom: rango.from, publishedTo: rango.to, limit: MAX_POSTS },
  )
  const rows = red === null ? all : all.filter((row) => row.network === red)

  // Los atributos del calendario, unidos por (red, externalId) en memoria: un post
  // orgánico simplemente no aparece aquí y sale con atributos null.
  const externalIds = rows.map((row) => row.externalId)
  const atributosByKey = new Map<string, Atributos | null>()
  if (externalIds.length > 0) {
    const scheduled = await getDb()
      .select({
        network: scheduledPostTargets.network,
        externalId: scheduledPostTargets.externalId,
        atributos: scheduledPosts.atributos,
      })
      .from(scheduledPostTargets)
      .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
      .where(
        and(
          isNotNull(scheduledPostTargets.externalId),
          inArray(scheduledPostTargets.externalId, externalIds),
        ),
      )
    for (const s of scheduled) {
      atributosByKey.set(`${s.network}:${s.externalId}`, (s.atributos as Atributos | null) ?? null)
    }
  }

  return NextResponse.json({
    truncado: all.length >= MAX_POSTS,
    posts: rows.map((row) =>
      buildMetricPost(row, atributosByKey.get(`${row.network}:${row.externalId}`) ?? null, SITE_TIMEZONE),
    ),
  })
}
