'use client'

import { useState, useTransition } from 'react'
import { rescheduleTarget } from '@/app/admin/actions'
import { Button, Input } from '@/components/ui'

/**
 * Le da hora nueva a un destino que se quemó: el botón, el campo, la llamada y su error,
 * todo en una pieza. Solo necesita saber de qué destino habla.
 *
 * El formulario sale flotando bajo el botón en vez de empujar lo que lo rodea. Es lo que
 * le permite vivir dentro de la píldora del destino en la cola —un `datetime-local` ahí
 * adentro no cabe— y también en una fila de «Se quemó» sin pedirle nada a quien lo pinta.
 */
export function Reprogramar({ targetId }: { targetId: string }) {
  // La hora que lleva escrita, y si el formulario está a la vista.
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function openForm() {
    setOpen(true)
    setWhen('')
    setError(null)
  }

  function closeForm() {
    setOpen(false)
    setError(null)
  }

  function save() {
    start(async () => {
      setError(null)
      const result = await rescheduleTarget(targetId, when)
      if (result.error) setError(result.error)
      else closeForm()
    })
  }

  return (
    <span className="relative inline-block">
      <button type="button" disabled={pending} className="ml-2 underline" onClick={openForm}>
        Reprogramar
      </button>
      {open ? (
        // Los colores van dichos y no heredados: la píldora de un destino quemado pinta su
        // texto en rojo, y el formulario no es el error.
        <span className="absolute left-0 top-full z-10 mt-2 flex w-[20rem] max-w-[80vw] flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-acero-900/95 p-3 text-fg shadow-xl backdrop-blur">
          <Input
            type="datetime-local"
            aria-label="Nueva fecha y hora"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className="max-w-[16rem]"
          />
          <Button type="button" variant="primary" disabled={pending || when === ''} onClick={save}>
            Guardar
          </Button>
          <Button type="button" disabled={pending} onClick={closeForm}>
            Cancelar
          </Button>
          {error ? <span className="w-full text-sm text-negative">{error}</span> : null}
        </span>
      ) : null}
    </span>
  )
}
