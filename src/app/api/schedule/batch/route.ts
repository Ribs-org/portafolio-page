import { NextResponse } from 'next/server'
import { MAX_BATCH_ITEMS, scheduleBatch, type BatchItem } from '@/lib/social/publish/batch'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// Downloads ride inside this function; same budget as the publish cron.
export const maxDuration = 240

export async function POST(request: Request) {
  const key = env('SCHEDULE_API_KEY')
  // Same discipline as the crons: without a key the endpoint stays shut.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let posts: BatchItem[]
  try {
    const body = (await request.json()) as { posts?: unknown[] }
    if (!Array.isArray(body.posts)) throw new Error('sin posts')
    if (body.posts.length > MAX_BATCH_ITEMS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_BATCH_ITEMS} posts por lote.` },
        { status: 400 },
      )
    }
    // Shape-normalized at the door: a string where an array belongs must become an
    // invalid row with a sentence, never a crash inside the batch loop.
    posts = body.posts.map((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>
      return {
        fecha: typeof p.fecha === 'string' ? p.fecha : '',
        texto: typeof p.texto === 'string' ? p.texto : '',
        redes: Array.isArray(p.redes) ? p.redes.map(String) : [],
        media: Array.isArray(p.media) ? p.media.map(String) : [],
      }
    })
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo debe ser JSON con { posts: [...] }.' },
      { status: 400 },
    )
  }

  // Rejected rows are data, not an endpoint failure — same rule as the cron report.
  const resultados = await scheduleBatch(posts)
  return NextResponse.json({ resultados })
}
