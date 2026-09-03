'use client'

import { useEffect } from 'react'

/**
 * Renders nothing. Reports the visit once the page has actually run in a browser.
 *
 * This is the whole anti-bot mechanism: the server no longer counts a visit when it
 * renders the page, because that counted every scanner that fetched the HTML. Only a
 * client that executes JavaScript gets here.
 *
 * `document.referrer` and `location.search` travel in the body because the beacon's
 * own request carries this page as its referrer and a bare URL with no query.
 */
export function VisitTracker({ visitId, profileId }: { visitId: string; profileId: string }) {
  useEffect(() => {
    const body = JSON.stringify({
      visitId,
      profileId,
      referrer: document.referrer,
      query: window.location.search,
    })

    try {
      // sendBeacon survives an immediate navigation away; fetch is the fallback for
      // the browsers that lack it. A failure is silent on purpose.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track/visit', new Blob([body], { type: 'application/json' }))
      } else {
        void fetch('/api/track/visit', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      }
    } catch {
      // Analytics must never interfere with the page.
    }
    // El id es estable por render, así que esto corre una vez por carga de página.
  }, [visitId, profileId])

  return null
}
