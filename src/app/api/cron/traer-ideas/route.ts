import { NextResponse } from 'next/server'
import { traerIdeas } from '@/lib/social/fuentes/run'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// Holgado: la traída son unas pocas llamadas a X, una por creador de la lista, y corre
// cuatro veces al día en su propio horario.
export const maxDuration = 120

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Misma disciplina que publish-social: sin secreto el endpoint queda cerrado.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const reporte = await traerIdeas()
    return NextResponse.json(reporte)
  } catch (error) {
    console.error('Falló la traída de ideas:', String(error).slice(0, 300))
    return NextResponse.json({ error: 'La traída de ideas falló por completo.' }, { status: 500 })
  }
}
