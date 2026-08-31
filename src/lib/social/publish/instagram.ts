import type { PublishMedia, PublishInput, PublishOutcome, Publisher } from './publisher'
import { PUBLISH_NETWORK_ERROR, PUBLISH_REJECTED } from './publisher'

export function photoContainerParams(caption: string, media: PublishMedia): Record<string, string> {
  return { image_url: media.url, caption }
}

// REELS rather than VIDEO: since v21 it is the only media_type Graph accepts for
// standalone feed video.
export function reelContainerParams(caption: string, media: PublishMedia): Record<string, string> {
  return { media_type: 'REELS', video_url: media.url, caption }
}

export function carouselChildParams(media: PublishMedia): Record<string, string> {
  if (media.mediaType === 'video') {
    return { media_type: 'VIDEO', video_url: media.url, is_carousel_item: 'true' }
  }
  return { image_url: media.url, is_carousel_item: 'true' }
}

export function carouselParentParams(caption: string, childIds: string[]): Record<string, string> {
  return { media_type: 'CAROUSEL', children: childIds.join(','), caption }
}

/**
 * Only FINISHED/ERROR/EXPIRED are verdicts. Anything else — IN_PROGRESS, an absent
 * field, a status we don't know — keeps waiting: guessing "done" publishes a broken
 * container, guessing "error" throws away a post that was about to finish.
 */
export function classifyContainerStatus(
  payload: Record<string, unknown>,
): 'finished' | 'in_progress' | 'error' {
  const status = payload.status_code
  if (status === 'FINISHED') return 'finished'
  if (status === 'ERROR' || status === 'EXPIRED') return 'error'
  return 'in_progress'
}

const GRAPH = 'https://graph.facebook.com/v23.0'

// POST with form params, never JSON: it is what /media and /media_publish expect.
// Upstream error bodies go to the log; the caller only ever sees fixed sentences.
async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) })
  if (!response.ok) {
    console.error('Instagram publish:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  return response.json()
}

async function createContainer(
  input: PublishInput,
  params: Record<string, string>,
): Promise<string | null> {
  const data = await postForm(`${GRAPH}/${input.accountExternalId}/media`, {
    ...params,
    access_token: input.token,
  })
  const id = data?.id
  return typeof id === 'string' ? id : null
}

async function publishContainer(input: PublishInput, containerId: string): Promise<PublishOutcome> {
  const data = await postForm(`${GRAPH}/${input.accountExternalId}/media_publish`, {
    creation_id: containerId,
    access_token: input.token,
  })
  const id = data?.id
  if (typeof id !== 'string') return { kind: 'failed', reason: PUBLISH_REJECTED }
  return { kind: 'published', externalId: id }
}

export const instagramPublisher: Publisher = {
  network: 'instagram',

  async publish(input: PublishInput): Promise<PublishOutcome> {
    // Resuming: a previous run created the container and Meta was still processing.
    if (input.containerId) {
      const response = await fetch(
        `${GRAPH}/${input.containerId}?fields=status_code&access_token=${input.token}`,
      )
      if (!response.ok) {
        console.error('Instagram container status:', response.status, (await response.text()).slice(0, 300))
        return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      }
      const verdict = classifyContainerStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: PUBLISH_REJECTED }
      if (verdict === 'in_progress') return { kind: 'processing', containerId: input.containerId }
      return publishContainer(input, input.containerId)
    }

    const media = [...input.media].sort((a, b) => a.position - b.position)

    // Single photo is the one synchronous path: containers for images are ready at
    // once, so create-and-publish in the same run.
    if (media.length === 1 && media[0]!.mediaType === 'image') {
      const containerId = await createContainer(input, photoContainerParams(input.caption, media[0]!))
      if (!containerId) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      return publishContainer(input, containerId)
    }

    // Single video: create the container and park — Meta processes it asynchronously
    // and the next cron run polls status_code before publishing.
    if (media.length === 1) {
      const containerId = await createContainer(input, reelContainerParams(input.caption, media[0]!))
      if (!containerId) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      return { kind: 'processing', containerId }
    }

    // Carousel: children first, then the parent, then park on the parent — its
    // status_code only turns FINISHED once every child (video included) is done.
    const childIds: string[] = []
    for (const item of media) {
      const childId = await createContainer(input, carouselChildParams(item))
      if (!childId) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      childIds.push(childId)
    }
    const parentId = await createContainer(input, carouselParentParams(input.caption, childIds))
    if (!parentId) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
    return { kind: 'processing', containerId: parentId }
  },
}
