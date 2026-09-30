'use client'

import { useId, useRef, useState, useTransition } from 'react'
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
 * El formulario es un `popover`, así que vive en la capa de arriba: el navegador lo centra
 * en la pantalla —no cuelga del botón, que en la píldora de la cola queda donde haya
 * cortado la última línea del error—, no desborda a 360 px ni tapa la fila siguiente, se
 * cierra con Esc y con un clic afuera sin un solo manejador, y abrir el de otro destino
 * cierra este. Todo eso lo pone la plataforma; acá solo queda el estado del formulario.
 *
 * Las clases dicen el color, el borde, el fondo y el centrado porque un `popover` no trae
 * ninguno de los dos primeros y pierde el tercero: la hoja del navegador lo pintaría con
 * borde sólido y fondo blanco, y lo centraría con `inset: 0; margin: auto`, pero el
 * `margin: 0` que Tailwind le pone a todo le gana y lo clavaría en la esquina de arriba a
 * la izquierda, encima de la barra. De ahí el `m-auto`. El `display` en cambio no se toca
 * — el que lo esconde cerrado sale de esa misma hoja, y una regla de autor lo ganaría
 * siempre.
 */
export function Reprogramar({ targetId, titulo }: { targetId: string; titulo?: string }) {
  const panelId = useId()
  const campoId = useId()
  const panel = useRef<HTMLSpanElement>(null)
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      setError(null)
      const result = await rescheduleTarget(targetId, when)
      if (result.error) setError(result.error)
      else panel.current?.hidePopover()
    })
  }

  return (
    <>
      <button type="button" disabled={pending} popoverTarget={panelId} className="ml-2 underline">
        Reprogramar
      </button>
      <span
        ref={panel}
        id={panelId}
        popover="auto"
        onToggle={(event) => {
          // El estado sigue al panel y no al revés: el navegador también lo abre y lo
          // cierra por su cuenta —Esc, un clic afuera, abrir el de otro destino—, y cada
          // cierre deja el formulario como recién nacido, que es lo que hacía
          // `closeReschedule` en la cola.
          if (event.newState === 'open') {
            // `Input` solo acepta las props del `<input>`, así que no hay `ref` que
            // pasarle — el mismo rodeo que hace el compositor con su textarea.
            document.getElementById(campoId)?.focus()
          } else {
            // Se limpia al cerrar y no al abrir: el panel ya no se desmonta, y el evento
            // llega después de que el navegador pintó, así que sembrar acá es lo único que
            // evita ver un cuadro la hora de la vez pasada.
            setWhen('')
            setError(null)
          }
        }}
        className="m-auto w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-acero-900/95 p-3 text-fg shadow-xl backdrop-blur backdrop:bg-acero-950/80"
      >
        {titulo ? <span className="mb-2 block text-xs text-fg-faint">{titulo}</span> : null}
        <span className="flex flex-wrap items-center gap-2">
          <Input
            id={campoId}
            type="datetime-local"
            aria-label="Nueva fecha y hora"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            className="max-w-[16rem]"
          />
          <Button type="button" variant="primary" disabled={pending || when === ''} onClick={save}>
            Guardar
          </Button>
          <Button type="button" disabled={pending} onClick={() => panel.current?.hidePopover()}>
            Cancelar
          </Button>
          {error ? <span className="w-full text-sm text-negative">{error}</span> : null}
        </span>
      </span>
    </>
  )
}
