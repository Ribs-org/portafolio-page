'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/analytics', label: 'Analítica' },
  { href: '/admin/content', label: 'Contenido' },
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
              'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              active ? 'bg-white/[0.08] text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
