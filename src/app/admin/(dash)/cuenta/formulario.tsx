'use client'

import { useActionState } from 'react'
import { guardarCuenta, type FormState } from '@/app/admin/actions'
import { Field, Input, Select, Submit } from '@/components/ui'

export function FormularioCuenta({
  nombre,
  zona,
  zonas,
  ahora,
}: {
  nombre: string | null
  zona: string
  zonas: string[]
  /** «HH:MM» en `zona`, calculada en el servidor al pintar la página. */
  ahora: string
}) {
  // La acción va directa, sin envolverla en una función de este archivo: envuelta, React
  // ya no la reconoce como server action y deja de plantar los campos ocultos que hacen
  // que el formulario se envíe sin JavaScript. Mismo molde que «Invitar» en Los Maestros.
  const [state, action] = useActionState<FormState, FormData>(guardarCuenta, {})

  return (
    <form action={action} className="max-w-md space-y-4">
      <Field label="Nombre" hint="Con el que apareces en el panel. Puede quedar vacío.">
        <Input name="nombre" defaultValue={nombre ?? ''} />
      </Field>
      <Field label="Zona horaria">
        <Select name="zona" defaultValue={zona}>
          {zonas.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-fg-muted">
        Ahora son las {ahora} en {zona}.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pendingLabel="Guardando…">Guardar</Submit>
        {state.error ? (
          <p role="alert" className="text-sm text-negative">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-sm text-positive">Guardado.</p> : null}
      </div>
    </form>
  )
}
