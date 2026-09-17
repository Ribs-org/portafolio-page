'use client'

import { useId } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

// `color-scheme: dark` es para lo que dibuja el sistema y no el CSS: la lista desplegable de
// un `<select>` y el calendario de un `datetime-local`. Sin él salen con fondo claro y
// heredan el texto claro del panel, así que se leen blanco sobre blanco.
const CONTROL =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none transition-colors [color-scheme:dark] placeholder:text-fg-faint focus:border-white/25'

/**
 * Encabezado de un grupo de controles. `Field` rotula uno solo: su `<label>` alrededor
 * de varios dejaría el nombre apuntando al primero.
 */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fg-faint">
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <GroupLabel>{label}</GroupLabel>
      {children}
      {hint ? <span className="mt-1 block text-[0.72rem] text-fg-faint">{hint}</span> : null}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, 'resize-y', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CONTROL, props.className)} />
}

export function Button({
  variant = 'ghost',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-white/[0.12] text-fg hover:bg-white/[0.18]',
        variant === 'ghost' && 'border border-white/10 text-fg-muted hover:bg-white/[0.05] hover:text-fg',
        variant === 'danger' && 'border border-negative/30 text-negative hover:bg-negative/10',
        className,
      )}
    />
  )
}

/**
 * El botón que envía un formulario y lo dice: mientras el server action viaja se apaga
 * y se renombra con `pendingLabel`.
 *
 * Tiene que ser un componente aparte del `<form>` porque `useFormStatus` solo lee el
 * formulario que está por encima de quien lo llama — dentro del mismo componente que
 * renderiza el `<form>` devolvería siempre `pending: false`.
 *
 * `confirm` pregunta antes de enviar. El diálogo va en el click y no en el `onSubmit`
 * del formulario para que un «cancelar» no llegue nunca a encolar la acción.
 *
 * `icono` va aparte de los hijos porque es lo único que sobrevive al cambio de texto:
 * adentro de `children` desaparecería al llegar `pendingLabel`, y el botón encogería
 * justo cuando hay que mirarlo.
 */
export function Submit({
  children,
  icono,
  pendingLabel,
  confirm: question,
  variant = 'primary',
  onClick,
  disabled,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: 'primary' | 'ghost' | 'danger'
  icono?: React.ReactNode
  pendingLabel: string
  confirm?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      {...props}
      type="submit"
      variant={variant}
      disabled={pending || disabled}
      onClick={(event) => {
        if (question && !window.confirm(question)) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    >
      {icono}
      {pending ? pendingLabel : children}
    </Button>
  )
}

/**
 * The switch on its own, for rows that already say what it controls.
 *
 * `label` is the accessible name, never drawn. Anything that needs visible text
 * beside it wants `Toggle`, which composes this one — rendering an empty label
 * here would leave the parent's gap as dead space next to the switch.
 */
export function Switch({
  label,
  id,
  checked,
  onChange,
  className,
}: {
  label: string
  id?: string
  checked: boolean
  onChange: (value: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-white/40' : 'bg-white/10',
        className,
      )}
    >
      {/*
        `left-0` no es decorativo: sin él, la posición estática de un absoluto dentro de un
        botón la decide el `text-align: center` del botón, así que la perilla nacía centrada
        y al encenderse se salía de la pista. Con `left-0`, apagada queda a 2px del borde
        izquierdo y encendida a 2px del derecho (36 - 16 - 2 = 18px = 1.125rem).
      */}
      <span
        className={cn(
          'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-fg transition-transform',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function Toggle({
  label,
  hint,
  name,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  name?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      {/* mt-0.5 lines the switch up with the first line of the label, not the block. */}
      <Switch id={id} label={label} checked={checked} onChange={onChange} className="mt-0.5" />
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-[0.72rem] text-fg-faint">{hint}</span> : null}
      </label>
      {name ? <input type="hidden" name={name} value={checked ? 'on' : ''} /> : null}
    </div>
  )
}
