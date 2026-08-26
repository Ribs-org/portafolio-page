import Link from 'next/link'
import { Panel } from '@/components/charts/panel'
import { StatTile } from '@/components/charts/stat-tile'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { FilterBar } from '@/components/filter-bar'
import { parseFilters } from '@/lib/filters'
import { getConnections, getPostRows, getPostSeries, postKpisFrom } from '@/lib/posts'
import { getAllProfiles } from '@/lib/profiles'
import { formatNumber, formatPercent } from '@/lib/utils'
import { Connections } from './connections'
import { PostTable } from './post-table'

export const dynamic = 'force-dynamic'

/**
 * Toggles `archivados` while carrying every other search param along — range,
 * profile and bots all live in the URL (see `FilterBar`), and this link must not
 * silently reset them just because it targets a different query key.
 *
 * `mensaje` is the exception: it is the one-shot outcome of an OAuth callback, so
 * carrying it would pin a stale "instagram conectado." to every later navigation.
 */
function archivedToggleHref(
  params: Record<string, string | string[] | undefined>,
  includeArchived: boolean,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'archivados' || key === 'mensaje') continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  if (!includeArchived) next.set('archivados', '1')

  const query = next.toString()
  return query ? `/admin/content?${query}` : '/admin/content'
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const includeArchived = params.archivados === '1'

  // What `/api/social/[network]/callback` has to say about the connection attempt that
  // just bounced back here. Truncated because the value is a query param: it reaches the
  // page as text either way, but a hand-crafted link should not get to paste an essay
  // above the cards.
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null

  const [profiles, connections, rows, series] = await Promise.all([
    getAllProfiles(),
    getConnections(),
    getPostRows(filters, includeArchived),
    getPostSeries(filters),
  ])

  // Derived from the same rows the table renders, so the tiles above never
  // disagree with what's listed below — including when `archivados=1` is set.
  const kpis = postKpisFrom(rows)

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contenido</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Cada post con lo que hizo en la red y lo que trajo a tu página.
        </p>
      </header>

      <FilterBar profiles={profiles} />

      {mensaje ? (
        <p
          role="status"
          className="surface mb-4 rounded-2xl px-4 py-3 text-[0.82rem] leading-relaxed text-fg-muted"
        >
          {mensaje}
        </p>
      ) : null}

      <Connections rows={connections} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Views" value={formatNumber(kpis.views)} hint="Ganadas en el período" />
        <StatTile
          label="Interacciones"
          value={formatNumber(kpis.engagement)}
          hint="Likes, comentarios y compartidos del período"
        />
        <StatTile
          label="Visitas desde posts"
          value={formatNumber(kpis.visits)}
          hint="Atribuidas por etiqueta"
        />
        <StatTile
          label="Arrastre"
          value={kpis.pull === null ? '—' : formatPercent(kpis.pull, 2)}
          hint="De quienes vieron, cuántos llegaron"
        />
      </div>

      <div className="mt-4 grid gap-4">
        <Panel
          title="Tus posts"
          hint="Ordena por cualquier columna. Arrastre es visitas sobre views ganadas en el período — lo que ninguna de las dos plataformas calcula sola. La columna Views muestra el acumulado, con lo ganado al lado."
          action={
            <Link
              href={archivedToggleHref(params, includeArchived)}
              className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
            >
              {includeArchived ? 'Ocultar borrados' : 'Ver borrados'}
            </Link>
          }
        >
          <PostTable rows={rows} />
        </Panel>

        <Panel
          title="Views ganadas por día"
          hint="Cuánto creció el alcance contra cuánta gente llegó efectivamente a tu página"
        >
          <TrafficChart
            data={series}
            series={[
              { key: 'views', name: 'Views ganadas' },
              { key: 'visits', name: 'Visitas' },
            ]}
          />
        </Panel>
      </div>
    </>
  )
}
