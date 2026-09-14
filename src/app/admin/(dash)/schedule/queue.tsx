'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { deleteScheduledPost, rescheduleTarget } from '@/app/admin/actions'
import { Button, Input } from '@/components/ui'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

// El corte de la tabla de contenido, por la misma razón: lo pendiente cabe entero
// arriba y lo ya publicado no tiene por qué alargar la página para siempre.
const VISTA_PREVIA = 20

export function Queue({
  items,
  volver,
}: {
  items: Array<{ post: ScheduledPost; targets: ScheduledPostTarget[] }>
  volver: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // El destino que está pidiendo hora nueva, y la hora que lleva escrita. Uno solo a
  // la vez: abrir otro cierra el anterior sin dejar dos fechas a medio llenar.
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [when, setWhen] = useState('')
  const [expanded, setExpanded] = useState(false)

  function openReschedule(targetId: string) {
    setRescheduling(targetId)
    setWhen('')
  }

  function saveReschedule(targetId: string) {
    start(async () => {
      setError(null)
      const result = await rescheduleTarget(targetId, when)
      if (result.error) setError(result.error)
      else setRescheduling(null)
    })
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-faint">Nada programado todavía.</p>
  }

  const visible = expanded ? items : items.slice(0, VISTA_PREVIA)
  const ocultos = items.length - visible.length

  return (
    <>
      {error && <p className="mb-3 text-sm text-negative">{error}</p>}
      <ul className="space-y-3">
      {visible.map(({ post, targets }) => {
        // El formulario de hora nueva vive bajo el post dueño del destino, no dentro
        // de la píldora: un `datetime-local` ahí adentro no cabe.
        const reprogramando = targets.find((target) => target.id === rescheduling)?.id
        return (
        <li key={post.id} className="rounded-xl bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm">{post.caption || '(sin texto)'}</p>
              <p className="mt-1 text-xs text-fg-faint">
                {post.scheduledAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                className="text-xs text-fg-faint hover:text-fg"
              >
                Editar
              </Link>
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
                {networkLabel(target.network)}: {STATUS_LABEL[target.status]}
                {target.status === 'failed' && target.lastError && ` — ${target.lastError}`}
                {target.status === 'failed' && (
                  <button
                    type="button"
                    disabled={pending}
                    className="ml-2 underline"
                    onClick={() => openReschedule(target.id)}
                  >
                    Reprogramar
                  </button>
                )}
              </span>
            ))}
          </div>
          {reprogramando ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                type="datetime-local"
                aria-label="Nueva fecha y hora"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                className="max-w-[16rem]"
              />
              <Button
                type="button"
                variant="primary"
                disabled={pending || when === ''}
                onClick={() => saveReschedule(reprogramando)}
              >
                Guardar
              </Button>
              <Button type="button" onClick={() => setRescheduling(null)}>Cancelar</Button>
            </div>
          ) : null}
        </li>
        )
      })}
      </ul>
      {ocultos > 0 || expanded ? (
        <div className="mt-3 border-t border-white/[0.06] pt-2 text-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded px-2 py-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-fg-faint transition-colors hover:text-fg"
          >
            {expanded
              ? 'Mostrar menos'
              : ocultos === 1
                ? 'Ver el anterior'
                : `Ver los ${ocultos} anteriores`}
          </button>
        </div>
      ) : null}
    </>
  )
}
