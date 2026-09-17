import { requireUser } from '@/lib/auth'
import { logout } from '../actions'
import { AdminNav } from './nav'

export const metadata = { title: 'Panel', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUser()

  return (
    <div className="min-h-dvh">
      <div className="aurora opacity-40" aria-hidden>
        <span />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <span className="font-display text-sm font-semibold tracking-[-0.01em]">Panel</span>
          <AdminNav esAdmin={usuario.rol === 'admin'} />
          <form action={logout} className="ml-auto">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-xs text-fg-faint transition-colors hover:text-fg"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
