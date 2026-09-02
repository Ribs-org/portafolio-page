import { eq } from 'drizzle-orm'
import { getDb, socialAccounts, type SocialAccount } from '@/db'
import { env } from '@/lib/env'
import { decryptToken, encryptToken } from '../crypto'
import {
  PUBLISH_NETWORK_ERROR,
  type PublishInput,
  type PublishOutcome,
  type Publisher,
} from './publisher'

export const X_REJECTED = 'X rechazó la publicación.'
export const X_NO_VIDEO = 'X aún no recibe video desde el calendario.'
export const X_TOO_MANY_IMAGES = 'X recibe hasta cuatro imágenes.'

export function tweetBody(
  caption: string,
  mediaIds: string[],
): { text: string; media?: { media_ids: string[] } } {
  if (mediaIds.length === 0) return { text: caption }
  return { text: caption, media: { media_ids: mediaIds } }
}

const API = 'https://api.x.com/2'
const REFRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * X tokens live two hours and the refresh token ROTATES on every use: saving only the
 * access token would strand the next refresh, so both go back encrypted every time.
 */
async function ensureXCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken || !account.refreshToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const clientId = env('X_CLIENT_ID')
  const clientSecret = env('X_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptToken(account.refreshToken),
    }),
  })
  if (!response.ok) {
    console.error('X refresh:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : account.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

/** INIT → one APPEND → FINALIZE: images fit in a single segment. Returns the media id. */
async function uploadImage(token: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const init = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      command: 'INIT',
      media_type: mime,
      total_bytes: String(bytes.length),
      media_category: 'tweet_image',
    }),
  })
  if (!init.ok) {
    console.error('X media INIT:', init.status, (await init.text()).slice(0, 300))
    return null
  }
  const initData = (await init.json()) as { data?: { id?: string } }
  const mediaId = initData.data?.id
  if (typeof mediaId !== 'string') return null

  const form = new FormData()
  form.set('command', 'APPEND')
  form.set('media_id', mediaId)
  form.set('segment_index', '0')
  form.set('media', new Blob([bytes as BlobPart], { type: mime }))
  const append = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!append.ok) {
    console.error('X media APPEND:', append.status, (await append.text()).slice(0, 300))
    return null
  }

  const finalize = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ command: 'FINALIZE', media_id: mediaId }),
  })
  if (!finalize.ok) {
    console.error('X media FINALIZE:', finalize.status, (await finalize.text()).slice(0, 300))
    return null
  }
  return mediaId
}

export const xPublisher: Publisher = {
  network: 'x',
  ensureCredential: ensureXCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const media = [...input.media].sort((a, b) => a.position - b.position)
    if (media.some((m) => m.mediaType === 'video')) return { kind: 'failed', reason: X_NO_VIDEO }
    if (media.length > 4) return { kind: 'failed', reason: X_TOO_MANY_IMAGES }

    const mediaIds: string[] = []
    for (const item of media) {
      const blob = await fetch(item.url)
      if (!blob.ok) {
        console.error('No se pudo leer la imagen del Blob:', blob.status)
        return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      }
      const mime = blob.headers.get('content-type') ?? 'image/jpeg'
      const id = await uploadImage(input.token, new Uint8Array(await blob.arrayBuffer()), mime)
      if (!id) return { kind: 'failed', reason: X_REJECTED }
      mediaIds.push(id)
    }

    const response = await fetch(`${API}/tweets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(tweetBody(input.caption, mediaIds)),
    })
    if (!response.ok) {
      console.error('X tweets:', response.status, (await response.text()).slice(0, 300))
      return { kind: 'failed', reason: X_REJECTED }
    }
    const data = (await response.json()) as { data?: { id?: string } }
    const id = data.data?.id
    if (typeof id !== 'string') return { kind: 'failed', reason: X_REJECTED }
    return { kind: 'published', externalId: id }
  },
}
