import { cn } from '@/lib/utils'

export function Panel({
  title,
  hint,
  action,
  className,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('surface rounded-2xl p-5', className)}>
      <header className="mb-4 flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[0.95rem] font-semibold tracking-[-0.01em]">{title}</h2>
          {hint ? <p className="mt-0.5 text-[0.78rem] text-fg-faint">{hint}</p> : null}
        </div>
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-fg-faint">{children}</p>
}

/**
 * El hueco que deja un `Panel` mientras sus consultas viajan. Misma `.surface` y
 * mismas medidas que el de verdad, para que nada salte cuando llega el contenido.
 *
 * `animate-pulse` no necesita guardia propia: la regla de `prefers-reduced-motion`
 * en `globals.css` ya apaga toda animación del sitio.
 */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('surface animate-pulse rounded-2xl p-5', className)} aria-hidden>
      <div className="mb-4">
        <div className="h-[1.4rem] w-40 max-w-[60%] rounded bg-white/[0.06]" />
        <div className="mt-0.5 h-[1.15rem] w-72 max-w-full rounded bg-white/[0.035]" />
      </div>
      <div className="h-40 rounded-xl bg-white/[0.035]" />
    </div>
  )
}
