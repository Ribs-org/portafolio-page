'use client'

import { useActionState } from 'react'
import { guardarInstruccionesComentarios, type FormState } from '@/app/admin/actions'
import { Field, Submit, Textarea } from '@/components/ui'

const INICIAL: FormState = {}

export function Instrucciones({ valor, tope }: { valor: string; tope: number }) {
  const [state, action] = useActionState(guardarInstruccionesComentarios, INICIAL)
  return (
    <form action={action} className="space-y-3">
      <Field label="Cómo responde el modelo">
        <Textarea name="instrucciones" defaultValue={valor} rows={5} maxLength={tope} />
      </Field>
      <div className="flex items-center gap-3">
        <Submit pendingLabel="Guardando…">Guardar</Submit>
        {state.ok ? <span role="status" className="text-sm text-positive">Guardado.</span> : null}
        {state.error ? <span role="alert" className="text-sm text-negative">{state.error}</span> : null}
      </div>
    </form>
  )
}
