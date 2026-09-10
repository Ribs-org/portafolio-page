import { NextResponse } from 'next/server'
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { env } from '@/lib/env'
import { armarProgramados, parseVentana } from '@/lib/schedule-api'

export const dynamic = 'force-dynamic'

/**
 * Lo que hay en el calendario entre dos días: programado, publicando, publicado o
 * fallido, con el estado por red. Es la vista del editor-LLM sobre la parrilla, la
 * misma que el panel dibuja por semana — acá por rango, para que pueda decidir la
 * próxima tanda sabiendo qué ya está puesto.
 */
export async function GET(request: Request) {
  const key = env('SCHEDULE_API_KEY')
  // Sin llave configurada el endpoint queda cerrado — molde del batch.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const url = new URL(request.url)
  const ventana = parseVentana(
    url.searchParams.get('desde'),
    url.searchParams.get('hasta'),
    new Date(),
    SITE_TIMEZONE,
  )
  if ('error' in ventana) return NextResponse.json({ error: ventana.error }, { status: 400 })

  const db = getDb()
  const filas = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(and(gte(scheduledPosts.scheduledAt, ventana.from), lt(scheduledPosts.scheduledAt, ventana.to)))
    .orderBy(asc(scheduledPosts.scheduledAt), asc(scheduledPostTargets.network))

  const ids = [...new Set(filas.map((f) => f.post.id))]
  const medias = ids.length
    ? await db.select().from(scheduledPostMedia).where(inArray(scheduledPostMedia.postId, ids))
    : []

  return NextResponse.json({
    desde: ventana.desde,
    hasta: ventana.hasta,
    posts: armarProgramados(filas, medias, SITE_TIMEZONE),
  })
}
