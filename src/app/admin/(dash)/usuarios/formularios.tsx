'use client'

import { useActionState, useState, useTransition } from 'react'
import { invitarUsuario, quitarUsuario, type FormState } from '@/app/admin/actions'
import { Button, Field, Input, Submit } from '@/components/ui'

export function FormularioInvitar() {
  const [state, action] = useActionState<FormState, FormData>(invitarUsuario, {})
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Correo"><Input name="correo" type="email" required className="min-w-[16rem]" /></Field>
      <Field label="Nombre (opcional)"><Input name="nombre" className="min-w-[12rem]" /></Field>
      <Submit pendingLabel="Invitando…">Invitar</Submit>
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-positive">Invitado. Le llegó su primer código.</p> : null}
    </form>
  )
}

export function BotonQuitar({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button variant="ghost" disabled={pending} onClick={() => { if (!confirm('¿Quitar la invitación?')) return; start(async () => { const r = await quitarUsuario(id); setError(r.error ?? null) }) }}>
        Quitar
      </Button>
      {error ? <span role="alert" className="text-xs text-negative">{error}</span> : null}
    </>
  )
}
