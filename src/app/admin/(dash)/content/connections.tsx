'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { disconnectNetwork, syncSocialNow } from '@/app/admin/actions'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import type { ConnectionRow } from '@/lib/posts-kpis'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/**
 * A disconnect keeps the handle now, so a handle on its own no longer means connected.
 * Without saying so, a card could read "@vicente" with a Conectar button under it and
 * leave the owner guessing which of the two to believe.
 */
function accountLabel(row: ConnectionRow): string {
  if (!row.handle) return row.connected ? 'Conectado' : 'Sin conectar'
  return row.connected ? row.handle : `${row.handle} · sin conectar`
}

function syncedAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6)
  if (hours < 1) return 'recién'
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  return RELATIVE.format(-Math.round(hours / 24), 'day')
}

export function Connections({ rows }: { rows: ConnectionRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function sync() {
    startTransition(async () => {
      const result = await syncSocialNow()
      setMessage(result.error ?? 'Listo.')
    })
  }

  return (
    <section className="mb-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.network} className="surface rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold">
                {networkLabel(row.network)}
              </span>
              {row.lastSyncError ? (
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: NEGATIVE }} aria-hidden />
              ) : row.connected ? (
                <Check className="h-3.5 w-3.5" style={{ color: POSITIVE }} aria-hidden />
              ) : null}
            </div>

            <p className="mt-1 truncate text-[0.78rem] text-fg-muted">
              {accountLabel(row)}
            </p>

            {/* El handle se ve bien aunque el id de abajo sea el de otra cuenta, y esa
                diferencia es justo la que archiva un catálogo entero. Mejor a la vista. */}
            {row.externalId ? (
              <p className="mt-0.5 truncate font-mono text-[0.68rem] text-fg-faint">
                {row.externalId}
              </p>
            ) : null}

            <p className="mt-0.5 font-mono text-[0.68rem] text-fg-faint">
              Sincronizado {syncedAgo(row.lastSyncedAt)}
            </p>

            {row.lastSyncError ? (
              <p className="mt-2 line-clamp-2 text-[0.72rem]" style={{ color: NEGATIVE }}>
                {row.lastSyncError}
              </p>
            ) : null}

            <div className="mt-3">
              {!row.usesOAuth ? (
                <span className="font-mono text-[0.68rem] text-fg-faint">
                  {row.connected
                    ? 'Configurado por entorno'
                    : 'Falta YOUTUBE_API_KEY o YOUTUBE_CHANNEL_ID'}
                </span>
              ) : row.connected ? (
                <button
                  type="button"
                  onClick={() => startTransition(() => disconnectNetwork(row.network))}
                  className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
                >
                  Desconectar
                </button>
              ) : (
                <a
                  href={`/api/social/${row.network}/connect`}
                  className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
                >
                  Conectar →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={sync}
          disabled={pending}
          className="surface flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} aria-hidden />
          Sincronizar ahora
        </button>
        {message ? <span className="text-[0.78rem] text-fg-faint">{message}</span> : null}
      </div>
    </section>
  )
}
