import type { PublishMedia } from './publisher'

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
