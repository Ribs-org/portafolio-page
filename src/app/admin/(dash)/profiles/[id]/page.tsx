import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getDb, profiles } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { getAllLinks } from '@/lib/profiles'
import { toZonedInput } from '@/lib/utils'
import { ProfileEditor } from './editor'
import type { DraftLink } from './link-row'

export const dynamic = 'force-dynamic'

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [profile] = await getDb().select().from(profiles).where(eq(profiles.id, id)).limit(1)
  if (!profile) notFound()

  const rows = await getAllLinks(profile.id)
  const initialLinks: DraftLink[] = rows.map((link) => ({
    id: link.id,
    kind: link.kind,
    label: link.label,
    sublabel: link.sublabel ?? '',
    url: link.url,
    icon: link.icon ?? '',
    imageUrl: link.imageUrl,
    isActive: link.isActive,
    startsAt: toZonedInput(link.startsAt, SITE_TIMEZONE),
    endsAt: toZonedInput(link.endsAt, SITE_TIMEZONE),
  }))

  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/profiles"
          className="rounded-lg p-1.5 text-fg-faint transition-colors hover:text-fg"
          aria-label="Volver a perfiles"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          {profile.displayName}
        </h1>
        <a
          href={profile.isDefault ? '/' : `/${profile.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          Ver página <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </header>

      <ProfileEditor profile={profile} initialLinks={initialLinks} origin={origin} />
    </>
  )
}
