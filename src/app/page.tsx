import type { Metadata } from 'next'
import { getDefaultProfile } from '@/lib/profiles'
import { FirstRun, profileMetadata, renderProfile, type SearchParams } from '@/lib/serve-profile'

export const dynamic = 'force-dynamic'

async function load() {
  try {
    return { profile: await getDefaultProfile(), failed: false }
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
