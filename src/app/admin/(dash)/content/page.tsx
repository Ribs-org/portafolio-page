import { FilterBar } from '@/components/filter-bar'
import { getConnections } from '@/lib/posts'
import { getAllProfiles } from '@/lib/profiles'
import { Connections } from './connections'

export const dynamic = 'force-dynamic'

export default async function ContentPage() {
  const [profiles, connections] = await Promise.all([getAllProfiles(), getConnections()])

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contenido</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Cada post con lo que hizo en la red y lo que trajo a tu página.
        </p>
      </header>

      <Connections rows={connections} />
      <FilterBar profiles={profiles} />
    </>
  )
}
