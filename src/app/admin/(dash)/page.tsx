import Link from 'next/link'
import { ENLACE_BOTON } from '@/components/boton'
import { Encabezado } from '@/components/ui'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { requireUser } from '@/lib/auth'
import { avisoDelSiguiente, cortesDeHoy, horaConDia, pieDeAyer, quemados, siguienteCorte } from '@/lib/fuego'
import { NOMBRE_COCCION, coccionDe } from '@/lib/parrilla'
import { cargaPorDia, getCuentas } from '@/lib/posts'
import { addDays, dayKey, hourLabel } from '@/lib/schedule-week'
import { cortesEntre, quemadosDe, servidosAyer } from '@/lib/social/publish/cortes'
import { fromZonedInput } from '@/lib/utils'
import { nombreDe } from '@/lib/vocabulario'
import { Termometro } from './termometro'
import { nombreDestino } from './schedule/etiqueta'
import { Redes } from './schedule/redes'
import { Reprogramar } from './schedule/reprogramar'

export const dynamic = 'force-dynamic'

/**
 * El Fuego: lo que pide una acción hoy, y nada más.
 *
 * Los números que vivían acá cuando esta pantalla era el Resumen están enteros en Los
 * Números (`/admin/analytics`) y en La Vitrina (`/admin/profiles`). La regla que los echó
 * está en el spec (`docs/superpowers/specs/2026-09-29-panel-poco-a-priori-design.md`, §2):
 * si no pide una acción hoy, va un clic más adentro. El tráfico del mes no la pide; un
 * destino quemado sí.
 */

/** Hasta dónde se mira hacia adelante para nombrar el siguiente corte cuando hoy no hay. */
const DIAS_ADELANTE = 30

export default async function FuegoPage() {
  const { id: ownerId } = await requireUser()
  const cuentas = await getCuentas(ownerId)

  return (
    <>
      <header className="mb-6">
        <Encabezado ruta="/admin" />
      </header>
      {cuentas.some((cuenta) => cuenta.connected) ? <Fuego ownerId={ownerId} /> : <PrimerDia />}
    </>
  )
}

/**
 * Sin ninguna red conectada no hay cortes, ni parrilla, ni ayer: la pantalla entera sería
 * una hilera de vacíos. En su lugar va lo único que desbloquea todo lo demás. Con una
 * cuenta conectada, esta tarjeta no vuelve a aparecer.
 */
function PrimerDia() {
  return (
    <section className="chapa rounded-2xl p-6">
      <h2 className="font-titulo text-lg font-semibold uppercase tracking-[0.03em]">
        Conecta tu primera red
      </h2>
      <p className="mt-2 text-sm text-fg-muted">Sin una red conectada no hay nada que poner al fuego.</p>
      <Link href="/admin/accounts" className={`mt-5 ${ENLACE_BOTON}`}>
        Ir a {nombreDe('/admin/accounts')} →
      </Link>
    </section>
  )
}

async function Fuego({ ownerId }: { ownerId: string }) {
  const zone = SITE_TIMEZONE
  const now = new Date()
  const hoy = dayKey(now, zone)
  const manana = addDays(hoy, 1)
  // No pueden ser null: las dos claves salen de `dayKey`/`addDays`, que siempre producen
  // una `YYYY-MM-DD` válida, y esa es la única forma que `fromZonedInput` rechaza. Es el
  // mismo par que usa `servidosAyer` para convertir un día de calendario en instantes.
  const inicioDeHoy = fromZonedInput(`${hoy}T00:00`, zone)!
  const inicioDeManana = fromZonedInput(`${manana}T00:00`, zone)!

  // `media: false` en las dos: esta pantalla no dibuja miniaturas (spec §3.2), y la media
  // es una segunda consulta por lectura.
  const [deHoy, conFallo, ayer, carga] = await Promise.all([
    cortesEntre(ownerId, inicioDeHoy, inicioDeManana, { media: false }),
    quemadosDe(ownerId, { media: false }),
    servidosAyer(ownerId, now, zone),
    // Sin ventana de fechas: el termómetro mira lo que viene.
    cargaPorDia(ownerId, zone, now),
  ])

  const enLaParrilla = cortesDeHoy(deHoy, now, zone)
  const seQuemaron = quemados(conFallo)

  // El siguiente corte es una segunda lectura y no un filtro de la primera: la ventana de
  // hoy, por definición, no contiene ninguno de mañana. Solo se pide cuando hace falta —
  // si hoy hay algo puesto, esta frase no se dibuja.
  const siguiente =
    enLaParrilla.length > 0
      ? null
      : siguienteCorte(
          await cortesEntre(
            ownerId,
            inicioDeManana,
            fromZonedInput(`${addDays(manana, DIAS_ADELANTE)}T00:00`, zone)!,
            { media: false },
          ),
          now,
        )

  return (
    <div className="space-y-4">
      <Termometro carga={carga} zone={zone} />

      <section className="chapa rounded-xl p-4">
        <h2 className="mb-3 font-titulo text-sm font-semibold uppercase tracking-[0.03em]">
          Ahora en la parrilla
        </h2>
        {enLaParrilla.length === 0 ? (
          <p className="text-[0.85rem] text-fg-muted">
            La parrilla está fría hoy.
            {siguiente ? <> {avisoDelSiguiente(siguiente.post.scheduledAt, now, zone)}</> : null}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {enLaParrilla.map(({ post, targets }) => (
              <li key={post.id}>
                <Link
                  href={`/admin/schedule/${post.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-fg-muted transition-colors hover:text-fg"
                >
                  <span className="font-mono text-[0.8rem]">{hourLabel(post.scheduledAt, zone)}</span>
                  <Redes targets={targets} />
                  {/* Una línea y no dos como en el calendario: acá la fila es la unidad. */}
                  <span className="line-clamp-1 min-w-0 flex-1 text-[0.85rem] text-fg">
                    {post.caption || '(sin texto)'}
                  </span>
                  <span className="font-titulo text-[0.62rem] uppercase tracking-[0.12em]">
                    {NOMBRE_COCCION[coccionDe(targets.map((t) => t.status))]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sin nada quemado la sección no existe: un «no se quemó nada» sería una fila que
          hay que leer todos los días para enterarse de que no pasa nada. */}
      {seQuemaron.length > 0 ? (
        <section className="chapa rounded-xl p-4">
          <h2 className="mb-3 font-titulo text-sm font-semibold uppercase tracking-[0.03em] text-negative">
            Se quemó
          </h2>
          <ul className="divide-y divide-white/[0.06]">
            {seQuemaron.map(({ corte, destino }) => (
              <li key={destino.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                {/* Con el día delante si no es de hoy: esta lista no tiene ventana de
                    fecha y un fallo viejo se leería igual que uno de esta mañana. */}
                <span className="font-mono text-[0.8rem] text-fg-muted">
                  {horaConDia(corte.post.scheduledAt, now, zone)}
                </span>
                <Redes targets={[destino]} />
                <Link
                  href={`/admin/schedule/${corte.post.id}`}
                  className="line-clamp-1 min-w-0 flex-1 text-[0.85rem] text-fg hover:underline"
                >
                  {corte.post.caption || '(sin texto)'}
                </Link>
                {/* El motivo tal como llegó de la red: `w-full` lo baja a su propia línea,
                    que a 360 px es la única forma de que se lea entero. */}
                {destino.lastError ? (
                  <span className="w-full text-[0.78rem] text-negative">{destino.lastError}</span>
                ) : null}
                <Reprogramar targetId={destino.id} titulo={nombreDestino(destino)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div>
        <Link href="/admin/schedule?componer=1" className={ENLACE_BOTON}>
          Poner al fuego
        </Link>
      </div>

      <p className="font-mono text-[0.72rem] text-fg-faint">{pieDeAyer(ayer.servidos, ayer.miradas)}</p>
    </div>
  )
}
