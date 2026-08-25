import type { SocialAccount } from '@/db'
import { env } from '../env'
import {
  MAX_POSTS_PER_SYNC,
  NO_METRICS,
  type Connector,
  type FetchedBatch,
  type FetchedPost,
} from './connector'

export type YouTubeVideo = {
  id: string
  snippet?: {
    publishedAt?: string
    title?: string
    thumbnails?: Record<string, { url?: string } | undefined>
  }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
  contentDetails?: { duration?: string }
}

const PAGE_SIZE = 50
// Bounds page fetches independently of how many ids a page actually yields: a page can
// return zero eligible `videoId` entries (e.g. every video on it was deleted) while the
// API still hands back a `nextPageToken`, which would otherwise starve the ids.length
// check below and loop forever.
const MAX_PLAYLIST_PAGES = 50

/** `null` rather than 0: YouTube omits a counter the creator chose to hide. */
function count(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** ISO 8601 duration to seconds. Only the shapes YouTube actually emits. */
function durationSeconds(raw: string | undefined): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(raw ?? '')
  if (!match) return null
  const [, h, m, s] = match
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)
}

export function normalizeYouTubeVideo(item: YouTubeVideo): FetchedPost {
  const seconds = durationSeconds(item.contentDetails?.duration)
  const thumbnails = item.snippet?.thumbnails ?? {}

  return {
    externalId: item.id,
    permalink: `https://www.youtube.com/watch?v=${item.id}`,
    caption: item.snippet?.title ?? null,
    thumbnailUrl: thumbnails.medium?.url ?? thumbnails.high?.url ?? null,
    // An unmatched duration (e.g. a live/premiere placeholder like "P0D") falls through
    // to 'video' — the safe default when we don't actually know the length.
    mediaType: seconds !== null && seconds < 60 ? 'short' : 'video',
    publishedAt: new Date(item.snippet?.publishedAt ?? 0),
    metrics: {
      ...NO_METRICS,
      views: count(item.statistics?.viewCount),
      likes: count(item.statistics?.likeCount),
      comments: count(item.statistics?.commentCount),
    },
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`YouTube ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  return response.json()
}

async function uploadsPlaylistId(channelId: string, apiKey: string): Promise<string> {
  const data = (await getJson(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`,
  )) as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }

  const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error(`No uploads playlist for channel ${channelId}`)
  return uploads
}

export const youtubeConnector: Connector = {
  network: 'youtube',

  // No OAuth: the Data API serves public statistics against an API key alone.
  async ensureCredential() {
    return env('YOUTUBE_API_KEY') ?? null
  },

  async fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedBatch> {
    const apiKey = token
    const channelId = account.externalId ?? env('YOUTUBE_CHANNEL_ID')
    if (!apiKey || !channelId) return { posts: [], windowWasCapped: false }

    const playlist = await uploadsPlaylistId(channelId, apiKey)
    const ids: string[] = []
    let pageToken = ''
    let pagesFetched = 0
    let moreToPage = false

    while (ids.length < MAX_POSTS_PER_SYNC && pagesFetched < MAX_PLAYLIST_PAGES) {
      const page = (await getJson(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails` +
          `&playlistId=${playlist}&maxResults=${PAGE_SIZE}&key=${apiKey}` +
          (pageToken ? `&pageToken=${pageToken}` : ''),
      )) as {
        items?: Array<{ contentDetails?: { videoId?: string } }>
        nextPageToken?: string
      }
      pagesFetched++

      for (const item of page.items ?? []) {
        if (ids.length >= MAX_POSTS_PER_SYNC) break
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId)
      }
      moreToPage = Boolean(page.nextPageToken)
      if (!moreToPage) break
      pageToken = page.nextPageToken!
    }

    const posts: FetchedPost[] = []
    // videos.list costs one quota unit per call regardless of how many ids it carries,
    // so the batch size is what keeps a 200-video channel at four units a day.
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const batch = ids.slice(i, i + PAGE_SIZE).join(',')
      const data = (await getJson(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails` +
          `&id=${batch}&key=${apiKey}`,
      )) as { items?: YouTubeVideo[] }
      posts.push(...(data.items ?? []).map(normalizeYouTubeVideo))
    }

    // Judged on the ids the playlist handed over, never on `posts.length`. `videos.list`
    // silently omits private and deleted videos, so one unavailable video among the
    // newest 200 turns a capped window into 199 posts — and a caller counting posts
    // would read that as an exhaustive fetch and archive the whole back catalogue.
    return {
      posts,
      windowWasCapped: ids.length >= MAX_POSTS_PER_SYNC || moreToPage,
    }
  },
}
