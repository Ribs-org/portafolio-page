import { NextResponse } from 'next/server'
import { getDb, visits } from '@/db'
import { buildVisitContext } from '@/lib/tracking'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Receives the beacon VisitTracker sends once the page actually ran in a browser.
 *
 * Counting on the server render instead — the way this used to work — counts every
 * HTTP fetch of the page, and scanners spoofing an ordinary Chrome user agent made up
 * most of the traffic. Requiring a browser to execute JavaScript is what separates a
 * reader from a crawler; the user-agent check below only still catches the honest ones.
 *
 * This request carries the same client IP, user agent and Vercel geo headers as the
 * render, so the context is identical — except the referrer, which here would be our
 * own page and therefore travels in the body.
 *
 * Always 204: the page has nothing useful to do with an error, and analytics must
 * never be something a reader notices.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const id = typeof body.visitId === 'string' && UUID.test(body.visitId) ? body.visitId : null
    const profileId =
      typeof body.profileId === 'string' && UUID.test(body.profileId) ? body.profileId : null
    if (!id || !profileId) return new NextResponse(null, { status: 204 })

    const query = typeof body.query === 'string' ? body.query.slice(0, 2000) : ''
    const referrer = typeof body.referrer === 'string' ? body.referrer : ''

    const context = buildVisitContext(
      request.headers,
      new URLSearchParams(query),
      referrer || null,
    )

    // El id lo generó el render y viaja también al rastreador de clics. Si la baliza
    // llega dos veces — reintento del navegador, o alguien reenviando — la segunda no
    // duplica la visita.
    await getDb().insert(visits).values({ id, profileId, ...context }).onConflictDoNothing()
  } catch (error) {
    console.error('[analytics] failed to record visit', error)
  }

  return new NextResponse(null, { status: 204 })
}
