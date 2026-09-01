import type { PublishMedia } from './publisher'

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
