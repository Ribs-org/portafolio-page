import Link from 'next/link'
import { BarList } from '@/components/charts/bar-list'
import { CampaignTable } from '@/components/charts/campaign-table'
import { Donut } from '@/components/charts/donut'
import { Funnel } from '@/components/charts/funnel'
import { Heatmap } from '@/components/charts/heatmap'
import { Empty, Panel } from '@/components/charts/panel'
import { StatTile, delta } from '@/components/charts/stat-tile'
import { seriesColor } from '@/components/charts/theme'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { FilterBar } from '@/components/filter-bar'
import {
  SITE_TIMEZONE,
  getBrowsers,
  getCampaigns,
  getCities,
  getCountries,
  getDevices,
  getFunnel,
  getHeatmap,
  getKpis,
  getLanguages,
  getNetworks,
  getOperatingSystems,
  getRecentVisits,
  getTimeSeries,
  getTopLinks,
  previousPeriod,
} from '@/lib/analytics'
import { parseFilters } from '@/lib/filters'
import { networkLabel } from '@/lib/networks'
import { getCampaignPosts } from '@/lib/posts'
import { getAllProfiles } from '@/lib/profiles'
import { countryName, flagEmoji, formatNumber, formatPercent } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'recién'
  if (seconds < 3600) return RELATIVE.format(-Math.round(seconds / 60), 'minute')
  if (seconds < 86400) return RELATIVE.format(-Math.round(seconds / 3600), 'hour')
  return RELATIVE.format(-Math.round(seconds / 86400), 'day')
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Celular',
  desktop: 'Computador',
  tablet: 'Tablet',
  wearable: 'Wearable',
  console: 'Consola',
  smarttv: 'Smart TV',
  Desconocido: 'Desconocido',
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const profiles = await getAllProfiles()

  const [
    kpis,
    previous,
    series,
    campaigns,
    networks,
    countries,
    cities,
    devices,
    systems,
    browsers,
    languages,
    heatmap,
    recent,
  ] = await Promise.all([
    getKpis(filters),
    getKpis(previousPeriod(filters)),
    getTimeSeries(filters),
    getCampaigns(filters),
    getNetworks(filters),
    getCountries(filters),
    getCities(filters),
    getDevices(filters),
    getOperatingSystems(filters),
    getBrowsers(filters),
    getLanguages(filters),
    getHeatmap(filters),
    getRecentVisits(filters),
  ])

  const campaignPosts = await getCampaignPosts(campaigns.map((c) => c.campaign))

  const [topLinks, funnel] = await Promise.all([
    getTopLinks(filters, kpis.visits),
    getFunnel(filters, kpis),
  ])

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Analítica</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Todo lo que pasa en tus perfiles, sin cookies ni terceros.
        </p>
      </header>

      <FilterBar profiles={profiles} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Visitas" value={formatNumber(kpis.visits)} delta={delta(kpis.visits, previous.visits)} />
        <StatTile label="Únicos" value={formatNumber(kpis.uniques)} delta={delta(kpis.uniques, previous.uniques)} />
        <StatTile label="Clicks" value={formatNumber(kpis.clicks)} delta={delta(kpis.clicks, previous.clicks)} />
        <StatTile label="CTR" value={formatPercent(kpis.ctr)} delta={delta(kpis.ctr, previous.ctr)} />
      </div>

      <div className="mt-4 grid gap-4">
        <Panel title="Tráfico en el tiempo" hint="Visitas y clicks, comparables en la misma escala">
          <TrafficChart data={series} />
        </Panel>

        <Panel
          title="Qué contenido te trae gente"
          hint="Cada etiqueta ?s= es una pieza de contenido. Ordena por CTR para ver cuál convierte."
          action={
            <Link
              href="/admin/content"
              className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
            >
              Ver por post →
            </Link>
          }
        >
          <CampaignTable rows={campaigns} posts={Object.fromEntries(campaignPosts)} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Links más clickeados" hint="CTR calculado sobre las visitas del período">
            <BarList
              items={topLinks.map((link) => ({
                key: link.linkId ?? link.label,
                label: link.label,
                value: link.clicks,
                note: formatPercent(link.ctr),
                href: link.url || undefined,
              }))}
              color={seriesColor(1)}
              emptyLabel="Nadie ha hecho click todavía."
            />
          </Panel>

          <Panel title="De dónde vienen" hint="Red de origen inferida del referrer y de utm_source">
            <Donut
              slices={networks.map((n) => ({
                key: n.key,
                label: networkLabel(n.key),
                value: n.visits,
              }))}
            />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Países">
            <BarList
              items={countries.map((c) => ({
                key: c.key,
                label: `${flagEmoji(c.key)}  ${countryName(c.key)}`,
                value: c.visits,
              }))}
            />
          </Panel>

          <Panel title="Ciudades">
            <BarList
              items={cities.map((c) => ({ key: c.key, label: c.key, value: c.visits }))}
            />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Dispositivo">
            <BarList
              items={devices.map((d) => ({
                key: d.key,
                label: DEVICE_LABELS[d.key] ?? d.key,
                value: d.visits,
              }))}
            />
          </Panel>
          <Panel title="Sistema">
            <BarList
              items={systems.map((s) => ({ key: s.key, label: s.key, value: s.visits }))}
            />
          </Panel>
          <Panel title="Navegador">
            <BarList
              items={browsers.map((b) => ({ key: b.key, label: b.key, value: b.visits }))}
            />
          </Panel>
        </div>

        <Panel
          title="Cuándo te visitan"
          hint={`Hora local de ${SITE_TIMEZONE}`}
        >
          <Heatmap cells={heatmap} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Embudo" hint="De llegar a la página a hacer click">
            <Funnel data={funnel} />
          </Panel>

          <Panel title="Idioma del navegador">
            <BarList
              items={languages.map((l) => ({ key: l.key, label: l.key, value: l.visits }))}
            />
          </Panel>
        </div>

        <Panel title="Últimas visitas" hint="Las 40 más recientes del período">
          {recent.length === 0 ? (
            <Empty>Nada todavía.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {recent.map((visit) => (
                <li key={visit.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[0.82rem]">
                  <span aria-hidden>{flagEmoji(visit.country)}</span>
                  <span className="text-fg">
                    {visit.city ?? countryName(visit.country)}
                    {visit.city && visit.country ? (
                      <span className="text-fg-faint">, {countryName(visit.country)}</span>
                    ) : null}
                  </span>
                  <span className="text-fg-muted">
                    {DEVICE_LABELS[visit.deviceType ?? ''] ?? visit.deviceType ?? '—'}
                    {visit.os ? ` · ${visit.os}` : ''}
                    {visit.browser ? ` · ${visit.browser}` : ''}
                  </span>
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.68rem] text-fg-muted">
                    {networkLabel(visit.referrerNetwork)}
                  </span>
                  {visit.campaign ? (
                    <span
                      className="rounded-md px-1.5 py-0.5 font-mono text-[0.68rem]"
                      style={{ background: `${seriesColor(0)}25`, color: seriesColor(0) }}
                    >
                      ?s={visit.campaign}
                    </span>
                  ) : null}
                  {visit.isBot ? (
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.68rem] text-fg-faint">
                      bot
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[0.7rem] text-fg-faint">
                    {timeAgo(visit.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
