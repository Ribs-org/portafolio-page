'use client'

import { useEffect } from 'react'

/**
 * Renders nothing. Listens for clicks on any anchor carrying `data-link-id` and
 * reports them with `sendBeacon`, which survives the page unload that follows.
 *
 * Delegation keeps the public markup server-rendered and JS-free: the links work
 * with scripting disabled, and tracking is pure enhancement on top.
 */
export function ClickTracker({ visitId, profileId }: { visitId: string; profileId: string }) {
  useEffect(() => {
    const loadedAt = performance.now()

    function report(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[data-link-id]')
      if (!anchor) return

      const body = JSON.stringify({
        visitId,
        profileId,
        linkId: anchor.getAttribute('data-link-id'),
        position: Number(anchor.getAttribute('data-position') ?? 0),
        msOnPage: Math.round(performance.now() - loadedAt),
      })

      try {
        navigator.sendBeacon('/api/track/click', new Blob([body], { type: 'application/json' }))
      } catch {
        // A failed beacon must never interfere with the navigation.
      }
    }

    document.addEventListener('click', report, true)
    return () => document.removeEventListener('click', report, true)
  }, [visitId, profileId])

  return null
}
