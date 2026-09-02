'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteScheduledPost, updateScheduledPost, type FormState } from '@/app/admin/actions'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

// Twin of ENABLED in the composer (schedule/composer.tsx) — update both together.
const NETWORKS = ['instagram', 'facebook', 'youtube', 'threads', 'x']

type MediaRow = { id: string; blobUrl: string; mediaType: string }

export function Editor({
  postId,
  volver,
  caption,
  scheduledAtLocal,
  targets,
  media,
  coverUrl,
}: {
  postId: string
  volver: string
  caption: string
  scheduledAtLocal: string
  targets: Array<{ network: string; status: string }>
  media: MediaRow[]
  coverUrl: string | null
}) {
  const publishing = targets.some((t) => t.status === 'publishing')
  const published = new Set(targets.filter((t) => t.status === 'published').map((t) => t.network))
  const initialNetworks = new Set(targets.map((t) => t.network))

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
        <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">Editar post</h1>
        <Link href={volver} className="text-sm text-fg-faint transition-colors hover:text-fg">
          ← Volver
        </Link>
      </div>

      {publishing ? (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Hay una publicación en curso. Vuelve en un minuto.
        </p>
      ) : null}
      {published.size > 0 ? (
        <p className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Ya publicado en {[...published].map(networkLabel).join(', ')}. Los cambios no tocan lo
          publicado.
        </p>
      ) : null}

      <form action={formAction}>
        <fieldset disabled={publishing || pending} className="space-y-4">
          <input type="hidden" name="volver" value={volver} />
          <label className="block">
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Texto
            </span>
            <textarea
              name="caption"
              defaultValue={caption}
              rows={4}
              className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-fg outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Fecha y hora
            </span>
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={scheduledAtLocal}
              className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-fg outline-none"
            />
          </label>

          <div>
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Redes
            </span>
            <div className="flex flex-wrap gap-3">
              {NETWORKS.map((network) => {
                const locked = published.has(network)
                return (
                  <label key={network} className={cn('flex items-center gap-1.5 text-sm', locked && 'opacity-70')}>
                    {/* A disabled checkbox never submits; the hidden twin keeps the
                        published network in the form so the server guard stays a
                        backstop, not the primary path. */}
                    {locked ? <input type="hidden" name="networks" value={network} /> : null}
                    <input
                      type="checkbox"
                      name="networks"
                      value={network}
                      defaultChecked={initialNetworks.has(network)}
                      disabled={locked}
                    />
                    {networkLabel(network)}
                    {locked ? ' ✓' : ''}
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Media
            </span>
            {kept.length > 0 ? (
              <ul className="mb-2 space-y-2">
                {kept.map((m, index) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                    <input type="hidden" name="keptMedia" value={m.id} />
                    {m.mediaType === 'image' ? (
                      <Image src={m.blobUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded bg-white/[0.08] font-mono text-[0.6rem] text-fg-faint">
                        video
                      </span>
                    )}
                    <span className="flex-1 truncate text-xs text-fg-faint">{m.blobUrl}</span>
                    <button type="button" onClick={() => move(index, -1)} className="text-fg-faint hover:text-fg">↑</button>
                    <button type="button" onClick={() => move(index, 1)} className="text-fg-faint hover:text-fg">↓</button>
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
            <label className="block text-sm">
              Agregar archivos
              <input type="file" name="media" multiple accept="image/*,video/*" className="mt-1 block text-xs" />
            </label>
            <label className="mt-2 block text-sm">
              Agregar por URL (una por línea)
              <textarea
                name="mediaUrls"
                rows={2}
                placeholder="https://…"
                className="mt-1 w-full rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-fg outline-none"
              />
            </label>
          </div>

          <div>
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Portada (solo para video)
            </span>
            {keptCover ? (
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                <input type="hidden" name="keepPortada" value={keptCover} />
                <Image src={keptCover} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" />
                <span className="flex-1 truncate text-xs text-fg-faint">{keptCover}</span>
                <button type="button" onClick={() => setKeptCover(null)} className="text-xs text-fg-faint hover:text-fg">
                  Quitar
                </button>
              </div>
            ) : null}
            <label className="block text-sm">
              {keptCover ? 'Cambiar por URL' : 'Agregar por URL'}
              <input
                type="text"
                name="portadaUrl"
                placeholder="https://…/portada.jpg"
                className="mt-1 w-full rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-fg outline-none"
              />
            </label>
          </div>

          {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
          {deleteError ? <p className="text-sm text-red-400">{deleteError}</p> : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white/[0.12] px-4 py-2 text-sm text-fg transition-colors hover:bg-white/[0.18]"
            >
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  setDeleteError(null)
                  const result = await deleteScheduledPost(postId)
                  if (result.error) setDeleteError(result.error)
                  else router.push(volver)
                })
              }
              className="text-sm text-fg-faint transition-colors hover:text-red-300"
            >
              Eliminar
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
