import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProfileBySlug } from '@/lib/profiles'
import { profileMetadata, renderProfile, type SearchParams } from '@/lib/serve-profile'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

async function load(slug: string) {
  try {
    const profile = await getProfileBySlug(slug)
    return profile?.isPublished ? profile : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const profile = await load((await params).slug)
  return profile ? profileMetadata(profile) : { title: 'No encontrado' }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const profile = await load((await params).slug)
  if (!profile) notFound()
  return renderProfile(profile, await searchParams)
}
