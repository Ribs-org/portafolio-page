import { NextResponse } from 'next/server'
import { publishDue } from '@/lib/social/publish/run'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// 240 on purpose, below the 5-minute cadence: a run that dies before the next tick
// can never overlap it, which closes most of the double-publish window the claim in
// publishDue cannot cover on its own.
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
    return NextResponse.json({ report })
  } catch (error) {
    console.error('Falló la corrida de publicación:', error)
    return NextResponse.json({ error: 'La publicación falló por completo.' }, { status: 500 })
  }
}
