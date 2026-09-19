'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { disconnectAccount, syncSocialNow } from '@/app/admin/actions'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { SOCIAL_NETWORKS } from '@/db/schema'
import type { CuentaRow } from '@/lib/posts-kpis'
import { networkLabel } from '@/lib/networks'
import { estadoDelFierro, type Fierro } from '@/lib/parrilla'
import { cn } from '@/lib/utils'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/** Lo que dura un acuse de recibo antes de irse solo, como los «Copiado» del panel. */
const AVISO_MS = 2000

/**
 * Lo que devuelve Meta cuando un token murió es una frase en inglés con códigos adentro,
 * y aparece justo cuando algo se rompió. La pantalla dice qué hacer; el texto original
 * queda en el `title` para quien lo necesite.
 */
const FALLO_DE_SYNC = 'La conexión falló; reconecta la cuenta.'

const CLASE_FIERRO: Record<Fierro, string> = {
  'al-rojo': 'fierro-al-rojo',
  enfriandose: 'fierro-enfriandose',
  frio: 'fierro-frio',
}

/** «en 3 días», «mañana». La cuenta regresiva que antes había que sacar de la nada. */
function venceEn(iso: string): string {
  const dias = Math.round((new Date(iso).getTime() - Date.now()) / 86.4e6)
  if (dias <= 0) return 'hoy'
  return RELATIVE.format(dias, 'day')
}

function syncedAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6)
  if (hours < 1) return 'recién'
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  return RELATIVE.format(-Math.round(hours / 24), 'day')
}

function nombreDe(row: CuentaRow): string {
  return row.handle ?? row.externalId ?? 'Sin nombre'
}

/** Un bloque por red, una tarjeta por cuenta. Conectar suma; la misma cuenta solo renueva. */
export function Cuentas({ rows }: { rows: CuentaRow[] }) {
  const [pending, startTransition] = useTransition()
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)

  // El «Listo.» se iba solo nunca: se quedaba hasta recargar la página. Un error sí se
  // queda, porque describe algo que todavía hay que arreglar.
  useEffect(() => {
    if (!aviso?.ok) return
    const id = setTimeout(() => setAviso(null), AVISO_MS)
    return () => clearTimeout(id)
  }, [aviso])

  function sync() {
    startTransition(async () => {
      const result = await syncSocialNow()
      setAviso(result.error ? { texto: result.error, ok: false } : { texto: 'Listo.', ok: true })
    })
  }

  return (
    <section className="space-y-6">
      {SOCIAL_NETWORKS.map((network) => {
        const cuentas = rows.filter((r) => r.network === network)
        return (
          <div key={network}>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="font-titulo text-sm font-semibold uppercase tracking-[0.03em]">{networkLabel(network)}</h2>
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
                  <Tarjeta key={row.id} row={row} network={network} />
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
          className="chapa flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} aria-hidden />
          Sincronizar ahora
        </button>
        {/* La región vive siempre, y el aviso entra y sale de ella: montarla con el texto
            adentro es un cambio que el lector de pantalla no siempre alcanza a ver. */}
        <span role="status" className="text-[0.78rem] text-fg-faint">
          {aviso ? aviso.texto : null}
        </span>
      </div>
    </section>
  )
}

/**
 * Cada tarjeta lleva su propio pendiente: desconectar una cuenta no tiene por qué
 * apagar los botones de las otras siete.
 */
function Tarjeta({ row, network }: { row: CuentaRow; network: string }) {
  const [pending, startTransition] = useTransition()
  const [desconectada, setDesconectada] = useState(false)
  const nombre = nombreDe(row)

  useEffect(() => {
    if (!desconectada) return
    const id = setTimeout(() => setDesconectada(false), AVISO_MS)
    return () => clearTimeout(id)
  }, [desconectada])

  function desconectar() {
    const seguir = window.confirm(
      `Se desconecta «${nombre}» de ${networkLabel(network)}. Sus posts y métricas ya bajados se quedan, pero no se sincroniza nada más hasta que la vuelvas a conectar. ¿Seguir?`,
    )
    if (!seguir) return
    startTransition(async () => {
      await disconnectAccount(row.id)
      setDesconectada(true)
    })
  }

  const fierro = estadoDelFierro(
    { connected: row.connected, expiraEn: row.expiresAt, ultimoError: row.lastSyncError },
    new Date(),
  )

  return (
    <div className="chapa rounded-xl p-4">
      {/*
        El fierro, arriba de todo. Dice la temperatura de la conexión antes de que la
        leas: al rojo irradia, frío no. La frase de abajo la explica en palabras, porque
        el color nunca es la única señal.
      */}
      <div className={cn('fierro mb-3', CLASE_FIERRO[fierro])} aria-hidden />
      <div className="flex items-center gap-2">
        <span className="truncate text-sm">{nombre}</span>
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
      {/*
        El aviso de caducidad. Solo aparece cuando falta poco: un fierro al rojo no
        necesita decir que está al rojo, y un cartel encendido la mitad del tiempo se
        vuelve paisaje. El error de sincronización ya tiene su propia frase más abajo,
        así que acá no se repite.
      */}
      {fierro === 'enfriandose' && row.expiresAt ? (
        <p className="mt-2 text-[0.72rem] text-caution">
          Este fierro se está enfriando: la conexión vence {venceEn(row.expiresAt)}.
          Reconéctala antes de que se apague.
        </p>
      ) : null}
      {row.lastSyncError ? (
        <p
          className="mt-2 line-clamp-2 text-[0.72rem]"
          style={{ color: NEGATIVE }}
          title={row.lastSyncError}
        >
          {FALLO_DE_SYNC}
        </p>
      ) : null}
      <div role="status">
        {desconectada ? <p className="mt-2 text-[0.72rem] text-fg-muted">Desconectada.</p> : null}
      </div>
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
            onClick={desconectar}
            disabled={pending}
            className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg disabled:opacity-50"
          >
            {pending ? 'Desconectando…' : 'Desconectar'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
