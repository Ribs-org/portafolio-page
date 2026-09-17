import type { Metadata } from 'next'
import { getDefaultProfile } from '@/lib/profiles'
import { FirstRun, profileMetadata, renderProfile, type SearchParams } from '@/lib/serve-profile'
import { asegurarAdmin } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

async function load() {
  try {
    // La raíz sirve el perfil del dueño del despliegue; la página por usuario es el subproyecto 3.
    const { id } = await asegurarAdmin()
    return { profile: await getDefaultProfile(id), failed: false }
  } catch {
    return { profile: null, failed: true }
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await load()
  return profile ? profileMetadata(profile) : { title: 'Portafolio' }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { profile, failed } = await load()
  if (!profile) return <FirstRun reason={failed ? 'error' : 'empty'} />
  return renderProfile(profile, await searchParams)
}
