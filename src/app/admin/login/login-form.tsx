'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { login, type FormState } from '../actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="surface surface-hover mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
      style={{ background: 'rgb(var(--accent) / 0.18)', borderColor: 'rgb(var(--accent) / 0.4)' }}
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(login, {})

  return (
    <form action={formAction} className="mt-6">
      <label htmlFor="password" className="sr-only">
        Contraseña
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Contraseña"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none placeholder:text-fg-faint focus:border-white/20"
      />
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-negative">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}
