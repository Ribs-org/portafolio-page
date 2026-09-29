import Link from 'next/link'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { requireUser } from '@/lib/auth'
import { getCuentas } from '@/lib/posts'
import { addDays, contarPorDia, normalizeWeekParam } from '@/lib/schedule-week'
import { todosLosCortes } from '@/lib/social/publish/cortes'
import { cn } from '@/lib/utils'
import { Encabezado } from '@/components/ui'
import { Composer } from './composer'
import { BatchUpload } from './batch-upload'
import { ordenarCola } from './orden'
import { Queue } from './queue'
import { WeekCalendar } from './calendar'

export const dynamic = 'force-dynamic'

/**
 * Rebuilds the page URL flipping one key, carrying the rest — the content page's
 * `contentHref` mold. `mensaje` never carries over (one-shot OAuth outcome).
 */
function scheduleHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key in changes || key === 'mensaje') continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/admin/schedule?${query}` : '/admin/schedule'
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const calendarView = params.vista === 'calendario'
  const monday = normalizeWeekParam(
    typeof params.semana === 'string' ? params.semana : undefined,
    new Date(),
    SITE_TIMEZONE,
  )

  const { id: ownerId } = await requireUser()
  const cuentas = await getCuentas(ownerId)
  // La misma lectura que usa El Fuego (`social/publish/cortes.ts`): posts, destinos con
  // handle y media. Sin ventana: el calendario siempre mostró todo lo del dueño.
  const cortes = await todosLosCortes(ownerId)

  // Ordenados por fecha ascendente, que es lo que el calendario necesita dentro de
  // cada día. La lista los reordena aparte: ahí lo próximo va arriba.
  const items = cortes
  // `volver` carries the exact view to return to after editing — list or a given week.
  const volver = scheduleHref(params, {})

  // Lo que el compositor usa para decir cómo está el día que elegiste. Sale de estas
  // mismas filas y no de otra consulta, así el aviso y el calendario nunca se
  // contradicen. Solo lo que viene: no se puede programar en el pasado.
  const ahora = new Date()
  const carga = contarPorDia(
    items.map(({ post }) => post).filter((post) => post.scheduledAt >= ahora),
    SITE_TIMEZONE,
  )

  return (
    <>
      <header className="mb-6">
        <Encabezado ruta="/admin/schedule" />
      </header>

      <div className="space-y-6">
        <Composer carga={carga} cuentas={cuentas} />
        <BatchUpload />
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            {[
              { label: 'Lista', href: scheduleHref(params, { vista: null, semana: null }), active: !calendarView },
              { label: 'Calendario', href: scheduleHref(params, { vista: 'calendario' }), active: calendarView },
            ].map((tab) => (
              <Link
                key={tab.label}
                href={tab.href}
                className={cn(
                  'rounded-full px-2.5 py-1 font-mono text-[0.68rem] transition-colors',
                  tab.active ? 'bg-white/[0.14] text-fg' : 'bg-white/[0.05] text-fg-faint hover:text-fg',
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          {calendarView ? (
            <WeekCalendar
              monday={monday}
              items={items}
              zone={SITE_TIMEZONE}
              volver={volver}
              prevHref={scheduleHref(params, { vista: 'calendario', semana: addDays(monday, -7) })}
              nextHref={scheduleHref(params, { vista: 'calendario', semana: addDays(monday, 7) })}
            />
          ) : (
            <Queue items={ordenarCola(items)} volver={volver} />
          )}
        </div>
      </div>
    </>
  )
}
