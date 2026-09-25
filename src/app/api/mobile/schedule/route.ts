import { NextResponse } from 'next/server'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import {
  getDb,
  scheduledPosts,
  scheduledPostMedia,
  scheduledPostTargets,
  socialAccounts,
  type ScheduledPost,
  type ScheduledPostTarget,
} from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { isoInZone } from '@/lib/metrics-api'
import { requireMobileUser } from '@/lib/mobile-guardia'
import {
  ARCHIVO_AJENO,
  ARCHIVO_FALTANTE,
  CUERPO_ILEGIBLE,
  NO_SE_GUARDO,
  parseBorradorMovil,
  parseMediaMovil,
  resolverCuando,
  resolverDestinos,
} from '@/lib/mobile-api'
import { crearPostProgramado } from '@/lib/social/publish/crear'
import { CuentaInvalida } from '@/lib/social/cuentas'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { basePublica, existe, keyDesdeUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/** Una ventana con memoria corta y futuro suficiente para lo que cabe en un pulgar. */
const DIAS_ATRAS = 7
const DIAS_ADELANTE = 30

/** Una fila del `leftJoin`: un post con uno de sus destinos y el handle de su cuenta. */
type FilaDestinoMovil = { post: ScheduledPost; target: ScheduledPostTarget; handle: string | null }

export type PostMovil = {
  id: string
  texto: string
  cuando: string
  portada: string | null
  miniatura: string | null
  redes: Array<{ id: string; red: string; handle: string | null; estado: string; error: string | null }>
}

/**
 * Agrupa las filas del join en un post por id, con sus destinos juntos. Extraída para
 * poder probarla sin base — ver `route.test.ts`.
 *
 * Cada destino lleva su propio `id` (`scheduled_post_targets.id`), no solo `red`: con
 * dos cuentas de la misma red, dos destinos del mismo post comparten `red` y solo el
 * `id` los distingue — es la clave que el Resumen y el Calendario del teléfono usan
 * para no repetir la de React entre ellos (repaso final de la rama).
 */
export function agruparPostsMovil(filas: FilaDestinoMovil[], miniaturaPorPost: Map<string, string>): PostMovil[] {
  const mapa = new Map<string, PostMovil>()
  for (const { post, target, handle } of filas) {
    const entrada = mapa.get(post.id) ?? {
      id: post.id,
      texto: post.caption,
      cuando: isoInZone(post.scheduledAt, SITE_TIMEZONE),
      portada: post.coverUrl,
      miniatura: miniaturaPorPost.get(post.id) ?? null,
      redes: [],
    }
    entrada.redes.push({ id: target.id, red: target.network, handle, estado: target.status, error: target.lastError })
    mapa.set(post.id, entrada)
  }
  return [...mapa.values()]
}

export async function GET(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const now = new Date()
  const db = getDb()
  const filas = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets, handle: socialAccounts.handle })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    // `leftJoin`, no `innerJoin`: una cuenta borrada no hace desaparecer el destino,
    // solo su handle — mismo criterio que `GET /api/schedule/posts` (Tarea 5).
    .leftJoin(socialAccounts, eq(socialAccounts.id, scheduledPostTargets.accountId))
    .where(
      and(
        eq(scheduledPosts.ownerId, usuario.id),
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

  return NextResponse.json({ posts: agruparPostsMovil(filas, miniaturaPorPost) })
}

/**
 * El post con sus archivos ya en R2. Antes de crear: que cada URL sea del almacén
 * propio y bajo `scheduled/` (un cuerpo forjado no puede apuntar a cualquier URL de
 * internet), que se resuelva el destino real con `resolverDestinos` (compartida con
 * `check/route.ts` — ver su comentario), que `cuando` y el resto del borrador pasen las
 * reglas de `validateScheduleDraft` sobre la red de cada destino resuelto, no una
 * declarada aparte, y por último que cada objeto exista en R2 (un HEAD es un viaje de
 * ida y vuelta, y no vale la pena pagarlo si el post ya iba a rechazarse por otra
 * razón).
 */
export async function POST(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) {
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

  // `check/route.ts` promete lo que este `POST` cumple: las dos rutas llaman a
  // `resolverDestinos` con el mismo borrador, así que nunca se pueden desacordar.
  let cuentas: Awaited<ReturnType<typeof resolverDestinos>>['cuentas']
  let networks: string[]
  try {
    ;({ cuentas, networks } = await resolverDestinos(usuario.id, borrador))
  } catch (fallo) {
    if (fallo instanceof CuentaInvalida) return NextResponse.json({ error: fallo.message }, { status: 400 })
    throw fallo
  }

  const now = new Date()
  const scheduledAt = resolverCuando(borrador.ahora, borrador.cuando, now)
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: media.filter((m) => m.mediaType === 'image').length,
      videoCount: media.filter((m) => m.mediaType === 'video').length,
      networks,
      scheduledAt,
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  try {
    for (const m of media) {
      if (!(await existe(m.url))) return NextResponse.json({ error: ARCHIVO_FALTANTE }, { status: 400 })
    }
  } catch (error) {
    console.error('schedule/existe:', String(error).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }

  try {
    const id = await crearPostProgramado(usuario.id, {
      caption: borrador.texto,
      scheduledAt: scheduledAt!,
      media,
      cuentas,
    })
    return NextResponse.json({ id, cuando: isoInZone(scheduledAt!, SITE_TIMEZONE) })
  } catch (dbError) {
    console.error('schedule/crear:', String(dbError).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }
}
