import { NextResponse } from 'next/server'
import { syncAll } from '@/lib/social/sync'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Without a secret the endpoint stays shut rather than open: an unauthenticated
  // sync is a free way for anyone to burn the day's API quota.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const report = await syncAll()
    return NextResponse.json({ report })
  } catch (error) {
    // syncAll settles every network on its own, so getting here means the orchestrator
    // itself broke. An unhandled rejection would hand the operator a framework 500 page
    // with nothing in it; this keeps the answer shaped like the all-networks-failed case,
    // which already reports its failures in the body.
    console.error('Falló la sincronización de redes:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ report: [], error: message })
  }
}
