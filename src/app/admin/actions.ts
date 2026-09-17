'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { guardar, SIN_ALMACEN } from '@/lib/storage'
import { and, asc, eq, inArray, max, ne, sql } from 'drizzle-orm'
import { getDb, links, profiles, socialAccounts, socialPosts, scheduledPosts, scheduledPostTargets, scheduledPostMedia, reglasClave } from '@/db'
import { LINK_KINDS, type LinkKind } from '@/db/schema'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { destroySession, requireAdmin, requireUser } from '@/lib/auth'
import { normalizeCampaignTag } from '@/lib/social/campaign'
import { validarRegla } from '@/lib/social/comentarios/reglas'
import { csvToBatchItems } from '@/lib/social/publish/csv'
import {
  scheduleBatch,
  MAX_BATCH_ITEMS,
  mediaToBlob,
  mediaTypeFromUrl,
  portadaExtensionError,
  portadaTypeError,
  tipoArchivo,
  PORTADA_NEEDS_VIDEO,
} from '@/lib/social/publish/batch'
import { opcionesDesdeFormulario, validarOpciones, validarOpcionesPorRed } from '@/lib/social/publish/opciones'
import { extensionDe, validateScheduleDraft } from '@/lib/social/publish/validate'
import { validateAtributos, ATRIBUTOS_ERROR, type Atributos } from '@/lib/social/publish/atributos'
import { diffMedia, diffTargets } from '@/lib/social/publish/edit'
import { crearPostProgramado } from '@/lib/social/publish/crear'
import { SinCuenta, exigirCuentas, cuentasPrimarias } from '@/lib/social/cuentas'
import { guardarCuenta, tokensDePaginas } from '@/lib/social/conectar'
import { SIN_TOKEN_DE_PAGINA } from '@/lib/social/facebook'
import { tiktokConnector } from '@/lib/social/tiktok'
import { TIKTOK_SIN_CUENTA, consultarCreador, type CreadorTikTok } from '@/lib/social/publish/tiktok-creador'
import { COOKIE_PENDIENTE, LOGIN_VENCIDO, elegidas, leerPendiente } from '@/lib/social/pendiente'
import { networkLabel } from '@/lib/networks'
import { invitar, pedir, quitar } from '@/lib/usuarios'
import { fromZonedInput, normalizeUrl, slugify } from '@/lib/utils'

export type FormState = { error?: string; ok?: boolean }

export async function logout() {
  await destroySession()
  redirect('/ingresar')
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
  await requireUser()
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
  await requireUser()
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
  await requireUser()
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
  await requireUser()
  await getDb().delete(profiles).where(eq(profiles.id, profileId))
  revalidatePath('/admin/profiles')
  redirect('/admin/profiles')
}

/** A fresh random suffix, for when a private URL has been shared too widely. */
export async function rotateSlug(profileId: string) {
  await requireUser()
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
  await requireUser()
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
  await requireUser()
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
  await requireUser()
  await getDb()
    .update(links)
    .set({ isActive: sql`not ${links.isActive}` })
    .where(and(eq(links.id, linkId), eq(links.profileId, profileId)))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
}

export async function deleteLink(linkId: string, profileId: string) {
  await requireUser()
  await getDb().delete(links).where(and(eq(links.id, linkId), eq(links.profileId, profileId)))

  revalidatePath(`/admin/profiles/${profileId}`)
  revalidatePath('/', 'layout')
}

/** Persists the order produced by the drag-and-drop list. */
export async function reorderLinks(profileId: string, orderedIds: string[]) {
  await requireUser()
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
  await requireUser()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No llegó ningún archivo.' }
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'La imagen supera los 8 MB.' }
  if (!ALLOWED_TYPES.includes(file.type)) return { error: 'Formato no soportado.' }

  try {
    const url = await guardar(`uploads/${randomUUID()}-${file.name}`, file, tipoArchivo(file))
    return { url }
  } catch (error) {
    // Sin configuración el panel debe decir qué falta, no un genérico: es el mismo
    // trato que daba la guarda del token de Vercel Blob que esto reemplaza. Se revisa
    // antes de loguear: una simple falta de configuración no es una falla real.
    if (error instanceof Error && error.message === SIN_ALMACEN) return { error: SIN_ALMACEN }
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
  await requireUser()

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
    // itself failing. Letting it propagate would reach the button as an opaque digest
    // instead of the sentence this function already returns for its other failures.
    console.error('Falló la sincronización de redes:', error)
    return { error: 'No se pudo sincronizar. Intenta de nuevo.' }
  }

  revalidatePath('/admin/accounts')

  const failed = report.filter((r) => !r.ok)
  // Una instalación sin cuentas conectadas no tiene nada que fallar.
  if (report.length > 0 && failed.length === report.length) {
    return { error: 'Ninguna red respondió. Revisa las tarjetas en Cuentas.' }
  }
  return { ok: true }
}

export async function disconnectAccount(accountId: string): Promise<void> {
  await requireUser()
  // Revoca credenciales, no identidad: la fila, sus posts y sus métricas se quedan.
  await getDb()
    .update(socialAccounts)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, lastSyncError: null })
    .where(eq(socialAccounts.id, accountId))
  revalidatePath('/admin/accounts')
}

/**
 * El final de un login con varias candidatas: crea una fila por cuenta marcada. Lee la
 * cookie de nuevo en vez de confiar en el formulario, así lo único que el navegador
 * decide es qué casillas marcó.
 */
export async function conectarElegidas(formData: FormData): Promise<void> {
  await requireUser()
  const jar = await cookies()
  const pendiente = leerPendiente(jar.get(COOKIE_PENDIENTE)?.value)
  if (!pendiente) redirect(`/admin/accounts?mensaje=${encodeURIComponent(LOGIN_VENCIDO)}`)

  const marcadas = elegidas(pendiente.candidatas, formData.getAll('ids').map(String))
  if (marcadas.length === 0) {
    redirect(`/admin/accounts/elegir?mensaje=${encodeURIComponent('Elige al menos una cuenta.')}`)
  }

  // Facebook: el token de cada página no viajó en la cookie; se pide ahora con el de usuario.
  let tokens = new Map<string, string>()
  if (pendiente.network === 'facebook') {
    try {
      tokens = await tokensDePaginas(pendiente.accessToken)
    } catch (error) {
      console.error('tokensDePaginas:', String(error).slice(0, 300))
      redirect(`/admin/accounts?mensaje=${encodeURIComponent(SIN_TOKEN_DE_PAGINA)}`)
    }
  }

  // No se guarda nada hasta que toda cuenta elegida tenga token, así una falla nunca deja
  // la conexión a medias.
  if (pendiente.network === 'facebook' && marcadas.some((c) => !tokens.get(c.externalId))) {
    redirect(`/admin/accounts?mensaje=${encodeURIComponent(SIN_TOKEN_DE_PAGINA)}`)
  }

  let fallo: string | null = null
  try {
    for (const cuenta of marcadas) {
      await guardarCuenta(pendiente.network, {
        externalId: cuenta.externalId,
        handle: cuenta.handle,
        accessToken:
          pendiente.network === 'facebook' ? tokens.get(cuenta.externalId)! : pendiente.accessToken,
        refreshToken: pendiente.refreshToken,
        expiresAt: pendiente.expiresAt ? new Date(pendiente.expiresAt) : null,
      })
    }
  } catch (error) {
    console.error('conectarElegidas:', String(error).slice(0, 300))
    fallo = 'No se pudo guardar la cuenta. Inténtalo de nuevo.'
  }
  // Fuera del try a propósito: redirect() lanza su propio error de navegación, y dentro
  // el catch lo tragaría como si fuera una falla de la base.
  if (fallo) redirect(`/admin/accounts?mensaje=${encodeURIComponent(fallo)}`)

  // Con el mismo path con que la puso el callback: borrarla sin path escribe sobre otra
  // cookie y deja esta viva sus diez minutos.
  jar.delete({ name: COOKIE_PENDIENTE, path: '/admin/accounts' })
  revalidatePath('/admin/accounts')
  const mensaje =
    marcadas.length === 1 ? `${networkLabel(pendiente.network)} conectado.` : `${marcadas.length} cuentas conectadas.`
  redirect(`/admin/accounts?mensaje=${encodeURIComponent(mensaje)}`)
}

export async function updatePostCampaign(
  postId: string,
  campaign: string,
): Promise<{ ok?: boolean; campaign?: string; error?: string }> {
  await requireUser()

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

/* ---------------------------------------------------------- scheduling -- */

/**
 * Lo que el bloque de TikTok del compositor necesita al abrirse: nombre, avatar y qué
 * privacidades puede elegir el dueño hoy. Por la cuenta primaria de TikTok, la misma a
 * la que `crearPostProgramado` va a apuntar el destino.
 */
export async function leerCreadorTikTok(): Promise<{ creador: CreadorTikTok } | { error: string }> {
  await requireUser()
  const cuentas = await cuentasPrimarias(['tiktok'])
  const id = cuentas.get('tiktok')
  if (!id) return { error: TIKTOK_SIN_CUENTA }
  const [account] = await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, id))
  const token = account ? await tiktokConnector.ensureCredential(account) : null
  if (!token) return { error: TIKTOK_SIN_CUENTA }
  return consultarCreador(token)
}

/** Los tres campos del bloque de palabra clave, crudos, listos para `validarRegla`. */
/**
 * Palabra vacía = sin regla, aunque el mensaje o la respuesta pública sigan escritos: es
 * la forma de borrar la regla desde el compositor o el editor sin tener que vaciar los
 * tres campos. `undefined` es lo que `validarRegla` lee como «sin regla».
 */
function reglaDesdeFormulario(formData: FormData): unknown {
  const palabra = String(formData.get('reglaPalabra') ?? '')
  if (palabra.trim().length === 0) return undefined
  return {
    palabra,
    mensaje: String(formData.get('reglaMensaje') ?? ''),
    respuestaPublica: String(formData.get('reglaRespuesta') ?? ''),
  }
}

export async function createScheduledPost(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser()

  const caption = String(formData.get('caption') ?? '').trim()
  const networks = formData.getAll('networks').map(String)
  const scheduledAt = fromZonedInput(String(formData.get('scheduledAt') ?? ''), SITE_TIMEZONE)
  const files = formData.getAll('media').filter((f): f is File => f instanceof File && f.size > 0)

  // f.type viene vacío para algunos .mov del navegador: tipoArchivo cae a la extensión
  // en ese caso, así un MOV válido no se cuenta como foto (y TikTok lo rechazaría por
  // mezcla) ni se guarda con mediaType 'image'.
  const esVideo = (f: File) => tipoArchivo(f).startsWith('video/')
  const videoCount = files.filter(esVideo).length
  const error = validateScheduleDraft(
    {
      caption,
      imageCount: files.length - videoCount,
      videoCount,
      networks,
      scheduledAt,
      formats: files.map((f) => extensionDe(f.name)),
    },
    new Date(),
  )
  if (error) return { error }

  // Lo que la red exige por destino, antes de subir nada: una privacidad sin elegir no
  // debe costar la subida de un video.
  const opcionesCheck = validarOpcionesPorRed(networks, opcionesDesdeFormulario(formData, networks))
  if ('error' in opcionesCheck) return { error: opcionesCheck.error }

  const reglaCheck = validarRegla(reglaDesdeFormulario(formData))
  if ('error' in reglaCheck) return { error: reglaCheck.error }

  const uploaded: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const file of files) {
    // Público a propósito: la Graph API de Instagram descarga la media desde esta URL.
    const url = await guardar(`scheduled/${randomUUID()}-${file.name}`, file, tipoArchivo(file))
    uploaded.push({ url, mediaType: esVideo(file) ? 'video' : 'image' })
  }

  try {
    await crearPostProgramado({
      caption,
      scheduledAt: scheduledAt!,
      media: uploaded,
      networks,
      opciones: opcionesCheck.opciones,
      regla: reglaCheck.regla,
    })
  } catch (error) {
    if (error instanceof SinCuenta) return { error: error.message }
    throw error
  }

  revalidatePath('/admin/schedule')
  return { ok: true }
}

export async function updateScheduledPost(
  postId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser()
  const db = getDb()

  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId))
  if (!post) return { error: 'El post ya no existe.' }

  const targets = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.postId, postId))
  if (targets.some((t) => t.status === 'publishing')) {
    return { error: 'Hay una publicación en curso. Vuelve en un minuto.' }
  }
  // El claim del cron solo bumpa updatedAt (el status sigue 'scheduled' durante el
  // vuelo): este mapa es lo único que hace visible, en los writes de abajo, un claim
  // que ocurrió entre esta lectura y el write — si el cron claimeó, el write no-opea
  // y el target conserva su historia en vez de que la pisemos.
  const readTargets = new Map(targets.map((t) => [t.id, t]))

  const existingMedia = await db
    .select()
    .from(scheduledPostMedia)
    .where(eq(scheduledPostMedia.postId, postId))
    .orderBy(asc(scheduledPostMedia.position))

  const caption = String(formData.get('caption') ?? '').trim()
  const networks = formData.getAll('networks').map(String)
  const scheduledAt = fromZonedInput(String(formData.get('scheduledAt') ?? ''), SITE_TIMEZONE)
  const keptIds = formData.getAll('keptMedia').map(String)
  const files = formData.getAll('media').filter((f): f is File => f instanceof File && f.size > 0)
  const urls = String(formData.get('mediaUrls') ?? '')
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean)
  const keepPortada = String(formData.get('keepPortada') ?? '').trim()
  const portadaUrl = String(formData.get('portadaUrl') ?? '').trim()

  const atributosRaw = String(formData.get('atributos') ?? '').trim()
  let atributos: Atributos | null = null
  if (atributosRaw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(atributosRaw)
    } catch {
      return { error: ATRIBUTOS_ERROR }
    }
    const check = validateAtributos(parsed)
    if ('error' in check) return { error: check.error }
    atributos = check.atributos
  }

  // Editar un post cuya hora ya pasó (p.ej. corregir el texto que X rechazó) no debe
  // exigir mover la fecha: si la fecha no cambió, se permite guardar en el pasado — el
  // re-arm lo manda al próximo cron, el "reintenta ahora" natural.
  const dateUnchanged = scheduledAt !== null && scheduledAt.getTime() === post.scheduledAt.getTime()

  // Una red ya publicada no debe imponer sus límites (280 de X, media obligatoria de
  // IG) a lo que aún queda por salir: solo lo pendiente entra a la validación.
  const publishedNetworks = new Set(targets.filter((t) => t.status === 'published').map((t) => t.network))
  const pendingNetworks = networks.filter((n) => !publishedNetworks.has(n))

  const targetsPlan = diffTargets(targets, networks)
  if ('error' in targetsPlan) return { error: targetsPlan.error }

  // Una red que exige opciones no se puede agregar desde el editor, que no las pide:
  // el compositor y el lote sí; aquí la creación se rechaza con la misma frase.
  for (const network of targetsPlan.create) {
    const check = validarOpciones(network, null)
    if ('error' in check) return { error: check.error }
  }

  const reglaCheck = validarRegla(reglaDesdeFormulario(formData))
  if ('error' in reglaCheck) return { error: reglaCheck.error }

  // Pre-validation before touching storage: kept media with their stored types, files
  // with their real types, URLs counted as images — the batch's deferred-type rule
  // (image is the guess that never falsely rejects; the re-check below settles it).
  const typeById = new Map(existingMedia.map((m) => [m.id, m.mediaType]))
  const urlById = new Map(existingMedia.map((m) => [m.id, m.blobUrl]))
  const keptTypes = keptIds
    .map((id) => typeById.get(id))
    .filter((t): t is 'image' | 'video' => t === 'image' || t === 'video')
  const fileVideo = files.filter((f) => f.type.startsWith('video/')).length
  const preImages =
    keptTypes.filter((t) => t === 'image').length + (files.length - fileVideo) + urls.length
  const preVideos = keptTypes.filter((t) => t === 'video').length + fileVideo
  // Igual que arriba con los tipos: la extensión conocida de cada media pendiente,
  // para que TikTok rechace un formato ajeno antes de tocar el almacén.
  const preFormats = [
    ...keptIds
      .map((id) => urlById.get(id))
      .filter((url): url is string => Boolean(url))
      .map(extensionDe),
    ...files.map((f) => extensionDe(f.name)),
    ...urls.map(extensionDe),
  ]
  if (pendingNetworks.length === 0) {
    // Sin pendientes hay dos casos: todo publicado (válido — solo se corrige texto o
    // media) o un form que desmarcó todas las redes de un post nunca publicado, lo
    // que dejaría un post huérfano sin destinos. El validador saltado habría dicho
    // exactamente esto:
    if (publishedNetworks.size === 0) return { error: 'Elige al menos una plataforma.' }
    // Igual exige una fecha legible antes de persistir.
    if (!scheduledAt) return { error: 'La fecha no se entendió.' }
  } else {
    const preError = validateScheduleDraft(
      {
        caption,
        imageCount: preImages,
        videoCount: preVideos,
        networks: pendingNetworks,
        scheduledAt,
        formats: preFormats,
      },
      new Date(),
      { allowPast: dateUnchanged },
    )
    if (preError) return { error: preError }
  }

  if (portadaUrl) {
    const extensionError = portadaExtensionError(portadaUrl)
    if (extensionError) return { error: extensionError }
  }

  // Las URLs se resuelven primero: mediaToBlob es la falla más probable (enlace roto,
  // host que no responde). Si falla acá, no quedan archivos huérfanos en el almacén
  // — el loop de guardar() de archivos corre después, solo si las URLs ya resolvieron.
  const urlMedia: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const url of urls) {
    const stored = await mediaToBlob(url, mediaTypeFromUrl(url))
    if (!stored) return { error: 'No se pudo leer una media por URL.' }
    urlMedia.push(stored)
  }
  const fileMedia: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const file of files) {
    const url = await guardar(`scheduled/${randomUUID()}-${file.name}`, file, tipoArchivo(file))
    fileMedia.push({ url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
  }
  const added = [...fileMedia, ...urlMedia]

  const mediaPlan = diffMedia(existingMedia.map((m) => m.id), keptIds, added)

  // Re-check with the real types now that every URL resolved (a Drive link that
  // turned out to be a video where only images fit fails here, nothing saved).
  const finalTypes = mediaPlan.order.map((entry) =>
    entry.kind === 'kept' ? typeById.get(entry.id)! : entry.mediaType,
  )
  const finalFormats = mediaPlan.order.map((entry) =>
    extensionDe(entry.kind === 'kept' ? urlById.get(entry.id)! : entry.url),
  )
  if (pendingNetworks.length > 0) {
    const error = validateScheduleDraft(
      {
        caption,
        imageCount: finalTypes.filter((t) => t === 'image').length,
        videoCount: finalTypes.filter((t) => t === 'video').length,
        networks: pendingNetworks,
        scheduledAt,
        formats: finalFormats,
      },
      new Date(),
      { allowPast: dateUnchanged },
    )
    if (error) return { error }
  }

  // Conservar solo coteja contra lo guardado — el mismo trato que keptMedia con sus
  // ids: el form dice «mantén lo que hay», nunca dicta una URL cruda.
  const portadaKept = Boolean(keepPortada) && keepPortada === post.coverUrl

  // El chequeo de video corre ANTES de descargar/subir la portada nueva — igual que en
  // el lote (batch.ts): si el resultado ya es una portada sin video, no vale la pena
  // pagar esa descarga.
  if ((portadaUrl || portadaKept) && !finalTypes.includes('video')) {
    return { error: PORTADA_NEEDS_VIDEO }
  }

  // La URL nueva gana sobre la conservada; ninguna de las dos = quitarla (null).
  let coverUrl: string | null = portadaKept ? keepPortada : null
  if (portadaUrl) {
    const stored = await mediaToBlob(portadaUrl, null)
    if (!stored) return { error: 'No se pudo leer una media por URL.' }
    const typeError = portadaTypeError(stored)
    if (typeError) return { error: typeError }
    coverUrl = stored.url
  }

  // Sequential writes (neon-http has no interactive transactions); worst-case cut
  // leaves media updated with old targets — the same partial-failure profile already
  // accepted in createScheduledPost. Every target write carries its status guard y el
  // updatedAt leído arriba (readTargets), so a cron claim between the read above and
  // here makes the write no-op instead of clobbering the in-flight attempt.
  await db
    .update(scheduledPosts)
    .set({ caption, scheduledAt: scheduledAt!, coverUrl, atributos, updatedAt: new Date() })
    .where(eq(scheduledPosts.id, postId))

  if (mediaPlan.deleteIds.length > 0) {
    await db.delete(scheduledPostMedia).where(inArray(scheduledPostMedia.id, mediaPlan.deleteIds))
  }
  for (const [position, entry] of mediaPlan.order.entries()) {
    if (entry.kind === 'kept') {
      await db.update(scheduledPostMedia).set({ position }).where(eq(scheduledPostMedia.id, entry.id))
    } else {
      await db.insert(scheduledPostMedia).values({
        postId,
        blobUrl: entry.url,
        mediaType: entry.mediaType,
        position,
      })
    }
  }

  if (targetsPlan.create.length > 0) {
    let cuentas: Map<string, string>
    try {
      cuentas = await exigirCuentas(targetsPlan.create)
    } catch (error) {
      if (error instanceof SinCuenta) return { error: error.message }
      throw error
    }
    await db
      .insert(scheduledPostTargets)
      .values(targetsPlan.create.map((network) => ({ postId, network, accountId: cuentas.get(network)! })))
  }
  for (const id of targetsPlan.deleteIds) {
    await db.delete(scheduledPostTargets).where(
      and(
        eq(scheduledPostTargets.id, id),
        inArray(scheduledPostTargets.status, ['scheduled', 'failed']),
        eq(scheduledPostTargets.updatedAt, readTargets.get(id)!.updatedAt),
      ),
    )
  }
  for (const id of targetsPlan.rearmIds) {
    // containerId/externalId son residuos del intento fallido (el handle async de Meta,
    // el id remoto a medio crear): el rearm parte de cero, como rescheduleTarget.
    await db
      .update(scheduledPostTargets)
      .set({
        status: 'scheduled',
        attemptCount: 0,
        lastError: null,
        containerId: null,
        externalId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scheduledPostTargets.id, id),
          eq(scheduledPostTargets.status, 'failed'),
          eq(scheduledPostTargets.updatedAt, readTargets.get(id)!.updatedAt),
        ),
      )
  }

  // La regla se edita siempre, incluso publicado el post: rige para los comentarios que
  // lleguen desde ahora. Palabra vacía la borra.
  if (reglaCheck.regla) {
    await db
      .insert(reglasClave)
      .values({ postId, ...reglaCheck.regla })
      .onConflictDoUpdate({
        target: reglasClave.postId,
        set: { ...reglaCheck.regla, updatedAt: new Date() },
      })
  } else {
    await db.delete(reglasClave).where(eq(reglasClave.postId, postId))
  }

  revalidatePath('/admin/schedule')

  // Only our own schedule views are valid return targets; anything else in `volver`
  // (a crafted form) falls back to the plain page.
  const volver = String(formData.get('volver') ?? '')
  redirect(volver.startsWith('/admin/schedule') ? volver : '/admin/schedule')
}

export async function rescheduleTarget(targetId: string, localDatetime: string): Promise<FormState> {
  await requireUser()

  const scheduledAt = fromZonedInput(localDatetime, SITE_TIMEZONE)
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    return { error: 'La hora debe estar en el futuro.' }
  }

  const db = getDb()
  const [target] = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.id, targetId))
  if (!target) return { error: 'Ese destino ya no existe.' }

  await db.update(scheduledPosts).set({ scheduledAt, updatedAt: new Date() }).where(eq(scheduledPosts.id, target.postId))
  // Back to square one: attempts spent against the old hour say nothing about the new one.
  await db
    .update(scheduledPostTargets)
    .set({ status: 'scheduled', attemptCount: 0, lastError: null, containerId: null, updatedAt: new Date() })
    .where(eq(scheduledPostTargets.id, targetId))

  revalidatePath('/admin/schedule')
  return { ok: true }
}

export async function deleteScheduledPost(postId: string): Promise<FormState> {
  await requireUser()

  const db = getDb()
  const targets = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.postId, postId))
  // Deleting the row cannot unpublish the post on the network — refuse instead of lying.
  if (targets.some((t) => t.status === 'published' || t.status === 'publishing')) {
    return { error: 'Ya se publicó (o está publicando): elimínalo en la red.' }
  }

  await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId))
  revalidatePath('/admin/schedule')
  return { ok: true }
}

/* ---------------------------------------------------------- batch upload -- */

export type BatchRow = { fila: number; ok: boolean; detalle: string }
export type BatchState = { error?: string; filas?: BatchRow[] }

export async function uploadBatch(_prev: BatchState, formData: FormData): Promise<BatchState> {
  await requireUser()

  const file = formData.get('archivo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Adjunta un archivo CSV.' }

  const parsed = csvToBatchItems(await file.text())
  if ('error' in parsed) return { error: parsed.error }
  if (parsed.items.length === 0) return { error: 'El CSV no trae filas de posts.' }
  if (parsed.items.length > MAX_BATCH_ITEMS) {
    return { error: `Máximo ${MAX_BATCH_ITEMS} posts por lote.` }
  }

  const resultados = await scheduleBatch(parsed.items)
  revalidatePath('/admin/schedule')
  return {
    // +2: la fila 1 del archivo es el encabezado, y la gente cuenta desde 1.
    filas: resultados.map((r) => ({
      fila: r.index + 2,
      ok: r.ok,
      detalle: r.ok ? 'Programado' : r.error,
    })),
  }
}

/* -------------------------------------------------------- comentarios -- */

export async function responderComentario(id: string, texto: string): Promise<FormState> {
  await requireUser()
  // Diferido: el módulo carga los conectores de cada red solo cuando alguien de verdad
  // aprieta «Enviar».
  const { responderComentario: responder } = await import('@/lib/social/comentarios/responder')
  const resultado = await responder(id, texto)
  revalidatePath('/admin/comments')
  return 'error' in resultado ? { error: resultado.error } : { ok: true }
}

export async function descartarComentario(id: string): Promise<FormState> {
  await requireUser()
  const { descartarComentario: descartar } = await import('@/lib/social/comentarios/responder')
  await descartar(id)
  revalidatePath('/admin/comments')
  return { ok: true }
}

export async function reintentarBorrador(id: string): Promise<FormState> {
  await requireUser()
  const { redactarUno } = await import('@/lib/social/comentarios/redaccion')
  const resultado = await redactarUno(id)
  revalidatePath('/admin/comments')
  return 'error' in resultado ? { error: resultado.error } : { ok: true }
}

export async function guardarInstruccionesComentarios(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser()
  const { CLAVE_INSTRUCCIONES, normalizarInstrucciones } = await import(
    '@/lib/social/comentarios/instrucciones'
  )
  const { guardarAjuste } = await import('@/lib/ajustes')
  const bruto = String(formData.get('instrucciones') ?? '')
  await guardarAjuste(CLAVE_INSTRUCCIONES, normalizarInstrucciones(bruto))
  revalidatePath('/admin/comments')
  return { ok: true }
}

/* --- usuarios -- */

export async function invitarUsuario(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin()
  const resultado = await invitar(String(formData.get('correo') ?? ''), String(formData.get('nombre') ?? '') || null)
  if ('error' in resultado) return { error: resultado.error }
  // El primer código sale con la invitación: el invitado entra sin pedir nada.
  await pedir(resultado.usuario.correo)
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function quitarUsuario(id: string): Promise<{ error?: string }> {
  await requireAdmin()
  const resultado = await quitar(id)
  revalidatePath('/admin/usuarios')
  return 'error' in resultado ? { error: resultado.error } : {}
}
