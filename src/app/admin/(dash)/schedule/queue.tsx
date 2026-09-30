'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { deleteScheduledPost, subirAhora } from '@/app/admin/actions'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { cn } from '@/lib/utils'
import { nombreDestino } from './etiqueta'
import { cortarCola } from './orden'
import { Redes } from './redes'
import { Reprogramar } from './reprogramar'

// El mismo corte que la tabla de contenido: de entrada solo las primeras veinte, que
// casi siempre alcanzan para todo lo pendiente. El resto espera detrás del botón.
const VISTA_PREVIA = 20

export function Queue({
  items,
  volver,
  zone,
}: {
  items: Array<{ post: ScheduledPost; targets: Array<ScheduledPostTarget & { handle: string | null }> }>
  volver: string
  zone: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Lo que devolvió «Subir ahora»: cuántos destinos salieron y cuántos quedaron en proceso.
  const [aviso, setAviso] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-faint">Nada programado todavía.</p>
  }

  const { visibles, ocultos } = cortarCola(items, VISTA_PREVIA)
  const mostrados = expanded ? items : visibles

  return (
    <>
      {error && <p className="mb-3 text-sm text-negative">{error}</p>}
      {aviso && <p className="mb-3 text-sm text-positive">{aviso}</p>}
      <ul className="space-y-3">
      {mostrados.map(({ post, targets }) => (
        <li key={post.id} className="rounded-xl bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm">{post.caption || '(sin texto)'}</p>
              <p className="mt-1 text-xs text-fg-faint">
                {/* La zona llega por prop, como al calendario: `SITE_TIMEZONE` vive en
                    `analytics.ts`, que trae `server-only` y no cruza a un cliente. Sin
                    ella, en Vercel (UTC) la cola decía una hora y El Fuego y el calendario
                    otra para el mismo corte, y ahora las tres listan lo quemado. */}
                {post.scheduledAt.toLocaleString('es-CL', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: zone,
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                className="text-xs text-fg-faint hover:text-fg"
              >
                Editar
              </Link>
              {/* También en las fallidas: la acción las devuelve a pendiente antes de publicar. */}
              {targets.some(
                (t) => t.status === 'scheduled' || t.status === 'publishing' || t.status === 'failed',
              ) ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm('¿Subirlo ahora, sin esperar la hora programada? Se publica en tus redes de inmediato.')) return
                    start(async () => {
                      setError(null)
                      setAviso(null)
                      const result = await subirAhora(post.id)
                      if (result.error) setError(result.error)
                      else if (result.ok) setAviso(result.ok)
                    })
                  }}
                  className="text-xs text-fg-faint hover:text-fg"
                >
                  {pending ? 'Subiendo…' : 'Subir ahora'}
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { setError(null); const result = await deleteScheduledPost(post.id); if (result.error) setError(result.error) })}
                className="text-xs text-fg-faint hover:text-fg"
              >
                Eliminar
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {targets.map((target) => (
              <span
                key={target.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  target.status === 'published' && 'bg-positive/15 text-positive',
                  target.status === 'failed' && 'bg-negative/15 text-negative',
                  (target.status === 'scheduled' || target.status === 'publishing') &&
                    'bg-white/[0.08] text-fg-muted',
                )}
              >
                <Redes targets={[target]} detalle />
                {target.status === 'failed' && target.lastError && ` — ${target.lastError}`}
                {target.status === 'failed' && <Reprogramar targetId={target.id} titulo={nombreDestino(target)} />}
              </span>
            ))}
          </div>
        </li>
      ))}
      </ul>
      {ocultos > 0 ? (
        <div className="mt-3 border-t border-white/[0.06] pt-2 text-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded px-2 py-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-fg-faint transition-colors hover:text-fg"
          >
            {expanded
              ? 'Mostrar menos'
              : ocultos === 1
                ? 'Ver el restante'
                : `Ver los ${ocultos} restantes`}
          </button>
        </div>
      ) : null}
    </>
  )
}
