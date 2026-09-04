import { NextResponse } from 'next/server'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { isoInZone } from '@/lib/metrics-api'
import { requireMobile } from '@/lib/mobile-api'

export const dynamic = 'force-dynamic'

/** Una ventana con memoria corta y futuro suficiente para lo que cabe en un pulgar. */
const DIAS_ATRAS = 7
const DIAS_ADELANTE = 30

export async function GET(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const now = new Date()
  const db = getDb()
  const filas = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(
      and(
        gt(scheduledPosts.scheduledAt, new Date(now.getTime() - DIAS_ATRAS * 864e5)),
        lte(scheduledPosts.scheduledAt, new Date(now.getTime() + DIAS_ADELANTE * 864e5)),
      ),
    )
    .orderBy(asc(scheduledPosts.scheduledAt))

  const ids = [...new Set(filas.map((f) => f.post.id))]
  const medias = ids.length
    ? await db
        .select()
        .from(scheduledPostMedia)
        .where(inArray(scheduledPostMedia.postId, ids))
        .orderBy(asc(scheduledPostMedia.position))
    : []
  const miniaturaPorPost = new Map<string, string>()
  for (const media of medias) {
    if (!miniaturaPorPost.has(media.postId) && media.mediaType === 'image') {
      miniaturaPorPost.set(media.postId, media.blobUrl)
    }
  }

  const mapa = new Map<
    string,
    { id: string; texto: string; cuando: string; portada: string | null; miniatura: string | null; redes: Array<{ red: string; estado: string; error: string | null }> }
  >()
  for (const { post, target } of filas) {
    const entrada = mapa.get(post.id) ?? {
      id: post.id,
      texto: post.caption,
      cuando: isoInZone(post.scheduledAt, SITE_TIMEZONE),
      portada: post.coverUrl,
      miniatura: miniaturaPorPost.get(post.id) ?? null,
      redes: [],
    }
    entrada.redes.push({ red: target.network, estado: target.status, error: target.lastError })
    mapa.set(post.id, entrada)
  }

  return NextResponse.json({ posts: [...mapa.values()] })
}
