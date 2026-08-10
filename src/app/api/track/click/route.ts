import { NextResponse } from 'next/server'
import { clicks, getDb } from '@/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BOT_PATTERN = /bot|crawler|spider|headless|lighthouse/i

/**
 * Receives `sendBeacon` payloads from ClickTracker. Always answers 204: the browser
 * is already navigating away and there is nothing useful it could do with an error.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const visitId = typeof body.visitId === 'string' && UUID.test(body.visitId) ? body.visitId : null
    const linkId = typeof body.linkId === 'string' && UUID.test(body.linkId) ? body.linkId : null
    const profileId =
      typeof body.profileId === 'string' && UUID.test(body.profileId) ? body.profileId : null

    if (!profileId) return new NextResponse(null, { status: 204 })

    const msOnPage = Number.isFinite(body.msOnPage)
      ? Math.min(Math.max(Math.round(body.msOnPage), 0), 86_400_000)
      : null
    const position = Number.isFinite(body.position) ? Math.round(body.position) : null

    await getDb().insert(clicks).values({
      visitId,
      linkId,
      profileId,
      msOnPage,
      position,
      isBot: BOT_PATTERN.test(request.headers.get('user-agent') ?? ''),
    })
  } catch (error) {
    console.error('[analytics] failed to record click', error)
  }

  return new NextResponse(null, { status: 204 })
}
