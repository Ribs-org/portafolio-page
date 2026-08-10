import Link from 'next/link'
import { ArrowUpRight, ExternalLink, Pencil } from 'lucide-react'
import { BarList } from '@/components/charts/bar-list'
import { CampaignTable } from '@/components/charts/campaign-table'
import { Funnel } from '@/components/charts/funnel'
import { Panel } from '@/components/charts/panel'
import { StatTile, delta } from '@/components/charts/stat-tile'
import { seriesColor } from '@/components/charts/theme'
import { TrafficChart } from '@/components/charts/traffic-chart'
import { FilterBar } from '@/components/filter-bar'
import {
  getCampaigns,
  getFunnel,
  getKpis,
  getTimeSeries,
  getTopLinks,
  previousPeriod,
} from '@/lib/analytics'
import { parseFilters } from '@/lib/filters'
import { getAllProfiles } from '@/lib/profiles'
import { formatNumber, formatPercent } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const profiles = await getAllProfiles()

  const [kpis, previous, series, campaigns] = await Promise.all([
    getKpis(filters),
    getKpis(previousPeriod(filters)),
    getTimeSeries(filters),
    getCampaigns(filters, 8),
  ])

  const [topLinks, funnel] = await Promise.all([
    getTopLinks(filters, kpis.visits),
    getFunnel(filters, kpis),
  ])

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Resumen</h1>
        <p className="mt-1 text-sm text-fg-muted">Lo esencial de un vistazo.</p>
      </header>

      <FilterBar profiles={profiles} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Visitas" value={formatNumber(kpis.visits)} delta={delta(kpis.visits, previous.visits)} />
        <StatTile label="Únicos" value={formatNumber(kpis.uniques)} delta={delta(kpis.uniques, previous.uniques)} />
        <StatTile label="Clicks" value={formatNumber(kpis.clicks)} delta={delta(kpis.clicks, previous.clicks)} />
        <StatTile label="CTR" value={formatPercent(kpis.ctr)} delta={delta(kpis.ctr, previous.ctr)} />
      </div>

      <div className="mt-4 grid gap-4">
        <Panel
          title="Tráfico"
          action={
            <Link
              href="/admin/analytics"
              className="flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
            >
              Ver todo <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        >
          <TrafficChart data={series} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Links más clickeados">
            <BarList
              items={topLinks.slice(0, 8).map((link) => ({
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

          <Panel title="Embudo">
            <Funnel data={funnel} />
          </Panel>
        </div>

        <Panel title="Contenido que trae tráfico" hint="Las 8 etiquetas ?s= más activas">
          <CampaignTable rows={campaigns} />
        </Panel>

        <Panel title="Tus perfiles">
          <ul className="grid gap-2 sm:grid-cols-2">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: profile.accentColor }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{profile.displayName}</p>
                  <p className="truncate font-mono text-[0.7rem] text-fg-faint">
                    /{profile.isDefault ? '' : profile.slug}
                    {profile.isDefault ? ' (principal)' : ''}
                    {profile.isPublished ? '' : ' · borrador'}
                  </p>
                </div>
                <Link
                  href={`/admin/profiles/${profile.id}`}
                  className="rounded-lg p-1.5 text-fg-faint transition-colors hover:text-fg"
                  aria-label={`Editar ${profile.displayName}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href={profile.isDefault ? '/' : `/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1.5 text-fg-faint transition-colors hover:text-fg"
                  aria-label={`Abrir ${profile.displayName}`}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
