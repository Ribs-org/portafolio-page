'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { descartarComentario, reintentarBorrador, responderComentario } from '@/app/admin/actions'
import { Empty } from '@/components/charts/panel'
import { Button, Textarea } from '@/components/ui'
import type { DmState } from '@/db/schema'
import type { ComentarioFila, EstadoCola } from '@/lib/comentarios-cola'
import { agruparPorPublicacion } from '@/lib/social/comentarios/agrupar'
import { networkLabel } from '@/lib/networks'

const ETIQUETA_DM: Record<DmState, string> = {
  no: '',
  pendiente: 'pendiente',
  enviado: 'enviado',
  fallido: 'no salió',
}

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function hace(fecha: Date): string {
  const horas = Math.round((Date.now() - fecha.getTime()) / 3.6e6)
  if (horas < 1) return 'recién'
  if (horas < 24) return RELATIVE.format(-horas, 'hour')
  return RELATIVE.format(-Math.round(horas / 24), 'day')
}

export function Cola({
  filas,
  mostrarPrivado,
  estado,
}: {
  filas: ComentarioFila[]
  mostrarPrivado: boolean
  estado: EstadoCola
}) {
  if (filas.length === 0) {
    const cronico = estado === 'pendientes' || estado === 'todos'
    return (
      <Empty>
        No hay comentarios aquí.{cronico ? ' Los nuevos llegan cada cinco minutos.' : ''}
      </Empty>
    )
  }
  const grupos = agruparPorPublicacion(filas)
  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const primero = g.comentarios[0]
        return (
          <section key={g.postExternalId} className="space-y-3">
            <header className="flex items-start gap-3">
              {primero.postThumbnailUrl ? (
                <Image
                  src={primero.postThumbnailUrl}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-fg-faint">
                  {networkLabel(primero.network)}
                  {primero.accountHandle ? ` · ${primero.accountHandle}` : ''}
                </p>
                {primero.postPermalink ? (
                  <a href={primero.postPermalink} target="_blank" rel="noreferrer" className="hover:text-fg">
                    <p className="line-clamp-2 text-sm text-fg-muted">{primero.postCaption ?? '(sin texto)'}</p>
                  </a>
                ) : (
                  <p className="line-clamp-2 text-sm text-fg-muted">{primero.postCaption ?? '(sin texto)'}</p>
                )}
                {primero.reglaPalabra ? (
                  <p className="text-[0.72rem] text-fg-faint">Palabra clave: {primero.reglaPalabra.toUpperCase()}</p>
                ) : null}
              </div>
            </header>
            {g.comentarios.map((c) => (
              <Tarjeta key={c.id} fila={c} mostrarPrivado={mostrarPrivado} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

function Tarjeta({ fila, mostrarPrivado }: { fila: ComentarioFila; mostrarPrivado: boolean }) {
  const editable = fila.state === 'pendiente' || fila.state === 'fallido'
  const [texto, setTexto] = useState(fila.draft ?? '')
  // «Reintentar borrador» escribe el borrador en el servidor y `revalidatePath` vuelve a
  // renderizar con la misma key: sin esto la caja se queda vacía aunque el borrador llegó.
  const [previo, setPrevio] = useState(fila.draft)
  if (fila.draft !== previo) {
    setPrevio(fila.draft)
    setTexto(fila.draft ?? '')
  }
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function enviar() {
    setError(null)
    startTransition(async () => {
      const r = await responderComentario(fila.id, texto)
      if (r.error) setError(r.error)
    })
  }
  function descartar() {
    if (!confirm('¿Descartar este comentario? No se va a responder.')) return
    startTransition(async () => {
      await descartarComentario(fila.id)
    })
  }
  function reintentar() {
    setError(null)
    startTransition(async () => {
      const r = await reintentarBorrador(fila.id)
      if (r.error) setError(r.error)
    })
  }

  return (
    <article className="chapa rounded-xl p-4">
      <p className="text-[0.78rem] text-fg-faint">
        <span className="text-fg">{fila.author ?? 'Alguien'}</span> · {hace(fila.publishedAt)}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{fila.text}</p>
      {editable ? (
        <>
          {fila.draft === null && fila.draftError ? (
            <p className="mt-3 text-sm text-negative">{fila.draftError}</p>
          ) : null}
          {fila.automatico && fila.state === 'fallido' ? (
            <p className="mt-3 text-[0.72rem] text-fg-faint">
              La regla de palabra clave intentó responder y la red no aceptó; «Enviar» lo reintenta.
            </p>
          ) : null}
          <Textarea
            aria-label="Tu respuesta"
            className="mt-3"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={pending}
          />
          {fila.state === 'fallido' && fila.error ? (
            <p className="mt-2 text-sm text-negative">{fila.error}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={enviar} disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar'}
            </Button>
            <Button variant="ghost" onClick={descartar} disabled={pending}>Descartar</Button>
            {fila.draft === null ? (
              <Button variant="ghost" onClick={reintentar} disabled={pending}>Reintentar borrador</Button>
            ) : null}
            {error ? <span role="alert" className="text-sm text-negative">{error}</span> : null}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-1 text-sm">
          {fila.state === 'enviado' ? (
            <p className="text-fg-muted">
              <span className="text-positive">Respondido:</span> {fila.draft}
              {fila.automatico ? (
                <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[0.68rem] text-fg-faint">
                  Automática
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-fg-faint">Descartado{fila.error ? ` · ${fila.error}` : ''}</p>
          )}
          {mostrarPrivado && fila.dmState !== 'no' ? (
            <p className="text-fg-faint">
              Privado: {ETIQUETA_DM[fila.dmState]}{fila.dmError ? ` · ${fila.dmError}` : ''}
            </p>
          ) : null}
        </div>
      )}
    </article>
  )
}
