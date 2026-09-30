'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react'
import { disconnectAccount, fusionarCuenta, syncSocialNow } from '@/app/admin/actions'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { SOCIAL_NETWORKS } from '@/db/schema'
import type { CuentaRow } from '@/lib/posts-kpis'
import { avisosDe, networkLabel } from '@/lib/networks'
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
export function Cuentas({ rows, metaEnRevision }: { rows: CuentaRow[]; metaEnRevision: boolean }) {
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
            {avisosDe(network, metaEnRevision).map((aviso) => (
              <p key={aviso} className="mb-2 text-[0.78rem] text-fg-faint">{aviso}</p>
            ))}
            {cuentas.length === 0 ? (
              <p className="text-[0.78rem] text-fg-faint">Sin cuentas.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cuentas.map((row) => (
                  <Tarjeta
                    key={row.id}
                    row={row}
                    network={network}
                    vivas={cuentas.filter((c) => c.connected && c.id !== row.id)}
                  />
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
/**
 * `vivas` son las otras cuentas conectadas de la misma red: con ellas una tarjeta sin
 * credencial ofrece fusionarse. Es el caso de la identidad que dio otra app —TikTok, Meta
 * y compañía dan un id distinto por app—: al pasar del sandbox a la app real la misma
 * cuenta vuelve como fila nueva, y esta queda muerta con su historial colgando.
 */
function Tarjeta({ row, network, vivas }: { row: CuentaRow; network: string; vivas: CuentaRow[] }) {
  const [pending, startTransition] = useTransition()
  const [desconectada, setDesconectada] = useState(false)
  const [idCopiado, setIdCopiado] = useState(false)
  const [destino, setDestino] = useState(vivas[0]?.id ?? '')
  const [fusion, setFusion] = useState<{ texto: string; ok: boolean } | null>(null)
  const nombre = nombreDe(row)

  useEffect(() => {
    if (!desconectada) return
    const id = setTimeout(() => setDesconectada(false), AVISO_MS)
    return () => clearTimeout(id)
  }, [desconectada])

  useEffect(() => {
    if (!idCopiado) return
    const id = setTimeout(() => setIdCopiado(false), AVISO_MS)
    return () => clearTimeout(id)
  }, [idCopiado])

  // El id de esta cuenta: lo que `cuentas` de la carga masiva y de la API espera
  // cuando nombrar la red ya no alcanza porque hay dos conectadas de la misma. Con dos
  // cuentas de una red, es la única forma pública de conseguirlo para una recién
  // conectada — `GET /api/schedule/posts` solo trae ids de cuentas que ya tienen un
  // destino programado.
  function copiarId() {
    const clipboard = navigator.clipboard
    if (!clipboard) return
    clipboard
      .writeText(row.id)
      .then(() => setIdCopiado(true))
      .catch(() => {})
  }

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

  function fusionar() {
    const viva = vivas.find((v) => v.id === destino)
    if (!viva) return
    const seguir = window.confirm(
      `«${nombre}» se fusiona en «${nombreDe(viva)}»: sus posts, sus métricas y su historial de publicaciones pasan a esa cuenta, y esta tarjeta desaparece. No se puede deshacer. ¿Seguir?`,
    )
    if (!seguir) return
    startTransition(async () => {
      const resultado = await fusionarCuenta(row.id, viva.id)
      setFusion('error' in resultado ? { texto: resultado.error, ok: false } : { texto: `Fusionada en «${nombreDe(viva)}».`, ok: true })
    })
  }

  const fierro = estadoDelFierro(
    { connected: row.connected, expiraEn: row.expiresAt, ultimoError: row.lastSyncError, red: network },
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
      {/*
        El id de la cuenta, discreto: no es protagonista de la tarjeta, pero tiene que
        poder sacarse de ella. Es distinto del `externalId` de arriba (el id que le da
        la red): este es el que la carga masiva y la API esperan en `cuentas` cuando
        nombrar la red ya no alcanza.
      */}
      <button
        type="button"
        onClick={copiarId}
        title="Id de cuenta — para «cuentas» en la carga masiva o la API"
        className="mt-0.5 flex max-w-full items-center gap-1 font-mono text-[0.68rem] text-fg-faint transition-colors hover:text-fg-muted"
      >
        <span className="truncate">{row.id}</span>
        {idCopiado ? (
          <Check className="h-3 w-3 shrink-0" style={{ color: POSITIVE }} aria-hidden />
        ) : (
          <Copy className="h-3 w-3 shrink-0" aria-hidden />
        )}
        <span className="sr-only">Copiar id de cuenta</span>
      </button>
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
        {fusion ? (
          <p className={cn('mt-2 text-[0.72rem]', fusion.ok ? 'text-fg-muted' : 'text-caution')}>{fusion.texto}</p>
        ) : null}
      </div>
      {/*
        Sin credencial y con otra cuenta viva de esta red: casi siempre es la misma persona
        con el id que le dio otra app (al salir del sandbox, por ejemplo). Fusionar es lo que
        conserva sus números en vez de empezar de cero; se ofrece solo aquí, donde ya no hay
        nada que reconectar.
      */}
      {!row.connected && !fusion?.ok && vivas.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[0.72rem] text-fg-muted">
            ¿Es la misma cuenta con otro identificador? Fusiónala y su historial pasa a la viva.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              disabled={pending}
              aria-label="Cuenta en la que se fusiona"
              className="chapa rounded-lg bg-transparent px-2 py-1 text-[0.75rem] text-fg"
            >
              {vivas.map((v) => (
                <option key={v.id} value={v.id}>
                  {nombreDe(v)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fusionar}
              disabled={pending}
              className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              {pending ? 'Fusionando…' : 'Es la misma cuenta →'}
            </button>
          </div>
        </div>
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
