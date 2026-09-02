import {
  PUBLISH_NETWORK_ERROR,
  type PublishInput,
  type PublishMedia,
  type PublishOutcome,
  type Publisher,
} from './publisher'

export const FACEBOOK_MIXED_MEDIA = 'Facebook no admite mezclar video y fotos en un post.'
export const FACEBOOK_REJECTED = 'Facebook rechazó la publicación.'

export function photoPostParams(caption: string, media: PublishMedia): Record<string, string> {
  return { url: media.url, caption }
}

// The text goes once, on the /feed post; each photo waits unpublished and invisible
// until the parent post attaches it.
export function unpublishedPhotoParams(media: PublishMedia): Record<string, string> {
  return { url: media.url, published: 'false' }
}

export function multiPhotoFeedParams(caption: string, fbids: string[]): Record<string, string> {
  const params: Record<string, string> = { message: caption }
  fbids.forEach((fbid, index) => {
    params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: fbid })
  })
  return params
}

export function videoPostParams(caption: string, media: PublishMedia): Record<string, string> {
  return { file_url: media.url, description: caption }
}

/**
 * Only 'ready' and 'error' are verdicts. Everything else — processing, upload_complete,
 * an absent field — keeps waiting: same anti-guessing rule as Instagram's containers.
 */
export function classifyVideoStatus(
  payload: Record<string, unknown>,
): 'ready' | 'processing' | 'error' {
  const status = (payload.status as { video_status?: string } | undefined)?.video_status
  if (status === 'ready') return 'ready'
  if (status === 'error') return 'error'
  return 'processing'
}

/** One /feed post cannot attach a video alongside photos; refusing beats surprising. */
export function hasMixedMedia(media: PublishMedia[]): boolean {
  return media.some((m) => m.mediaType === 'video') && media.some((m) => m.mediaType === 'image')
}

const GRAPH = 'https://graph.facebook.com/v23.0'

// Same shape as the Instagram publisher's postForm, duplicated on purpose — the
// connectors already set that precedent, and sharing it would couple two networks'
// error logs. Upstream bodies go to the log; callers only see fixed sentences.
async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) })
  if (!response.ok) {
    console.error('Facebook publish:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  return response.json()
}

export const facebookPublisher: Publisher = {
  network: 'facebook',

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const token = input.token

    // Resuming: a previous run posted the video and Facebook was still processing it.
    if (input.containerId) {
      const response = await fetch(
        `${GRAPH}/${input.containerId}?fields=status&access_token=${token}`,
      )
      if (!response.ok) {
        console.error('Facebook video status:', response.status, (await response.text()).slice(0, 300))
        // A poll that didn't answer says nothing about the video: stay parked instead of
        // failing — a retry from scratch would upload a second public copy. The 24h stale
        // cut still bounds how long this can wait.
        return { kind: 'processing', containerId: input.containerId }
      }
      const verdict = classifyVideoStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: FACEBOOK_REJECTED }
      if (verdict === 'processing') return { kind: 'processing', containerId: input.containerId }
      return { kind: 'published', externalId: input.containerId }
    }

    const media = [...input.media].sort((a, b) => a.position - b.position)

    // A text-only post goes straight to /feed — the gift the per-target validation
    // paid for when Threads and X made file-less posts legal.
    if (media.length === 0) {
      const data = await postForm(`${GRAPH}/${input.accountExternalId}/feed`, {
        message: input.caption,
        access_token: token,
      })
      const id = data?.id
      if (typeof id !== 'string') return { kind: 'failed', reason: FACEBOOK_REJECTED }
      return { kind: 'published', externalId: id }
    }

    if (hasMixedMedia(media)) return { kind: 'failed', reason: FACEBOOK_MIXED_MEDIA }

    // Single video: /videos answers with the id right away and processes on its own;
    // parking on it reuses the same state machine as Instagram's containers.
    if (media.length === 1 && media[0]!.mediaType === 'video') {
      const data = await postForm(`${GRAPH}/${input.accountExternalId}/videos`, {
        ...videoPostParams(input.caption, media[0]!),
        access_token: token,
      })
      const id = data?.id
      if (typeof id !== 'string') return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      return { kind: 'processing', containerId: id }
    }

    // Single photo publishes in one call.
    if (media.length === 1) {
      const data = await postForm(`${GRAPH}/${input.accountExternalId}/photos`, {
        ...photoPostParams(input.caption, media[0]!),
        access_token: token,
      })
      const id = data?.id
      if (typeof id !== 'string') return { kind: 'failed', reason: FACEBOOK_REJECTED }
      return { kind: 'published', externalId: id }
    }

    // Several photos: upload each unpublished, then one /feed post attaches them all.
    const fbids: string[] = []
    for (const item of media) {
      const data = await postForm(`${GRAPH}/${input.accountExternalId}/photos`, {
        ...unpublishedPhotoParams(item),
        access_token: token,
      })
      const id = data?.id
      if (typeof id !== 'string') return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      fbids.push(id)
    }
    const post = await postForm(`${GRAPH}/${input.accountExternalId}/feed`, {
      ...multiPhotoFeedParams(input.caption, fbids),
      access_token: token,
    })
    const postId = post?.id
    if (typeof postId !== 'string') return { kind: 'failed', reason: FACEBOOK_REJECTED }
    return { kind: 'published', externalId: postId }
  },
}
