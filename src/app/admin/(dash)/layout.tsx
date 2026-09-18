import { requireUser } from '@/lib/auth'
import { logout } from '../actions'
import { AdminNav } from './nav'

export const metadata = { title: 'Panel', robots: { index: false, follow: false } }
// Calza la barra del navegador del teléfono con el acero del panel — el layout raíz
// se queda en el fondo viejo porque ese es el de la página pública.
export const viewport = { themeColor: '#16181a' }
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUser()

  return (
    <div className="acerado min-h-dvh bg-acero-950">
      <header className="sticky top-0 z-30 border-b border-acero-700 bg-acero-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <span className="font-titulo text-sm font-semibold uppercase tracking-[0.1em]">Panel</span>
          <AdminNav esAdmin={usuario.rol === 'admin'} />
          <form action={logout} className="ml-auto">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-xs font-titulo uppercase tracking-[0.1em] text-fg-faint transition-colors hover:text-fg"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="reja mx-auto max-w-6xl" aria-hidden />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
