'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/analytics', label: 'Analítica' },
  { href: '/admin/content', label: 'Contenido' },
  { href: '/admin/comments', label: 'Comentarios' },
  { href: '/admin/accounts', label: 'Cuentas' },
  { href: '/admin/schedule', label: 'Calendario' },
  { href: '/admin/profiles', label: 'Perfiles' },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-white/[0.08] text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
            {/* El fondo al 8 % sobre el vidrio de la barra casi no se ve; la línea de
                acento es lo que de verdad dice en qué pestaña estás. */}
            {active ? (
              <span
                className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full"
                style={{ background: 'rgb(var(--accent))' }}
                aria-hidden
              />
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
