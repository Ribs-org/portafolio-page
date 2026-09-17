import 'server-only'
import { and, asc, eq, inArray, isNull, or, gte, lte } from 'drizzle-orm'
import { getDb, links, profiles } from '@/db'
import type { Link, Profile } from '@/db'

export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.slug, slug)).limit(1)
  return row ?? null
}

export async function getDefaultProfile(ownerId: string): Promise<Profile | null> {
  const [row] = await getDb()
    .select()
    .from(profiles)
    .where(and(eq(profiles.ownerId, ownerId), eq(profiles.isDefault, true)))
    .limit(1)
  return row ?? null
}

export async function getAllProfiles(ownerId: string): Promise<Profile[]> {
  return getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.ownerId, ownerId))
    .orderBy(asc(profiles.createdAt))
}

/** Only links that are active and inside their scheduling window, in display order. */
export async function getVisibleLinks(profileId: string): Promise<Link[]> {
  const now = new Date()
  return getDb()
    .select()
    .from(links)
    .where(
      and(
        eq(links.profileId, profileId),
        eq(links.isActive, true),
        or(isNull(links.startsAt), lte(links.startsAt, now)),
        or(isNull(links.endsAt), gte(links.endsAt, now)),
      ),
    )
    .orderBy(asc(links.position))
}

export async function getAllLinks(ownerId: string, profileId: string): Promise<Link[]> {
  return getDb()
    .select()
    .from(links)
    .where(
      and(
        eq(links.profileId, profileId),
        inArray(links.profileId, getDb().select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, ownerId))),
      ),
    )
    .orderBy(asc(links.position))
}

// La visita ya no se escribe en el render: la registra `/api/track/visit` cuando la
// baliza del navegador confirma que hubo alguien. Ver `visit-tracker.tsx`.
