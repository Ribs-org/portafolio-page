'use client'

import { useActionState } from 'react'
import { uploadBatch } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const PLANTILLA = `fecha,texto,redes,media,portada
2026-09-03 10:00,"Mi primer post en lote",threads|x,,
2026-09-03 18:30,"Con foto, y con coma",instagram|facebook,https://ejemplo.com/foto.jpg,
2026-09-08 19:00,"Mi corto",instagram|youtube,https://ejemplo.com/corto.mp4,https://ejemplo.com/portada.jpg`

export function BatchUpload() {
  const [state, action, pending] = useActionState(uploadBatch, {})

  return (
    <details className="rounded-xl bg-white/[0.03] p-4">
      <summary className="cursor-pointer text-sm font-medium">Carga masiva (CSV)</summary>

      <form action={action} className="mt-4 space-y-4">
        <p className="text-[0.8rem] leading-relaxed text-fg-faint">
          Una fila por post: fecha en tu zona horaria, texto entre comillas si lleva
          comas, redes y URLs de media separadas por <code>|</code>, y portada
          (opcional, JPG/PNG, solo con video) como quinta columna. Máximo 50 filas.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-white/[0.06] p-3 text-xs text-fg-muted">{PLANTILLA}</pre>

        <input type="file" name="archivo" accept=".csv,text/csv" className="block text-sm text-fg-muted" />

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15] disabled:opacity-50"
        >
          {pending ? 'Cargando…' : 'Cargar lote'}
        </button>
      </form>

      {state.filas && (
        <ul className="mt-4 space-y-1">
          {state.filas.map((fila) => (
            <li
              key={fila.fila}
              className={cn('text-sm', fila.ok ? 'text-emerald-300' : 'text-red-300')}
            >
              Fila {fila.fila}: {fila.detalle}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
