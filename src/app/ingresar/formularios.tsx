'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Submit } from '@/components/ui'
import { canjearCodigo, pedirCodigo, type FormState } from './acciones'

const CAMPO =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none placeholder:text-fg-faint focus:border-white/20'

export function FormularioCorreo() {
  const [state, action] = useActionState<FormState, FormData>(pedirCodigo, {})
  if (state.ok && state.correo) return <FormularioCodigo correo={state.correo} />
  return (
    <form action={action} className="mt-6 space-y-3">
      <label htmlFor="correo" className="sr-only">Correo</label>
      <input id="correo" name="correo" type="email" autoFocus autoComplete="email" inputMode="email" placeholder="tu@correo.cl" className={CAMPO} />
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      {/* El acento del login no es un `variant` del panel: lo pinta el mismo `--accent` del perfil, y por eso viaja en `style` y no en clases. */}
      <Submit
        pendingLabel="Enviando…"
        className="surface surface-hover w-full px-4 py-2.5"
        style={{ background: 'rgb(var(--accent) / 0.18)', borderColor: 'rgb(var(--accent) / 0.4)' }}
      >
        Mandarme un código
      </Submit>
    </form>
  )
}

export function FormularioCodigo({ correo }: { correo: string }) {
  const [state, action] = useActionState<FormState, FormData>(canjearCodigo, {})
  return (
    <form action={action} className="mt-6 space-y-3">
      <p className="text-sm text-fg-muted">Si {correo} está invitado, te llegó un código de seis dígitos. Vale diez minutos.</p>
      <input type="hidden" name="correo" value={correo} />
      <label htmlFor="codigo" className="sr-only">Código</label>
      <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus placeholder="000000" className={`${CAMPO} tracking-[0.4em]`} />
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      <Submit
        pendingLabel="Entrando…"
        className="surface surface-hover w-full px-4 py-2.5"
        style={{ background: 'rgb(var(--accent) / 0.18)', borderColor: 'rgb(var(--accent) / 0.4)' }}
      >
        Entrar
      </Submit>
      <Link href="/ingresar" className="block text-center text-xs text-fg-faint hover:text-fg">Usar otro correo</Link>
    </form>
  )
}
