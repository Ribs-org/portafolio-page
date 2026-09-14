import { PanelSkeleton } from '@/components/charts/panel'
import { StatTileSkeleton } from '@/components/charts/stat-tile'

/**
 * Dentro del grupo `(dash)` este archivo envuelve en `<Suspense>` a todas las páginas
 * del panel, así que una sola pantalla de carga sirve para las seis pestañas. Es un
 * esqueleto genérico: aproxima la forma más común — título, cifras y paneles — y no la
 * de cada pestaña en particular. Cuentas, Calendario y Perfiles abren sin cifras, y ahí
 * las cuatro casillas de arriba sobran por un segundo.
 *
 * Sin texto a propósito. El esqueleto ocupa el lugar de lo que viene; explicarlo sería
 * pedirle al ojo que lea algo que desaparece en un segundo.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando">
      {/* El `<h1>` y su bajada, que sí están en las seis: sin ellos el título aparecía
          de golpe encima de un esqueleto que no le había hecho lugar. */}
      <div className="mb-6 animate-pulse" aria-hidden>
        <div className="h-8 w-44 max-w-[70%] rounded bg-white/[0.06]" />
        <div className="mt-1 h-5 w-80 max-w-full rounded bg-white/[0.035]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <div className="mt-4 grid gap-4">
        <PanelSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  )
}
