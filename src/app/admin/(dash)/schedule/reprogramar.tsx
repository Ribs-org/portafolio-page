'use client'

import { useRef, useState, useTransition } from 'react'
import { rescheduleTarget } from '@/app/admin/actions'
import { Button, Input } from '@/components/ui'

/**
 * Le da hora nueva a un destino que se quemó: el botón, el campo, la llamada y su error,
 * todo en una pieza. Solo necesita saber de qué destino habla.
 *
 * `titulo` es opcional y solo se pinta: el panel nace centrado en la pantalla, lejos de la
 * fila que lo abrió, así que sin él no hay cómo saber de qué destino es la hora que se está
 * escribiendo cuando hay más de uno quemado.
 *
 * El formulario es un `<dialog>` abierto con `showModal()`, así que vive en la capa de
 * arriba: el navegador lo centra —no cuelga del botón, que en la píldora de la cola queda
 * donde haya cortado la última línea del error—, no desborda a 360 px, Esc lo cierra, el
 * foco no se escapa de adentro, y el velo se traga los clics. Eso último es el punto: con un
 * `popover` el clic que descarta además activaba lo que hubiera debajo, y debajo está el
 * «Eliminar» de la cola, que borra sin preguntar. El velo atenuado promete modalidad; un
 * diálogo modal la cumple.
 *
 * El padding va en el hijo y no en el `<dialog>` para que no quede un anillo alrededor del
 * contenido que sea del diálogo: ahí un clic contaría como «clic en el velo» y cerraría.
 *
 * Las clases dicen el color, el borde, el fondo y el centrado porque la hoja del navegador
 * pintaría el diálogo con borde sólido y fondo blanco, y su `margin: auto` —el que lo
 * centra— lo pierde contra el `margin: 0` que Tailwind le pone a todo; de ahí el `m-auto`.
 * El `display` en cambio no se toca: el que lo esconde cerrado sale de esa misma hoja, y una
 * regla de autor lo ganaría siempre.
 */
export function Reprogramar({ targetId, titulo }: { targetId: string; titulo?: string }) {
  const panel = useRef<HTMLDialogElement>(null)
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  /**
   * El formulario recién nacido. Se llama al abrir y al cerrar: al abrir porque lo que
   * llegó tarde —el error de un guardado que el usuario descartó— no puede quedar pintado
   * sobre un campo vacío, y al cerrar porque el diálogo no se desmonta y el evento de
   * apertura llega cuando el navegador ya pintó. Cuando ya está limpio no cuesta nada:
   * React corta el render por igualdad.
   */
  function limpiar() {
    setWhen('')
    setError(null)
  }

  function save() {
    start(async () => {
      setError(null)
      const result = await rescheduleTarget(targetId, when)
      if (result.error) setError(result.error)
      else panel.current?.close()
    })
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        className="ml-2 underline"
        onClick={() => {
          limpiar()
          panel.current?.showModal()
        }}
      >
        Reprogramar
      </button>
      <dialog
        ref={panel}
        // `close` llega por cualquier salida, también por la Esc que maneja el navegador.
        onClose={limpiar}
        // Un clic en el velo tiene al diálogo por destino; uno en el contenido, al hijo.
        onClick={(event) => {
          if (event.target === event.currentTarget) panel.current?.close()
        }}
        className="m-auto w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-acero-900/95 text-fg shadow-xl backdrop-blur backdrop:bg-acero-950/80"
      >
        <div className="p-3">
          {titulo ? <p className="mb-2 text-xs text-fg-faint">{titulo}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
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
            <Button type="button" disabled={pending} onClick={() => panel.current?.close()}>
              Cancelar
            </Button>
            {error ? <p className="w-full text-sm text-negative">{error}</p> : null}
          </div>
        </div>
      </dialog>
    </>
  )
}
