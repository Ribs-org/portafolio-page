import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, or, gte, lte } from 'drizzle-orm'
import { getDb, links, profiles, visits } from '@/db'
import type { Link, Profile } from '@/db'
import { buildVisitContext, type VisitContext } from './tracking'

export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.slug, slug)).limit(1)
  return row ?? null
}

export async function getDefaultProfile(): Promise<Profile | null> {
  const [row] = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.isDefault, true))
    .limit(1)
  return row ?? null
}

export async function getAllProfiles(): Promise<Profile[]> {
  return getDb().select().from(profiles).orderBy(asc(profiles.createdAt))
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

export async function getAllLinks(profileId: string): Promise<Link[]> {
  return getDb()
    .select()
    .from(links)
    .where(eq(links.profileId, profileId))
    .orderBy(asc(links.position))
}

export type PreparedVisit = { id: string; context: VisitContext }

/**
 * Builds the visit row without touching the database, so the render can embed the id
 * in the HTML immediately. Pair with `persistVisit` inside `after()`.
 */
export function prepareVisit(
  headers: Headers,
  params: URLSearchParams,
): PreparedVisit {
  return { id: randomUUID(), context: buildVisitContext(headers, params) }
}

/** Analytics must never break the public page, so every failure is swallowed. */
export async function persistVisit(profileId: string, visit: PreparedVisit): Promise<void> {
  try {
    await getDb()
      .insert(visits)
      .values({ id: visit.id, profileId, ...visit.context })
  } catch (error) {
    console.error('[analytics] failed to record visit', error)
  }
}
