import type { PublishMedia, PublishInput, PublishOutcome, Publisher } from './publisher'
import { PUBLISH_NETWORK_ERROR, PUBLISH_REJECTED } from './publisher'
import type { SocialAccount } from '@/db'
import { getDb, socialAccounts } from '@/db'
import { eq } from 'drizzle-orm'
import { env } from '@/lib/env'
import { decryptToken, encryptToken } from '../crypto'
import { randomUUID } from 'node:crypto'

export const YOUTUBE_ONLY_VIDEO = 'YouTube solo recibe video.'

const MAX_TITLE = 100

/** YouTube demands a non-empty title; an untitled post falls back to a plain word. */
export function youtubeTitle(caption: string): string {
  const firstLine = caption
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return (firstLine ?? 'Video').slice(0, MAX_TITLE) || 'Video'
}

export function youtubeMetadata(caption: string): {
  snippet: { title: string; description: string }
  status: { privacyStatus: 'public'; selfDeclaredMadeForKids: false }
} {
  return {
    snippet: { title: youtubeTitle(caption), description: caption },
    // Business content, deliberately declared not-for-kids: the spec's default, and a
    // declaration YouTube requires on every upload.
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  }
}

export function singleVideo(media: PublishMedia[]): PublishMedia | null {
  if (media.length !== 1) return null
  const only = media[0]!
  return only.mediaType === 'video' ? only : null
}

/**
 * Only processed/failed/rejected/deleted are verdicts; anything else keeps waiting —
 * the same anti-guessing rule as the Meta publishers. An empty list is a verdict too:
 * a video that vanished from videos.list is never going to finish.
 */
export function classifyUploadStatus(
  payload: Record<string, unknown>,
): 'ready' | 'processing' | 'error' {
  const items = payload.items as Array<{ status?: { uploadStatus?: string } }> | undefined
  if (!items || items.length === 0) return 'error'
  const status = items[0]?.status?.uploadStatus
  if (status === 'processed') return 'ready'
  if (status === 'failed' || status === 'rejected' || status === 'deleted') return 'error'
  return 'processing'
}

/** The two-part multipart/related body videos.insert expects: metadata, then bytes. */
export function youtubeUploadBody(
  metadataJson: string,
  video: Uint8Array,
  boundary: string,
): Uint8Array {
  const encoder = new TextEncoder()
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n--${boundary}\r\nContent-Type: video/*\r\n\r\n`,
  )
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(head.length + video.length + tail.length)
  body.set(head, 0)
  body.set(video, head.length)
  body.set(tail, head.length + video.length)
  return body
}

const REFRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * The write credential: OAuth, not the read-side API key. Refreshes itself when the
 * hourly token is about to die — Google's refresh answer carries no new refresh token,
 * so the stored one survives — and re-encrypts what it saves, like every credential
 * in this repo.
 */
async function ensureYoutubeCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken || !account.refreshToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return token

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decryptToken(account.refreshToken),
    }),
  })
  if (!response.ok) {
    console.error('Google refresh:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart'

export const youtubePublisher: Publisher = {
  network: 'youtube',
  ensureCredential: ensureYoutubeCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    // Resuming: the video is uploaded and YouTube is still processing it.
    if (input.containerId) {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status&id=${input.containerId}`,
        { headers: { Authorization: `Bearer ${input.token}` } },
      )
      if (!response.ok) {
        console.error('YouTube video status:', response.status, (await response.text()).slice(0, 300))
        return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      }
      const verdict = classifyUploadStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: PUBLISH_REJECTED }
      if (verdict === 'processing') return { kind: 'processing', containerId: input.containerId }
      return { kind: 'published', externalId: input.containerId }
    }

    const video = singleVideo(input.media)
    if (!video) return { kind: 'failed', reason: YOUTUBE_ONLY_VIDEO }

    const blob = await fetch(video.url)
    if (!blob.ok) {
      console.error('No se pudo leer el video del Blob:', blob.status)
      return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const boundary = `frontera-${randomUUID()}`
    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: youtubeUploadBody(JSON.stringify(youtubeMetadata(input.caption)), bytes, boundary) as BodyInit,
    })
    if (!response.ok) {
      console.error('YouTube upload:', response.status, (await response.text()).slice(0, 300))
      return { kind: 'failed', reason: PUBLISH_REJECTED }
    }
    const data = (await response.json()) as { id?: string }
    if (typeof data.id !== 'string') return { kind: 'failed', reason: PUBLISH_REJECTED }
    return { kind: 'processing', containerId: data.id }
  },
}
