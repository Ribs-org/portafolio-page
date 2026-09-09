import { NextResponse } from 'next/server'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { isoInZone } from '@/lib/metrics-api'
import {
  ARCHIVO_AJENO,
  ARCHIVO_FALTANTE,
  CUERPO_ILEGIBLE,
  NO_SE_GUARDO,
  parseBorradorMovil,
  parseMediaMovil,
  requireMobile,
  resolverCuando,
} from '@/lib/mobile-api'
import { crearPostProgramado } from '@/lib/social/publish/crear'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { basePublica, existe, keyDesdeUrl } from '@/lib/storage'

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

/**
 * El post con sus archivos ya en R2. Dos comprobaciones antes de las reglas: que cada
 * URL sea del almacén propio y bajo `scheduled/` (un cuerpo forjado no puede apuntar a
 * cualquier URL de internet), y que el objeto exista (un post que referencia una subida
 * que nunca terminó fallaría en el publisher con tres reintentos y un error confuso).
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const borrador = parseBorradorMovil(body)
  if ('error' in borrador) return NextResponse.json({ error: borrador.error }, { status: 400 })
  const media = parseMediaMovil(body)
  if ('error' in media) return NextResponse.json({ error: media.error }, { status: 400 })

  const base = basePublica()
  for (const m of media) {
    const key = base ? keyDesdeUrl(base, m.url) : null
    if (!key || !key.startsWith('scheduled/')) {
      return NextResponse.json({ error: ARCHIVO_AJENO }, { status: 400 })
    }
  }
  try {
    for (const m of media) {
      if (!(await existe(m.url))) return NextResponse.json({ error: ARCHIVO_FALTANTE }, { status: 400 })
    }
  } catch (error) {
    console.error('schedule/existe:', String(error).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }

  const now = new Date()
  const scheduledAt = resolverCuando(borrador.ahora, borrador.cuando, now)
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: media.filter((m) => m.mediaType === 'image').length,
      videoCount: media.filter((m) => m.mediaType === 'video').length,
      networks: borrador.redes,
      scheduledAt,
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  try {
    const id = await crearPostProgramado({
      caption: borrador.texto,
      scheduledAt: scheduledAt!,
      media,
      networks: borrador.redes,
    })
    return NextResponse.json({ id, cuando: isoInZone(scheduledAt!, SITE_TIMEZONE) })
  } catch (dbError) {
    console.error('schedule/crear:', String(dbError).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }
}
