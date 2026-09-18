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

export function AdminNav({ esAdmin }: { esAdmin?: boolean }) {
  const pathname = usePathname()
  const tabs = esAdmin ? [...TABS, { href: '/admin/usuarios', label: 'Usuarios' }] : TABS

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-brasa text-acero-950' : 'text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
