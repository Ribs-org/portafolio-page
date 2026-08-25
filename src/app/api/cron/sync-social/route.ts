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

  const report = await syncAll()
  return NextResponse.json({ report })
}
