import Link from 'next/link'
import { calorDelDia, type Calor } from '@/lib/parrilla'
import { mondayOfKey, proximosDias } from '@/lib/schedule-week'
import { cn } from '@/lib/utils'

const CLASE_CALOR: Record<Calor, string> = {
  apagada: 'grilla-apagada',
  prendida: 'grilla-prendida',
  llena: 'grilla-llena',
}

/** Cuántos días mira el termómetro. Una semana: lo que cabe de un vistazo. */
const DIAS = 7

/**
 * Los próximos siete días como siete parrillas chicas.
 *
 * Existe porque saber dónde está floja la semana obligaba a irse al calendario y contar
 * tarjetas columna por columna. Acá la respuesta es la forma: los días apagados se ven
 * apagados desde el Resumen, que es la primera pantalla que se abre.
 *
 * Mira hacia adelante desde hoy y no de lunes a domingo, porque la pregunta que contesta
 * es dónde poner lo próximo, y el lunes que ya pasó no es un lugar posible.
 *
 * Cada día enlaza a su semana en el calendario: ver el hueco y no poder tocarlo sería un
 * adorno, y la regla de esta dirección visual es que la metáfora haga trabajo.
 */
export function Termometro({ carga, zone }: { carga: Record<string, number>; zone: string }) {
  const dias = proximosDias(new Date(), zone, DIAS)
  const apagados = dias.filter(({ clave }) => calorDelDia(carga[clave] ?? 0) === 'apagada').length

  return (
    <section className="chapa rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-titulo text-sm font-semibold uppercase tracking-[0.03em]">
          La semana que viene
        </h2>
        {/*
          El resumen en palabras. El color cuenta la historia rápido; esta línea la deja
          disponible para quien no la lee por color, y de paso pone el número que el
          dibujo no dice.
        */}
        <p className="text-[0.75rem] text-fg-muted">
          {apagados === 0
            ? 'Todos los días tienen algo puesto.'
            : apagados === DIAS
              ? 'La semana entera está apagada.'
              : `${apagados} ${apagados === 1 ? 'día apagado' : 'días apagados'}.`}
        </p>
      </div>

      <ol className="grid grid-cols-7 gap-1.5">
        {dias.map(({ clave, dia, numero }, i) => {
          const cortes = carga[clave] ?? 0
          const calor = calorDelDia(cortes)
          return (
            <li key={clave}>
              <Link
                href={`/admin/schedule?vista=calendario&semana=${mondayOfKey(clave)}`}
                title={`${dia} ${numero}: ${cortes === 1 ? '1 corte' : `${cortes} cortes`}`}
                className={cn(
                  'grilla flex h-14 flex-col items-center justify-center gap-0.5',
                  'transition-transform hover:-translate-y-0.5',
                  CLASE_CALOR[calor],
                )}
              >
                <span className="font-titulo text-[0.55rem] uppercase tracking-[0.1em] text-fg-muted">
                  {/* Hoy se nombra, no se numera: es el único día que el lector ya sabe. */}
                  {i === 0 ? 'Hoy' : dia}
                </span>
                <span
                  className={cn(
                    'font-titulo text-sm leading-none',
                    calor === 'apagada' ? 'text-fg-faint' : 'text-fg',
                  )}
                >
                  {cortes || '—'}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
