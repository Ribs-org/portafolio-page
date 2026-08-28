import Link from 'next/link'
import { BarList } from '@/components/charts/bar-list'
import { Panel } from '@/components/charts/panel'
import { StatTile } from '@/components/charts/stat-tile'
import { seriesColor } from '@/components/charts/theme'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { FilterBar } from '@/components/filter-bar'
import { parseFilters } from '@/lib/filters'
import { getConnections, getPostRows, getPostSeries, postKpisFrom } from '@/lib/posts'
import {
  activeRows,
  topPostsByGain,
  unpastedCount,
  withPlatformMetrics,
  withoutPlatformMetricsCount,
} from '@/lib/posts-kpis'
import { getAllProfiles } from '@/lib/profiles'
import { formatNumber, formatPercent } from '@/lib/utils'
import { Connections } from './connections'
import { PostTable } from './post-table'

export const dynamic = 'force-dynamic'

/**
 * Flips one boolean query key while carrying every other search param along — range,
 * profile and bots all live in the URL (see `FilterBar`), and these links must not
 * silently reset them just because they target a different key. Shared by the two
 * view toggles so `archivados` and `metricas` survive each other rather than one
 * quietly dropping the other.
 *
 * `mensaje` is the exception: it is the one-shot outcome of an OAuth callback, so
 * carrying it would pin a stale "instagram conectado." to every later navigation.
 */
function toggleHref(
  params: Record<string, string | string[] | undefined>,
  toggled: 'archivados' | 'metricas',
  active: boolean,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === toggled || key === 'mensaje') continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  if (!active) next.set(toggled, '1')

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
  const onlyWithMetrics = params.metricas === '1'

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

  // The metrics filter is applied here, not in the query: the rows are already loaded,
  // and asking the database again for a subset it already handed over would also risk
  // the two calls disagreeing.
  const visible = onlyWithMetrics ? withPlatformMetrics(rows) : rows

  // Derived from the same rows the table renders, so the tiles above never
  // disagree with what's listed below — including when `archivados=1` or
  // `metricas=1` narrow the list.
  const kpis = postKpisFrom(visible)

  // The notices describe the catalogue, not the current view, so they count the
  // unfiltered active rows. With `metricas=1` on, that is what makes the "sin métricas"
  // line double as the sign that something is being hidden.
  const activeCount = activeRows(rows).length
  const unpasted = unpastedCount(rows)
  const withoutMetrics = withoutPlatformMetricsCount(rows)

  const topPosts = topPostsByGain(visible, 10)

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

      {unpasted > 0 || withoutMetrics > 0 ? (
        <div className="surface mt-4 space-y-1 rounded-2xl px-4 py-3 text-[0.82rem] leading-relaxed text-fg-muted">
          {unpasted > 0 ? (
            <p>
              {unpasted === activeCount
                ? 'Ninguna etiqueta está pegada todavía. Copia el link de una fila y pégalo en ese post de la red.'
                : `${formatNumber(unpasted)} publicaciones aún no tienen su link pegado.`}
            </p>
          ) : null}
          {withoutMetrics > 0 ? (
            <p>
              {formatNumber(withoutMetrics)} publicaciones anteriores a tu cuenta profesional no
              tienen métricas de Instagram.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <Panel
          title="Tus posts"
          hint="Ordena por cualquier columna. Arrastre es visitas sobre views ganadas en el período — lo que ninguna de las dos plataformas calcula sola. La columna Views muestra el acumulado, con lo ganado al lado."
          action={
            <div className="flex items-center gap-3">
              <Link
                href={toggleHref(params, 'metricas', onlyWithMetrics)}
                className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
              >
                {onlyWithMetrics ? 'Mostrar todas' : 'Solo con métricas'}
              </Link>
              <Link
                href={toggleHref(params, 'archivados', includeArchived)}
                className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
              >
                {includeArchived ? 'Ocultar borrados' : 'Ver borrados'}
              </Link>
            </div>
          }
        >
          <PostTable rows={visible} />
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

        <Panel title="Top posts del período" hint="Los que más views ganaron, con su arrastre al lado">
          <BarList
            items={topPosts.map((post) => ({
              key: post.id,
              // The tag is the fallback label because it is what the owner typed, and
              // it identifies the post better than a generic placeholder would.
              label: post.caption ?? post.campaign,
              // `topPostsByGain` only returns rows whose gain is a number above zero.
              value: post.viewsChange ?? 0,
              note: post.pull === null ? '—' : formatPercent(post.pull, 2),
              href: post.permalink ?? undefined,
            }))}
            color={seriesColor(0)}
            emptyLabel="Sin views nuevas en este período. El crecimiento necesita dos días de datos."
          />
        </Panel>
      </div>
    </>
  )
}
