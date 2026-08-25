'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { put } from '@vercel/blob'
import { and, eq, max, ne, sql } from 'drizzle-orm'
import { getDb, links, profiles, socialAccounts, socialPosts } from '@/db'
import { LINK_KINDS, type LinkKind } from '@/db/schema'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { createSession, destroySession, isAuthenticated, passwordMatches } from '@/lib/auth'
import { normalizeCampaignTag } from '@/lib/social/campaign'
import { fromZonedInput, normalizeUrl, slugify } from '@/lib/utils'

export type FormState = { error?: string; ok?: boolean }

/**
 * Best effort only: serverless instances are ephemeral and there may be several, so
 * this slows down a brute force attempt rather than stopping it. The real defence is
 * a long password.
 */
const attempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60 * 1000

async function rateLimited(): Promise<boolean> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip)

  if (!entry || now > entry.until) {
    attempts.set(ip, { count: 1, until: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

async function requireAuth() {
  if (!(await isAuthenticated())) redirect('/admin/login')
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get('password') ?? '')

  if (await rateLimited()) {
    return { error: 'Demasiados intentos. Espera unos minutos.' }
  }
  if (!passwordMatches(password)) {
    return { error: 'Contraseña incorrecta.' }
  }

  await createSession()
  redirect('/admin')
}

export async function logout() {
  await destroySession()
  redirect('/admin/login')
}

/* ---------------------------------------------------------------- profiles -- */

function readProfileForm(formData: FormData) {
  const displayName = String(formData.get('displayName') ?? '').trim()
  const rawSlug = String(formData.get('slug') ?? '').trim()

  return {
    displayName,
    slug: slugify(rawSlug) || slugify(displayName) || `perfil-${randomUUID().slice(0, 6)}`,
    headline: String(formData.get('headline') ?? '').trim() || null,
    bio: String(formData.get('bio') ?? '').trim() || null,
    avatarUrl: String(formData.get('avatarUrl') ?? '').trim() || null,
    accentColor: String(formData.get('accentColor') ?? '#8b7cff').trim(),
    ogImageUrl: String(formData.get('ogImageUrl') ?? '').trim() || null,
    isPublished: formData.get('isPublished') === 'on',
    noindex: formData.get('noindex') === 'on',
    updatedAt: new Date(),
  }
}

export async function createProfile(): Promise<never> {
  await requireAuth()
  const db = getDb()
  const suffix = randomUUID().slice(0, 6)

  const [row] = await db
    .insert(profiles)
    .values({
      slug: `perfil-${suffix}`,
      displayName: 'Perfil nuevo',
      accentColor: '#8b7cff',
      isPublished: false,
      noindex: true,
    })
    .returning({ id: profiles.id })

  revalidatePath('/admin/profiles')
  redirect(`/admin/profiles/${row!.id}`)
}

export async function updateProfile(
  profileId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth()
  const values = readProfileForm(formData)

  if (!values.displayName) return { error: 'El nombre no puede quedar vacío.' }

  try {
    await getDb().update(profiles).set(values).where(eq(profiles.id, profileId))
  } catch (error) {
    const message = String(error)
    if (message.includes('profiles_slug_unique') || message.includes('duplicate key')) {
      return { error: `La URL /${values.slug} ya está en uso por otro perfil.` }
    }
    return { error: 'No se pudo guardar. Intenta de nuevo.' }
  }

  revalidatePath('/admin/profiles')
  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Exactly one profile is served at `/`, so promoting one demotes the rest. */
export async function makeDefault(profileId: string) {
  await requireAuth()
  const db = getDb()
  await db.update(profiles).set({ isDefault: false }).where(ne(profiles.id, profileId))
  await db
    .update(profiles)
    .set({ isDefault: true, isPublished: true })
    .where(eq(profiles.id, profileId))

  revalidatePath('/admin/profiles')
  revalidatePath('/', 'layout')
}

export async function deleteProfile(profileId: string) {
  await requireAuth()
  await getDb().delete(profiles).where(eq(profiles.id, profileId))
  revalidatePath('/admin/profiles')
  redirect('/admin/profiles')
}

/** A fresh random suffix, for when a private URL has been shared too widely. */
export async function rotateSlug(profileId: string) {
  await requireAuth()
  const [row] = await getDb().select({ slug: profiles.slug }).from(profiles).where(eq(profiles.id, profileId))
  const base = (row?.slug ?? 'perfil').replace(/-[0-9a-f]{8}$/, '')

  await getDb()
    .update(profiles)
    .set({ slug: `${base}-${randomUUID().slice(0, 8)}`, updatedAt: new Date() })
    .where(eq(profiles.id, profileId))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/admin/profiles')
}

/* ------------------------------------------------------------------- links -- */

function readLinkForm(formData: FormData) {
  const kind = String(formData.get('kind') ?? 'standard')

  return {
    kind: (LINK_KINDS as readonly string[]).includes(kind) ? (kind as LinkKind) : 'standard',
    label: String(formData.get('label') ?? '').trim(),
    sublabel: String(formData.get('sublabel') ?? '').trim() || null,
    url: normalizeUrl(String(formData.get('url') ?? '')),
    icon: String(formData.get('icon') ?? '').trim() || null,
    imageUrl: String(formData.get('imageUrl') ?? '').trim() || null,
    isActive: formData.get('isActive') === 'on',
    // Read in the same zone the editor rendered them in, so re-saving a link —
    // which the row toggle does on every click — leaves the window untouched.
    startsAt: fromZonedInput(String(formData.get('startsAt') ?? ''), SITE_TIMEZONE),
    endsAt: fromZonedInput(String(formData.get('endsAt') ?? ''), SITE_TIMEZONE),
  }
}

export async function createLink(
  profileId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth()
  const values = readLinkForm(formData)

  if (!values.label) return { error: 'Ponle un nombre al link.' }
  if (!values.url) return { error: 'Falta la URL.' }

  const db = getDb()
  const [{ highest }] = await db
    .select({ highest: max(links.position) })
    .from(links)
    .where(eq(links.profileId, profileId))

  await db.insert(links).values({ ...values, profileId, position: (highest ?? -1) + 1 })

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function updateLink(
  linkId: string,
  profileId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth()
  const values = readLinkForm(formData)

  if (!values.label) return { error: 'Ponle un nombre al link.' }
  if (!values.url) return { error: 'Falta la URL.' }

  await getDb()
    .update(links)
    .set(values)
    .where(and(eq(links.id, linkId), eq(links.profileId, profileId)))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function toggleLink(linkId: string, profileId: string) {
  await requireAuth()
  await getDb()
    .update(links)
    .set({ isActive: sql`not ${links.isActive}` })
    .where(and(eq(links.id, linkId), eq(links.profileId, profileId)))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
}

export async function deleteLink(linkId: string, profileId: string) {
  await requireAuth()
  await getDb().delete(links).where(and(eq(links.id, linkId), eq(links.profileId, profileId)))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
}

/** Persists the order produced by the drag-and-drop list. */
export async function reorderLinks(profileId: string, orderedIds: string[]) {
  await requireAuth()
  const db = getDb()

  await Promise.all(
    orderedIds.map((id, position) =>
      db
        .update(links)
        .set({ position })
        .where(and(eq(links.id, id), eq(links.profileId, profileId))),
    ),
  )

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
}

/* ------------------------------------------------------------------ upload -- */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

export async function uploadImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireAuth()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No llegó ningún archivo.' }
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'La imagen supera los 8 MB.' }
  if (!ALLOWED_TYPES.includes(file.type)) return { error: 'Formato no soportado.' }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: 'Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN).' }
  }

  try {
    const blob = await put(`uploads/${randomUUID()}-${file.name}`, file, {
      access: 'public',
      contentType: file.type,
    })
    return { url: blob.url }
  } catch (error) {
    console.error('[upload] failed', error)
    return { error: 'No se pudo subir la imagen.' }
  }
}

/* ------------------------------------------------------------------ social -- */

/**
 * Best effort only: serverless instances are ephemeral and there may be several, so
 * this slows down repeated presses of the sync button from one instance rather than
 * enforcing any real limit.
 */
let lastSyncStartedAt = 0
const SYNC_COOLDOWN_MS = 5 * 60 * 1000

export async function syncSocialNow(): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth()

  if (Date.now() - lastSyncStartedAt < SYNC_COOLDOWN_MS) {
    return { error: 'Espera unos minutos antes de volver a sincronizar.' }
  }
  lastSyncStartedAt = Date.now()

  // Deferred: syncAll pulls in the three connectors and the token-crypto helpers behind
  // it, weight that the rest of this file's actions have no reason to carry.
  const { syncAll } = await import('@/lib/social/sync')

  let report
  try {
    report = await syncAll()
  } catch (error) {
    // syncAll settles every network on its own, so a throw here is the orchestrator
    // itself failing. Letting it propagate would reach the button as an opaque server
    // -action digest instead of the sentence this function already returns for failures.
    console.error('Falló la sincronización de redes:', error)
    return { error: 'No se pudo sincronizar. Intenta de nuevo.' }
  }

  revalidatePath('/admin/content')

  const failed = report.filter((r) => !r.ok)
  if (failed.length === report.length) {
    return { error: 'Ninguna red respondió. Revisa las tarjetas de conexión.' }
  }
  return { ok: true }
}

export async function disconnectNetwork(network: string): Promise<void> {
  await requireAuth()

  // Posts and metrics survive: the traffic they brought really happened.
  await getDb().delete(socialAccounts).where(eq(socialAccounts.network, network))

  revalidatePath('/admin/content')
}

export async function updatePostCampaign(
  postId: string,
  campaign: string,
): Promise<{ ok?: boolean; campaign?: string; error?: string }> {
  await requireAuth()

  const clean = normalizeCampaignTag(campaign)
  if (!clean) return { error: 'La etiqueta no puede quedar vacía.' }

  try {
    await getDb().update(socialPosts).set({ campaign: clean }).where(eq(socialPosts.id, postId))
  } catch (error) {
    // Deferred with syncAll's rationale: isCampaignUniqueViolation lives in sync.ts,
    // which pulls in the connector tree, and that weight has no reason to load just to
    // save a campaign tag.
    const { isCampaignUniqueViolation } = await import('@/lib/social/sync')
    if (isCampaignUniqueViolation(error)) {
      // The unique index is what rejects it; two posts sharing a tag would merge histories.
      return { error: 'Otra pieza de contenido ya usa esa etiqueta.' }
    }
    return { error: 'No se pudo guardar. Intenta de nuevo.' }
  }

  revalidatePath('/admin/content')
  revalidatePath('/admin/analytics')
  // Return the normalised value: the caller's typed text and what actually got
  // stored can differ (spaces become hyphens, etc), and the copy button must hand
  // out a link with the tag the database actually holds.
  return { ok: true, campaign: clean }
}
