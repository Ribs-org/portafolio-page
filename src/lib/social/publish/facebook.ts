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
 * The feed story id (`{pageId}_{postId}`) — the id space the read connector stores in
 * socialPosts (it lists `/{page}/published_posts`). A video's own id and a photo's own
 * id live in different spaces, so recording those instead means the metrics API can
 * never join a post's attributes to how it actually did. The fallback keeps a publish
 * from failing over a missing field: a wrong-space id still beats losing the post.
 */
export function storyId(payload: Record<string, unknown> | null, fallback: string): string {
  const postId = payload?.post_id
  return typeof postId === 'string' && postId.length > 0 ? postId : fallback
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

/**
 * /videos no acepta una URL de portada — `thumb` viaja en bytes. La portada ya
 * vive en nuestro Blob; si su descarga falla, el video sale sin ella (best-effort:
 * jamás se sacrifica el video por la portada) y el motivo queda en el log.
 */
async function fetchCoverBlob(coverUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(coverUrl, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      console.error('Portada de Facebook:', response.status, coverUrl.slice(0, 200))
      return null
    }
    return await response.blob()
  } catch (error) {
    console.error('Portada de Facebook:', String(error).slice(0, 300))
    return null
  }
}

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
        `${GRAPH}/${input.containerId}?fields=status,post_id&access_token=${token}`,
      )
      if (!response.ok) {
        console.error('Facebook video status:', response.status, (await response.text()).slice(0, 300))
        // A poll that didn't answer says nothing about the video: stay parked instead of
        // failing — a retry from scratch would upload a second public copy. The 24h stale
        // cut still bounds how long this can wait.
        return { kind: 'processing', containerId: input.containerId }
      }
      const payload = (await response.json()) as Record<string, unknown>
      const verdict = classifyVideoStatus(payload)
      if (verdict === 'error') return { kind: 'failed', reason: FACEBOOK_REJECTED }
      if (verdict === 'processing') return { kind: 'processing', containerId: input.containerId }
      return { kind: 'published', externalId: storyId(payload, input.containerId) }
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
      const params = { ...videoPostParams(input.caption, media[0]!), access_token: token }
      const cover = input.coverUrl ? await fetchCoverBlob(input.coverUrl) : null
      let data: Record<string, unknown> | null
      if (cover) {
        const form = new FormData()
        for (const [key, value] of Object.entries(params)) form.set(key, value)
        form.set('thumb', cover, 'portada.jpg')
        const response = await fetch(`${GRAPH}/${input.accountExternalId}/videos`, {
          method: 'POST',
          body: form,
        })
        if (!response.ok) {
          console.error('Facebook publish:', response.status, (await response.text()).slice(0, 300))
          data = null
        } else {
          data = await response.json()
        }
      } else {
        data = await postForm(`${GRAPH}/${input.accountExternalId}/videos`, params)
      }
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
      // /photos answers with the photo's own id; its `post_id` is the feed story.
      return { kind: 'published', externalId: storyId(data, id) }
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
