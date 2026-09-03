import Link from 'next/link'
import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import { ClickTracker } from '@/components/click-tracker'
import { VisitTracker } from '@/components/visit-tracker'
import { ProfileView } from '@/components/profile-view'
import type { Profile } from '@/db'
import { getVisibleLinks } from './profiles'

export type SearchParams = Record<string, string | string[] | undefined>

/**
 * Renders a public profile. The visit id is minted here and embedded in the HTML, but
 * the row is written only when `VisitTracker` reports back from the browser: counting
 * on render counted every crawler that fetched the page. `searchParams` stays in the
 * signature because Next needs the page to read it to opt out of static rendering.
 */
export async function renderProfile(profile: Profile, searchParams: SearchParams) {
  void searchParams
  const links = await getVisibleLinks(profile.id)
  const visitId = randomUUID()

  return (
    <>
      <ProfileView profile={profile} links={links} />
      <VisitTracker visitId={visitId} profileId={profile.id} />
      <ClickTracker visitId={visitId} profileId={profile.id} />
    </>
  )
}

export function profileMetadata(profile: Profile): Metadata {
  const title = profile.headline
    ? `${profile.displayName} · ${profile.headline}`
    : profile.displayName

  return {
    title,
    description: profile.bio ?? undefined,
    robots: profile.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description: profile.bio ?? undefined,
      images: profile.ogImageUrl ?? profile.avatarUrl ?? undefined,
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: profile.bio ?? undefined,
      images: profile.ogImageUrl ?? profile.avatarUrl ?? undefined,
    },
  }
}

/** Shown before the first profile exists, so a fresh deploy is never a blank 404. */
export function FirstRun({ reason }: { reason: 'empty' | 'error' }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="aurora" aria-hidden>
        <span />
      </div>
      <div className="surface w-full max-w-md rounded-3xl p-8 text-center">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">
          {reason === 'empty' ? 'Sin configurar' : 'Base de datos'}
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.02em]">
          {reason === 'empty' ? 'Falta crear tu primer perfil' : 'No se pudo leer la base de datos'}
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-fg-muted">
          {reason === 'empty'
            ? 'Entra al panel, crea un perfil y márcalo como principal. Aparecerá acá.'
            : 'Revisa que DATABASE_URL esté configurada y que las migraciones estén aplicadas.'}
        </p>
        <Link
          href="/admin"
          className="surface surface-hover mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium"
        >
          Ir al panel
        </Link>
      </div>
    </main>
  )
}
