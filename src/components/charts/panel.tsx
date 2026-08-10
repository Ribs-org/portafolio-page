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
