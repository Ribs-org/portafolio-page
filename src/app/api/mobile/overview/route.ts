import { NextResponse } from 'next/server'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import { accountMetrics, getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { SITE_TIMEZONE, getKpis, localDay } from '@/lib/analytics'
import { isoInZone } from '@/lib/metrics-api'
import { MAX_POSTS, parseRango, requireMobile } from '@/lib/mobile-api'
import { getPostRows } from '@/lib/posts'
import { postKpisFrom } from '@/lib/posts-kpis'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const now = new Date()
  const { from, to } = parseRango(new URL(request.url).searchParams.get('rango'), now)
  const filters = { from, to, profileId: null, includeBots: false }
  const db = getDb()

  // Las mismas funciones del panel: nada se recalcula acá.
  const [kpis, rows, seguidores, hoy, proximos] = await Promise.all([
    getKpis(filters),
    getPostRows(filters, false, { publishedFrom: from, publishedTo: to, limit: MAX_POSTS }),
    // Última lectura de seguidores por red, sumada: el total que el dueño reconoce.
    db
      .select({ network: accountMetrics.network, followers: accountMetrics.followers, day: accountMetrics.day })
      .from(accountMetrics)
      .orderBy(asc(accountMetrics.day)),
    db
      .select({ post: scheduledPosts, target: scheduledPostTargets })
      .from(scheduledPosts)
      .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
      // La misma ventana que el rango «hoy», sin volver a escribir la regla.
      .where(and(gt(scheduledPosts.scheduledAt, parseRango('hoy', now).from), lte(scheduledPosts.scheduledAt, now)))
      .orderBy(asc(scheduledPosts.scheduledAt)),
    db
      .select({ post: scheduledPosts, target: scheduledPostTargets })
      .from(scheduledPosts)
      .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
      .where(gt(scheduledPosts.scheduledAt, now))
      .orderBy(asc(scheduledPosts.scheduledAt)),
  ])

  const contenido = postKpisFrom(rows)

  // Una fila por post con sus redes juntas: la app dibuja una tarjeta, no un join.
  const agrupar = (filas: typeof hoy) => {
    const mapa = new Map<string, { id: string; texto: string; cuando: string; redes: Array<{ red: string; estado: string }> }>()
    for (const { post, target } of filas) {
      const entrada = mapa.get(post.id) ?? {
        id: post.id,
        texto: post.caption,
        cuando: isoInZone(post.scheduledAt, SITE_TIMEZONE),
        redes: [],
      }
      entrada.redes.push({ red: target.network, estado: target.status })
      mapa.set(post.id, entrada)
    }
    return [...mapa.values()]
  }

  // La última lectura *conocida* por red, no la última fila. Una sincronización que
  // falla a medias graba el día con `followers: null` (cada llamada de la red trae su
  // propio catch), y tomar esa fila borraría un conteo que sí sabíamos de antes.
  const ultimoPorRed = new Map<string, number>()
  for (const fila of seguidores) {
    if (fila.followers !== null) ultimoPorRed.set(fila.network, fila.followers)
  }
  const seguidoresTotal = [...ultimoPorRed.values()].reduce<number | null>(
    (total, valor) => (valor === null ? total : (total ?? 0) + valor),
    null,
  )

  return NextResponse.json({
    desde: localDay(from),
    hasta: localDay(to),
    // Igual que la API del editor: si el tope mordió, la app lo sabe en vez de
    // subestimar en silencio las views ganadas de la ventana.
    truncado: rows.length >= MAX_POSTS,
    kpis: {
      viewsGanadas: contenido.views,
      visitasAlSitio: kpis.visits,
      arrastre: contenido.pull,
      seguidores: seguidoresTotal,
    },
    hoy: agrupar(hoy),
    proximos: agrupar(proximos).slice(0, 5),
  })
}
