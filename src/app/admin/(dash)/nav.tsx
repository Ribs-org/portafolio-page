'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ajustes, pantallaDe, pestanas } from '@/lib/vocabulario'
import { cn } from '@/lib/utils'

/**
 * Cinco pestañas y un engranaje. Lo que no pide una acción todos los días —las cuentas, las
 * páginas públicas, quién entra— va dentro de Ajustes: sigue a un clic, pero ya no ocupa la
 * barra. Los nombres y las rutas salen del vocabulario; acá no se escribe ninguno.
 */
export function AdminNav({ esAdmin }: { esAdmin?: boolean }) {
  const pathname = usePathname()
  const actual = pantallaDe(pathname)
  const enAjustes = actual?.grupo === 'ajustes'

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Secciones del panel">
      <div className="flex items-center gap-1 overflow-x-auto">
        {pestanas(Boolean(esAdmin)).map((p) => {
          const active = actual?.ruta === p.ruta
          return (
            <Link
              key={p.ruta}
              href={p.ruta}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                active ? 'bg-brasa text-acero-950' : 'text-fg-muted hover:text-fg',
              )}
            >
              {p.nombre}
            </Link>
          )
        })}
      </div>

      {/*
        Un `<details>`: sin estado, sin JavaScript, con teclado. Se cierra solo al navegar
        porque la página cambia. Una ruta de Ajustes activa marca el engranaje, no una
        pestaña — el usuario tiene que poder ver dónde está aunque el menú esté cerrado.
      */}
      <details className="relative ml-auto">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors [&::-webkit-details-marker]:hidden',
            enAjustes ? 'bg-brasa text-acero-950' : 'text-fg-muted hover:text-fg',
          )}
          aria-label="Ajustes"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ajustes</span>
        </summary>
        <ul className="chapa absolute right-0 z-40 mt-2 w-64 rounded-xl p-2">
          {ajustes(Boolean(esAdmin)).map((p) => {
            const active = actual?.ruta === p.ruta
            return (
              <li key={p.ruta}>
                <Link
                  href={p.ruta}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-2 transition-colors',
                    active ? 'bg-brasa text-acero-950' : 'hover:bg-white/[0.06]',
                  )}
                >
                  <span className="block text-sm">{p.nombre}</span>
                  <span className={cn('block text-[0.72rem]', active ? 'text-acero-950/80' : 'text-fg-faint')}>
                    {p.subtitulo}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </details>
    </nav>
  )
}
