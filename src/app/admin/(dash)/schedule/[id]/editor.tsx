'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, ExternalLink } from 'lucide-react'
import { deleteScheduledPost, updateScheduledPost, type FormState } from '@/app/admin/actions'
import { Button, Field, GroupLabel, Input, Textarea } from '@/components/ui'
import { networkLabel } from '@/lib/networks'
import type { CuentaRow } from '@/lib/posts-kpis'
import { cn } from '@/lib/utils'
import { ReglaClave } from '../regla-clave'

// Gemelo de PUBLISHABLE (publish/batch.ts) y de ENABLED en el compositor
// (schedule/composer.tsx). `tiktok` no se ofrece aquí porque el editor no puede
// pedir sus opciones; un destino existente se dibuja vía `drawnIds`, aunque su
// cuenta sea de tiktok o ya no esté entre las ofertables.
const ENABLED_NETWORKS = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x'])

type MediaRow = { id: string; blobUrl: string; mediaType: string }

export function Editor({
  postId,
  volver,
  caption,
  scheduledAtLocal,
  cuentas,
  targets,
  media,
  coverUrl,
  atributos,
  regla,
}: {
  postId: string
  volver: string
  caption: string
  scheduledAtLocal: string
  cuentas: CuentaRow[]
  targets: Array<{ accountId: string; network: string; status: string; opciones: string | null }>
  media: MediaRow[]
  coverUrl: string | null
  atributos: string
  regla: { palabra: string; mensaje: string; respuestaPublica: string } | null
}) {
  const publishing = targets.some((t) => t.status === 'publishing')
  const published = new Set(targets.filter((t) => t.status === 'published').map((t) => t.accountId))
  const initialAccountIds = new Set(targets.map((t) => t.accountId))
  const porId = new Map(cuentas.map((c) => [c.id, c]))
  // Respaldo para una cuenta que no aparece en `cuentas` (hoy inalcanzable: la fila de
  // `social_accounts` no se puede borrar mientras un destino la referencie), para poder
  // seguir nombrando su red sin la cuenta.
  const networkPorAccountId = new Map(targets.map((t) => [t.accountId, t.network]))
  // Las cuentas que se pueden agregar desde el editor: `tiktok` no se ofrece porque no
  // puede pedir sus opciones acá, igual que antes con la red. Un destino que ya existe
  // se dibuja aunque su cuenta no se pueda agregar (una de tiktok, o desconectada).
  const ofertables = cuentas.filter((c) => ENABLED_NETWORKS.has(c.network))
  const drawnIds = [...new Set([...ofertables.map((c) => c.id), ...targets.map((t) => t.accountId)])]
  const resumen = new Map(targets.map((t) => [t.accountId, t.opciones]))

  const [kept, setKept] = useState<MediaRow[]>(media)
  const [keptCover, setKeptCover] = useState(coverUrl)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateScheduledPost.bind(null, postId),
    {},
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const router = useRouter()

  function move(index: number, delta: number) {
    const next = [...kept]
    const swap = index + delta
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap]!, next[index]!]
    setKept(next)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-titulo text-xl font-semibold uppercase tracking-[0.03em]">Editar post</h1>
        <Link
          href={volver}
          className="inline-flex items-center gap-1 text-sm text-fg-faint transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver
        </Link>
      </div>

      {publishing ? (
        <p className="mb-4 rounded-xl bg-caution/10 px-4 py-3 text-sm text-caution">
          Hay una publicación en curso. Vuelve en un minuto.
        </p>
      ) : null}
      {published.size > 0 ? (
        <p className="mb-4 rounded-xl bg-positive/10 px-4 py-3 text-sm text-positive">
          Ya publicado en{' '}
          {[...published]
            .map((accountId) => {
              const cuenta = porId.get(accountId)
              return cuenta
                ? `${networkLabel(cuenta.network)} · ${cuenta.handle ?? 'sin nombre'}`
                : networkLabel(networkPorAccountId.get(accountId)!)
            })
            .join(', ')}
          . Los cambios no tocan lo publicado.
        </p>
      ) : null}

      <form action={formAction}>
        <fieldset disabled={publishing || pending} className="space-y-4">
          <input type="hidden" name="volver" value={volver} />
          <Field label="Texto">
            <Textarea name="caption" defaultValue={caption} rows={4} />
          </Field>

          <Field label="Fecha y hora">
            <Input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={scheduledAtLocal}
              className="max-w-[16rem]"
            />
          </Field>

          <div>
            <GroupLabel>Cuentas</GroupLabel>
            <div className="flex flex-wrap gap-3">
              {drawnIds.map((accountId) => {
                const cuenta = porId.get(accountId)
                const isPublished = published.has(accountId)
                const isExisting = initialAccountIds.has(accountId)
                // Una cuenta ajena a `cuentas` no se descarta: se dibuja bloqueada y
                // marcada, nombrando solo la red, para que su id siga viajando en el
                // formulario y el destino no desaparezca en silencio. Hoy es
                // inalcanzable (ver `networkPorAccountId`), pero la rama defensiva no
                // puede convertir «no la conozco» en «bórrala».
                const desconocida = !cuenta
                const locked = isPublished || desconocida
                const disconnected = cuenta != null && !cuenta.connected
                // Una cuenta desconectada que todavía no es destino no se puede
                // agregar, igual que en el compositor. Una que YA es destino se deja
                // interactuable: deshabilitarla la borraría en silencio al guardar
                // (un checkbox deshabilitado no manda su valor), justo lo que la rama
                // de arriba evita para las desconocidas.
                const disabled = locked || (disconnected && !isExisting)
                const linea = resumen.get(accountId)
                const label = cuenta
                  ? `${networkLabel(cuenta.network)} · ${cuenta.handle ?? 'sin nombre'}`
                  : networkLabel(networkPorAccountId.get(accountId)!)
                return (
                  <label
                    key={accountId}
                    className={cn('flex items-center gap-1.5 text-sm', (locked || disconnected) && 'opacity-70')}
                  >
                    {/* A disabled checkbox never submits; the hidden twin keeps a
                        bloqueada account (published or unknown) in the form so the
                        server guard stays a backstop, not the primary path. */}
                    {locked ? <input type="hidden" name="cuentas" value={accountId} /> : null}
                    <input
                      type="checkbox"
                      name="cuentas"
                      value={accountId}
                      defaultChecked={initialAccountIds.has(accountId)}
                      disabled={disabled}
                    />
                    {label}
                    {isPublished ? ' ✓' : ''}
                    {disconnected ? <span className="text-xs text-fg-faint"> reconéctala</span> : null}
                    {linea ? <span className="text-xs text-fg-faint">· {linea}</span> : null}
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <GroupLabel>Media</GroupLabel>
            {kept.length > 0 ? (
              <ul className="mb-2 space-y-2">
                {kept.map((m, index) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                    <input type="hidden" name="keptMedia" value={m.id} />
                    {m.mediaType === 'image' ? (
                      <Image src={m.blobUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      // preload="metadata" paints the first frame without pulling the
                      // whole file; controls make it a real in-place preview.
                      <video
                        src={m.blobUrl}
                        controls
                        preload="metadata"
                        muted
                        playsInline
                        className="h-24 w-40 shrink-0 rounded bg-black object-contain"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-fg-faint">{m.blobUrl}</span>
                    <MediaActions url={m.blobUrl} />
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      aria-label="Subir"
                      className="text-fg-faint transition-colors hover:text-fg"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      aria-label="Bajar"
                      className="text-fg-faint transition-colors hover:text-fg"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setKept(kept.filter((k) => k.id !== m.id))}
                      className="text-xs text-fg-faint hover:text-fg"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Field label="Agregar archivos">
              <Input type="file" name="media" multiple accept="image/*,video/*" />
            </Field>
            <div className="mt-2">
              <Field label="Agregar por URL" hint="Una por línea">
                <Textarea name="mediaUrls" rows={2} placeholder="https://…" />
              </Field>
            </div>
          </div>

          <div>
            <GroupLabel>Portada (solo para video)</GroupLabel>
            {keptCover ? (
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                <input type="hidden" name="keepPortada" value={keptCover} />
                <Image src={keptCover} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-fg-faint">{keptCover}</span>
                <MediaActions url={keptCover} />
                <button type="button" onClick={() => setKeptCover(null)} className="text-xs text-fg-faint hover:text-fg">
                  Quitar
                </button>
              </div>
            ) : null}
            <Field label={keptCover ? 'Cambiar por URL' : 'Agregar por URL'}>
              <Input type="text" name="portadaUrl" placeholder="https://…/portada.jpg" />
            </Field>
          </div>

          <ReglaClave inicial={regla} />

          <Field label="Atributos (JSON del editor de contenido)">
            <Textarea
              name="atributos"
              defaultValue={atributos}
              rows={3}
              placeholder='{"hook": "pregunta-polemica", "tema": "negocios"}'
              className="font-mono text-xs"
            />
          </Field>

          {state.error ? <p className="text-sm text-negative">{state.error}</p> : null}
          {deleteError ? <p className="text-sm text-negative">{deleteError}</p> : null}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  setDeleteError(null)
                  const result = await deleteScheduledPost(postId)
                  if (result.error) setDeleteError(result.error)
                  else router.push(volver)
                })
              }
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}

/**
 * Open-in-new-tab plus copy-to-clipboard for a Blob URL. The clipboard guard is the
 * CampaignCell precedent: an insecure context leaves `navigator.clipboard` undefined
 * and reading `.writeText` off it throws synchronously, past any `.catch`.
 */
function MediaActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  function copy() {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setFailed(true)
      return
    }
    clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setFailed(false)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => setFailed(true))
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir en una pestaña nueva"
        title="Abrir en una pestaña nueva"
        className="text-fg-faint transition-colors hover:text-fg"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
      {/* Ícono y no texto: los tres estados medían distinto y la fila saltaba de ancho
          cada vez que se copiaba una URL. El `title` dice lo que el ícono calla. */}
      <button
        type="button"
        onClick={copy}
        aria-label={failed ? 'No se pudo copiar la URL' : 'Copiar la URL'}
        title={copied ? 'Copiada' : failed ? 'No se pudo copiar' : 'Copiar la URL'}
        className={cn(
          'transition-colors hover:text-fg',
          failed ? 'text-negative' : 'text-fg-faint',
        )}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      </button>
    </span>
  )
}
