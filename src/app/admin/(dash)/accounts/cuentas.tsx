'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { disconnectAccount, syncSocialNow } from '@/app/admin/actions'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { SOCIAL_NETWORKS } from '@/db/schema'
import type { CuentaRow } from '@/lib/posts-kpis'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function syncedAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6)
  if (hours < 1) return 'recién'
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  return RELATIVE.format(-Math.round(hours / 24), 'day')
}

/** Un bloque por red, una tarjeta por cuenta. Conectar suma; la misma cuenta solo renueva. */
export function Cuentas({ rows }: { rows: CuentaRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function sync() {
    startTransition(async () => {
      const result = await syncSocialNow()
      setMessage(result.error ?? 'Listo.')
    })
  }

  return (
    <section className="space-y-6">
      {SOCIAL_NETWORKS.map((network) => {
        const cuentas = rows.filter((r) => r.network === network)
        return (
          <div key={network}>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="font-display text-sm font-semibold">{networkLabel(network)}</h2>
              <a
                href={`/api/social/${network}/connect`}
                className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
              >
                {cuentas.length === 0 ? 'Conectar →' : 'Agregar cuenta →'}
              </a>
            </div>
            {cuentas.length === 0 ? (
              <p className="text-[0.78rem] text-fg-faint">Sin cuentas.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cuentas.map((row) => (
                  <div key={row.id} className="surface rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">{row.handle ?? row.externalId ?? 'Sin nombre'}</span>
                      {row.lastSyncError ? (
                        <AlertTriangle className="h-3.5 w-3.5" style={{ color: NEGATIVE }} aria-hidden />
                      ) : row.connected ? (
                        <Check className="h-3.5 w-3.5" style={{ color: POSITIVE }} aria-hidden />
                      ) : null}
                    </div>
                    {row.externalId ? (
                      <p className="mt-0.5 truncate font-mono text-[0.68rem] text-fg-faint">{row.externalId}</p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-[0.68rem] text-fg-faint">
                      {row.lastSyncedAt ? `Sincronizado ${syncedAgo(row.lastSyncedAt)}` : 'Sin sincronizar'}
                    </p>
                    {/* Una fila puede sincronizar sin credencial OAuth (YouTube lee con su
                        API key): la tarjeta no debe decir lo contrario. */}
                    {!row.connected ? (
                      <p className="mt-0.5 font-mono text-[0.68rem] text-fg-faint">Sin credencial</p>
                    ) : null}
                    {row.lastSyncError ? (
                      <p className="mt-2 line-clamp-2 text-[0.72rem]" style={{ color: NEGATIVE }}>
                        {row.lastSyncError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={`/api/social/${network}/connect`}
                        className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
                      >
                        {row.connected ? 'Reconectar' : 'Conectar →'}
                      </a>
                      {row.connected ? (
                        <button
                          type="button"
                          onClick={() => startTransition(() => disconnectAccount(row.id))}
                          className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
                        >
                          Desconectar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-3">
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
