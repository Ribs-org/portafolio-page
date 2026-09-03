import Link from 'next/link'
import { BarList } from '@/components/charts/bar-list'
import { Empty, Panel } from '@/components/charts/panel'
import { StatTile } from '@/components/charts/stat-tile'
import { seriesColor } from '@/components/charts/theme'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { FilterBar } from '@/components/filter-bar'
import { parseFilters } from '@/lib/filters'
import { getConnections, getPostRows, getPostSeries, postKpisFrom } from '@/lib/posts'
import { networkLabel } from '@/lib/networks'
import {
  activeRows,
  networksPresent,
  topPostsByGain,
  unpastedCount,
  withPlatformMetrics,
  withoutPlatformMetricsCount,
} from '@/lib/posts-kpis'
import { getAllProfiles } from '@/lib/profiles'
import { cn, formatNumber, formatPercent } from '@/lib/utils'
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
function contentHref(
  params: Record<string, string | string[] | undefined>,
  changed: string,
  value: string | string[] | null,
): string {
  const next = new URLSearchParams()
  for (const [key, param] of Object.entries(params)) {
    if (key === changed || key === 'mensaje') continue
    if (typeof param === 'string') next.set(key, param)
    else if (Array.isArray(param)) for (const v of param) next.append(key, v)
  }
  if (Array.isArray(value)) for (const v of value) next.append(changed, v)
  else if (value !== null) next.set(changed, value)

  const query = next.toString()
  return query ? `/admin/content?${query}` : '/admin/content'
}

function toggleHref(
  params: Record<string, string | string[] | undefined>,
  toggled: 'archivados' | 'metricas' | 'anteriores',
  active: boolean,
): string {
  return contentHref(params, toggled, active ? null : '1')
}

/** Reads a repeatable query key (`?red=a&red=b`) as a list. */
function listParam(value: string | string[] | undefined): string[] {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value : []
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
  const redes = listParam(params.red)
  // El rango acota qué se publicó, que es lo que uno espera al decir «esta semana».
  // «Incluir anteriores» recupera la otra lectura: lo viejo que sigue teniendo
  // actividad dentro de la ventana.
  const incluirAnteriores = params.anteriores === '1'

  // What `/api/social/[network]/callback` has to say about the connection attempt that
  // just bounced back here. Truncated because the value is a query param: it reaches the
  // page as text either way, but a hand-crafted link should not get to paste an essay
  // above the cards.
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null

  const [profiles, connections, rows, series] = await Promise.all([
    getAllProfiles(),
    getConnections(),
    getPostRows(
      filters,
      includeArchived,
      incluirAnteriores ? {} : { publishedFrom: filters.from, publishedTo: filters.to },
    ),
    getPostSeries(filters),
  ])

  // The metrics and platform filters are applied here, not in the query: the rows are
  // already loaded, and asking the database again for a subset it already handed over
  // would also risk the two calls disagreeing.
  const withMetrics = onlyWithMetrics ? withPlatformMetrics(rows) : rows
  const visible =
    redes.length > 0 ? withMetrics.filter((row) => redes.includes(row.network)) : withMetrics

  // Chips come from the unfiltered catalogue so the way back ("Todas", or another
  // network) never disappears just because the current filter emptied the view.
  const chipNetworks = networksPresent(rows)

  // Derived from the same rows the table renders, so the tiles above never
  // disagree with what's listed below — including when `archivados=1` or
  // `metricas=1` narrow the list.
  const kpis = postKpisFrom(visible)

  // The notices describe the catalogue, not the current view, so they count the
  // unfiltered active rows. With `metricas=1` on, that is what makes the "sin métricas"
  // line double as the sign that something is being hidden.
  //
  // They count only active rows even under `archivados=1`, so the number deliberately
  // understates what the metrics filter is hiding at that moment: an archived row with
  // no metrics is filtered out of the table but not counted here. That is the trade the
  // notices make — they are about a catalogue worth acting on, and a deleted post is
  // not one, so a count that grew when "Ver borrados" was pressed would be describing
  // the view instead.
  const activeCount = activeRows(rows).length
  const unpasted = unpastedCount(rows)
  const withoutMetrics = withoutPlatformMetricsCount(rows)

  // Fed `visible` so the panel ranks exactly what the table shows: the platform filter
  // narrows it on purpose, and the metrics filter provably removes nothing this ranking
  // would keep (`periodChange` nulls `current` and `change` together — see
  // `social/delta.ts` — so a row with no cumulative `views` cannot carry a
  // `viewsChange` above zero).
  const topPosts = topPostsByGain(visible, 10)

  // Spanish inflects the noun, the possessive and the verb together, so the singular is
  // a different sentence rather than a different suffix.
  const unpastedNotice =
    unpasted === activeCount
      ? 'Ninguna etiqueta está pegada todavía. Copia el link de una fila y pégalo en ese post de la red.'
      : unpasted === 1
        ? '1 publicación aún no tiene su link pegado.'
        : `${formatNumber(unpasted)} publicaciones aún no tienen su link pegado.`

  // The count knows only that the network reported nothing — which a stale sync window
  // or another network can also produce. So the observation is asserted and the usual
  // cause is offered as an explanation, not diagnosed as the fact.
  const metricsNotice =
    withoutMetrics === 1
      ? '1 publicación no tiene métricas de la red en este período (Instagram no las entrega para lo publicado antes de tu cuenta profesional).'
      : `${formatNumber(withoutMetrics)} publicaciones no tienen métricas de la red en este período (Instagram no las entrega para lo publicado antes de tu cuenta profesional).`

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
          {unpasted > 0 ? <p>{unpastedNotice}</p> : null}
          {withoutMetrics > 0 ? <p>{metricsNotice}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <Panel
          title="Tus posts"
          hint="Lo publicado dentro del rango elegido; «Incluir anteriores» suma lo más viejo que siga teniendo actividad. Ordena por cualquier columna. La columna Views muestra el acumulado, con lo ganado al lado — y un «—» cuando el post existía antes de la primera medición y su crecimiento no se puede saber. Arrastre es visitas sobre views ganadas."
          action={
            <div className="flex items-center gap-3">
              <Link
                href={toggleHref(params, 'anteriores', incluirAnteriores)}
                className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
              >
                {incluirAnteriores ? 'Solo del período' : 'Incluir anteriores'}
              </Link>
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
          {chipNetworks.length > 1 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Link
                href={contentHref(params, 'red', null)}
                className={cn(
                  'rounded-full px-2.5 py-1 font-mono text-[0.68rem] transition-colors',
                  redes.length === 0
                    ? 'bg-white/[0.14] text-fg'
                    : 'bg-white/[0.05] text-fg-faint hover:text-fg',
                )}
              >
                Todas
              </Link>
              {chipNetworks.map((network) => {
                const active = redes.includes(network)
                // Cada chip suma o resta su red: elegir Instagram y Facebook a la vez
                // es un caso normal, no una excepción.
                const next = active ? redes.filter((r) => r !== network) : [...redes, network]
                return (
                  <Link
                    key={network}
                    href={contentHref(params, 'red', next.length > 0 ? next : null)}
                    className={cn(
                      'rounded-full px-2.5 py-1 font-mono text-[0.68rem] transition-colors',
                      active
                        ? 'bg-white/[0.14] text-fg'
                        : 'bg-white/[0.05] text-fg-faint hover:text-fg',
                    )}
                  >
                    {networkLabel(network)}
                  </Link>
                )
              })}
            </div>
          ) : null}
          {/*
            An empty `visible` with a non-empty `rows` is the filter's doing, not an
            empty catalogue. `PostTable`'s own empty state would tell someone whose
            posts are all pre-conversion to go connect a network and sync — which they
            already did, and which would not change a thing.
          */}
          {visible.length === 0 ? (
            <Empty>
              {rows.length === 0
                ? 'No publicaste nada en este período. Amplía el rango, o activa «Incluir anteriores» para ver lo que sigue teniendo actividad.'
                : redes.length > 0
                  ? `El filtro dejó la lista vacía: nada de ${redes.map(networkLabel).join(' ni ')} en este período.`
                  : 'El filtro dejó la lista vacía: ninguna publicación tiene métricas de la red en este período.'}
            </Empty>
          ) : (
            <PostTable rows={visible} />
          )}
        </Panel>

        <Panel
          title="Views ganadas por día"
          hint="Cuánto creció el alcance contra cuánta gente llegó efectivamente a tu página. La serie siempre cubre el catálogo completo, sin importar los filtros de la tabla."
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
              // it identifies the post better than a generic placeholder would. `||`
              // and not `??`: Instagram keeps an empty-string caption where TikTok
              // normalises it to null, and a blank row is as useless as a missing one.
              label: post.caption || post.campaign,
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
