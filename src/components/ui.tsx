'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

const CONTROL =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none transition-colors placeholder:text-fg-faint focus:border-white/25'

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
      <span className="mb-1.5 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fg-faint">
        {label}
      </span>
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
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-white/40' : 'bg-white/10',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-fg transition-transform',
            checked ? 'translate-x-[1.15rem]' : 'translate-x-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer select-none">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-[0.72rem] text-fg-faint">{hint}</span> : null}
      </label>
      {name ? <input type="hidden" name={name} value={checked ? 'on' : ''} /> : null}
    </div>
  )
}
