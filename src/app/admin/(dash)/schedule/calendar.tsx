import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { dayLabel, dayKey, groupByDay, hourLabel, weekDays, weekLabel } from '@/lib/schedule-week'
import { calorDelDia, coccionDe, type Coccion } from '@/lib/parrilla'
import { cn } from '@/lib/utils'

type Item = {
  post: ScheduledPost
  targets: ScheduledPostTarget[]
  media: Array<{ blobUrl: string; mediaType: string }>
}

/** Lo que dice la grilla de cada día, arriba a la derecha. */
const ROTULO_CALOR = {
  apagada: 'Apagada',
  prendida: 'Prendida',
  llena: 'Parrilla llena',
} as const

const CLASE_COCCION: Record<Coccion, string> = {
  cruda: 'corte-cruda',
  sellada: 'corte-sellada',
  punto: 'corte-punto',
  quemada: 'corte-quemada',
}

/**
 * Para el `title` y el lector de pantalla. La cocción es la segunda señal, no la única:
 * antes el estado vivía en puntos de color de 8 px que había que aprenderse, y el nombre
 * en palabras tiene que sobrevivir al cambio.
 */
const NOMBRE_COCCION: Record<Coccion, string> = {
  cruda: 'Programada',
  sellada: 'Saliendo ahora',
  punto: 'Publicada',
  quemada: 'Falló',
}

export function WeekCalendar({
  monday,
  items,
  zone,
  volver,
  prevHref,
  nextHref,
}: {
  monday: string
  items: Item[]
  zone: string
  volver: string
  prevHref: string
  nextHref: string
}) {
  const days = weekDays(monday)
  const today = dayKey(new Date(), zone)
  const week = new Set(days)
  const grouped = groupByDay(
    items
      .map((item) => ({ ...item, scheduledAt: item.post.scheduledAt }))
      .filter((item) => week.has(dayKey(item.scheduledAt, zone))),
    zone,
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link
          href={prevHref}
          className="inline-flex items-center gap-1 text-fg-faint transition-colors hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Semana anterior
        </Link>
        <span className="font-mono text-[0.8rem] text-fg-muted">{weekLabel(monday)}</span>
        <Link
          href={nextHref}
          className="inline-flex items-center gap-1 text-fg-faint transition-colors hover:text-fg"
        >
          Semana siguiente
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[52rem] grid-cols-7 gap-2">
          {days.map((day, index) => {
            const cortes = grouped.get(day) ?? []
            const calor = calorDelDia(cortes.length)
            return (
              <div key={day} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      'font-titulo text-[0.65rem] uppercase tracking-[0.14em]',
                      day === today ? 'text-fg' : 'text-fg-faint',
                    )}
                  >
                    {dayLabel(day, index)}
                  </p>
                  <span
                    className={cn(
                      'font-titulo text-[0.55rem] uppercase tracking-[0.12em]',
                      calor === 'llena' ? 'text-brasa' : 'text-fg-faint',
                    )}
                  >
                    {ROTULO_CALOR[calor]}
                  </span>
                </div>

                <div
                  className={cn(
                    'grilla flex min-h-[4.5rem] flex-col gap-2 p-2',
                    calor === 'apagada' && 'grilla-apagada justify-center',
                    calor === 'prendida' && 'grilla-prendida',
                    calor === 'llena' && 'grilla-llena',
                    // El día de hoy se marca con el borde y no con el fondo: el fondo ya
                    // lo está usando el fuego para contar el volumen.
                    day === today && 'ring-1 ring-inset ring-white/25',
                  )}
                >
                  {cortes.length === 0 ? (
                    <p className="text-center text-[0.72rem] italic text-fg-faint">
                      No hay nada puesto. Prendela.
                    </p>
                  ) : (
                    cortes.map(({ post, targets, media }) => {
                      // Misma precedencia que antes, solo que ahora vestida: un fallo en
                      // cualquier destino gana, todos publicados es «a punto», algo en
                      // curso es «sellada», el resto queda cruda.
                      const coccion = coccionDe(targets.map((t) => t.status))
                      return (
                        <Link
                          key={post.id}
                          href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                          title={`${hourLabel(post.scheduledAt, zone)} — ${NOMBRE_COCCION[coccion]}`}
                          className={cn(
                            'corte block p-2 transition-transform hover:-translate-y-0.5',
                            CLASE_COCCION[coccion],
                          )}
                        >
                          <p className="font-titulo text-[0.6rem] tracking-[0.12em] text-fg/70">
                            {hourLabel(post.scheduledAt, zone)}
                            {coccion === 'sellada' ? (
                              <span className="humo ml-1.5 inline-block text-brasa">≈ saliendo</span>
                            ) : null}
                          </p>
                          {media[0] ? (
                            media[0].mediaType === 'image' ? (
                              <Image
                                src={media[0].blobUrl}
                                alt=""
                                width={120}
                                height={64}
                                unoptimized
                                className="mt-1 h-16 w-full rounded object-cover"
                              />
                            ) : post.coverUrl ? (
                              // The designed cover IS the video's preview when there is one.
                              <Image
                                src={post.coverUrl}
                                alt=""
                                width={120}
                                height={64}
                                unoptimized
                                className="mt-1 h-16 w-full rounded object-cover"
                              />
                            ) : (
                              // No controls (the whole card is a link); preload="metadata"
                              // paints the first frame without pulling the file.
                              <video
                                src={media[0].blobUrl}
                                preload="metadata"
                                muted
                                playsInline
                                className="mt-1 h-16 w-full rounded bg-black object-cover"
                              />
                            )
                          ) : null}
                          <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-fg">
                            {post.caption || '(sin texto)'}
                          </p>
                          <span className="sr-only">{NOMBRE_COCCION[coccion]}</span>
                        </Link>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
