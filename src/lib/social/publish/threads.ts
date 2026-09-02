import { eq } from 'drizzle-orm'
import { getDb, socialAccounts, type SocialAccount } from '@/db'
import { decryptToken, encryptToken } from '../crypto'
import {
  PUBLISH_NETWORK_ERROR,
  type PublishInput,
  type PublishMedia,
  type PublishOutcome,
  type Publisher,
} from './publisher'

export const THREADS_REJECTED = 'Threads rechazó la publicación.'
export const THREADS_SINGLE_FILE = 'Threads recibe un solo archivo por post.'

export function threadsContainerParams(
  caption: string,
  media: PublishMedia | null,
): Record<string, string> {
  if (!media) return { media_type: 'TEXT', text: caption }
  if (media.mediaType === 'video') {
    return { media_type: 'VIDEO', video_url: media.url, text: caption }
  }
  return { media_type: 'IMAGE', image_url: media.url, text: caption }
}

/** Same anti-guessing rule as every container on this codebase. */
export function classifyThreadsStatus(
  payload: Record<string, unknown>,
): 'finished' | 'in_progress' | 'error' {
  const status = payload.status
  if (status === 'FINISHED') return 'finished'
  if (status === 'ERROR' || status === 'EXPIRED') return 'error'
  return 'in_progress'
}

const GRAPH = 'https://graph.threads.net/v1.0'
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Threads' long-lived token refreshes itself (th_refresh_token, no refresh token
 * involved) — but only while it is still alive and older than a day, so the window
 * is a generous week before expiry.
 */
async function ensureThreadsCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`,
  )
  if (!response.ok) {
    console.error('Threads refresh:', response.status, (await response.text()).slice(0, 300))
    return token
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return token

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) })
  if (!response.ok) {
    console.error('Threads publish:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  return response.json()
}

async function publishContainer(input: PublishInput, containerId: string): Promise<PublishOutcome> {
  const data = await postForm(`${GRAPH}/${input.accountExternalId}/threads_publish`, {
    creation_id: containerId,
    access_token: input.token,
  })
  const id = data?.id
  if (typeof id !== 'string') return { kind: 'failed', reason: THREADS_REJECTED }
  return { kind: 'published', externalId: id }
}

export const threadsPublisher: Publisher = {
  network: 'threads',
  ensureCredential: ensureThreadsCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    if (input.containerId) {
      const response = await fetch(
        `${GRAPH}/${input.containerId}?fields=status&access_token=${input.token}`,
      )
      if (!response.ok) {
        console.error('Threads container status:', response.status, (await response.text()).slice(0, 300))
        // A poll that didn't answer says nothing about the video: stay parked — the
        // 24h stale cut still bounds the wait. Same lesson as YouTube and Facebook.
        return { kind: 'processing', containerId: input.containerId }
      }
      const verdict = classifyThreadsStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: THREADS_REJECTED }
      if (verdict === 'in_progress') return { kind: 'processing', containerId: input.containerId }
      return publishContainer(input, input.containerId)
    }

    const media = [...input.media].sort((a, b) => a.position - b.position)
    if (media.length > 1) return { kind: 'failed', reason: THREADS_SINGLE_FILE }
    const only = media[0] ?? null

    const container = await postForm(`${GRAPH}/${input.accountExternalId}/threads`, {
      ...threadsContainerParams(input.caption, only),
      access_token: input.token,
    })
    const containerId = container?.id
    if (typeof containerId !== 'string') return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }

    // Text and single images are ready at once; video processes asynchronously and
    // parks on the container like Instagram's reels.
    if (only?.mediaType === 'video') return { kind: 'processing', containerId }
    return publishContainer(input, containerId)
  },
}
