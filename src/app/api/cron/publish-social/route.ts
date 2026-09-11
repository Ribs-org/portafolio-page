import { NextResponse } from 'next/server'
import { sondearComentarios } from '@/lib/social/comentarios/run'
import { publishDue } from '@/lib/social/publish/run'
import { barrerHuerfanos } from '@/lib/storage-gc'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// 240 on purpose, below the 5-minute cadence: a run that dies before the next tick
// can never overlap it, which closes most of the double-publish window the claim in
// publishDue cannot cover on its own. El sondeo de comentarios comparte este presupuesto:
// se lleva la mitad como mucho (ver `MAX_MS_POR_CORRIDA`), porque publicar manda.
export const maxDuration = 240

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Same discipline as sync-social: without a secret the endpoint stays shut.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    // Failed targets answer 200 on purpose: each one wrote its own lastError and the
    // calendar shows it. A non-2xx here means the orchestrator itself broke.
    const report = await publishDue()
    // Después de publicar y antes de barrer: publicar a tiempo manda sobre responder a
    // tiempo, y el sondeo no debe quitarle segundos a la publicación de esta pasada.
    // Su fallo no puede tumbar la corrida, que ya publicó.
    let comentarios: Awaited<ReturnType<typeof sondearComentarios>> = {
      cuentas: [],
      sinSondear: 0,
    }
    try {
      comentarios = await sondearComentarios()
    } catch (error) {
      console.error('Falló el sondeo de comentarios:', String(error).slice(0, 300))
    }
    // Después de publicar, no antes: `limpiarMedia` acaba de liberar los videos del
    // día y el barrido no tiene por qué esperar otras 24 horas para verlo. No hace
    // falta envolverlo: `barrerHuerfanos` no lanza nunca.
    const barrido = await barrerHuerfanos()
    return NextResponse.json({ report, comentarios, barrido })
  } catch (error) {
    console.error('Falló la corrida de publicación:', error)
    return NextResponse.json({ error: 'La publicación falló por completo.' }, { status: 500 })
  }
}
