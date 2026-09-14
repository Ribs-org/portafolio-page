import { PanelSkeleton } from '@/components/charts/panel'
import { StatTileSkeleton } from '@/components/charts/stat-tile'

/**
 * Dentro del grupo `(dash)` este archivo envuelve en `<Suspense>` a todas las páginas
 * del panel, así que una sola pantalla de carga sirve para las seis pestañas: todas
 * abren con cifras arriba y paneles abajo.
 *
 * Sin texto a propósito. El esqueleto ocupa el lugar de lo que viene; explicarlo sería
 * pedirle al ojo que lea algo que desaparece en un segundo.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando">
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
