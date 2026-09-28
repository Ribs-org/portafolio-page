import type { PublishMedia, PublishInput, PublishOutcome, Publisher } from './publisher'
import { PUBLISH_NETWORK_ERROR, PUBLISH_REJECTED, TRIAL_REEL_NO_DISPONIBLE } from './publisher'
import type { OpcionesDestino } from './opciones'

export function photoContainerParams(caption: string, media: PublishMedia): Record<string, string> {
  return { image_url: media.url, caption }
}

// Always MANUAL: the owner graduates the reel from the Instagram app (their call,
// 2026-09-28). `trial_params` is a JSON object on Meta's side, but /media is form
// encoded, so it travels as a JSON string.
const TRIAL_PARAMS = JSON.stringify({ graduation_strategy: 'MANUAL' })

// REELS rather than VIDEO: since v21 it is the only media_type Graph accepts for
// standalone feed video.
// La portada diseñada del reel; el carrusel y la foto no la llevan — Graph solo
// la acepta en el contenedor REELS.
export function reelContainerParams(
  caption: string,
  media: PublishMedia,
  coverUrl: string | null,
  opciones: OpcionesDestino | null = null,
): Record<string, string> {
  const params: Record<string, string> = { media_type: 'REELS', video_url: media.url, caption }
  if (coverUrl) params.cover_url = coverUrl
  if (opciones && 'trialReel' in opciones) params.trial_params = TRIAL_PARAMS
  return params
}

/**
 * Meta does not document which code a trial-reel rejection carries, so this matches on
 * the message text — and only when a trial reel was asked for, so an unrelated error
 * that happens to say "trial" on a normal reel keeps its usual treatment. The cost
 * when the wording does not match (Meta changes it, or rejects for a reason it phrases
 * without the word — a private account, the daily quota): the rejection is treated as
 * a network failure and retried up to MAX_PUBLISH_ATTEMPTS times before the target
 * fails, with a sentence that promises a retry Meta already refused. That is the same
 * treatment every non-ok gets on a normal reel today; this function only narrows it
 * for the one case Meta lets us recognise. Tracked in docs/deuda-tecnica.md.
 */
export function motivoDeRechazo(cuerpo: string, opciones: OpcionesDestino | null): string | null {
  if (!opciones || !('trialReel' in opciones)) return null
  return /trial/i.test(cuerpo) ? TRIAL_REEL_NO_DISPONIBLE : null
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
// Upstream error bodies go to the log as always, and now also come back to the caller
// (as `rechazo`, the raw text) so a trial-reel rejection can be told apart from a
// plain network failure. `postForm` itself does not know what a trial reel is — that
// judgement is `motivoDeRechazo`'s, in the one caller that has `opciones` to ask it.
async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<{ data: Record<string, unknown> } | { rechazo: string }> {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) })
  if (!response.ok) {
    const rechazo = (await response.text()).slice(0, 300)
    console.error('Instagram publish:', response.status, rechazo)
    return { rechazo }
  }
  return { data: await response.json() }
}

/**
 * `definitivo: true` viaja solo cuando `motivoDeRechazo` reconoció el rechazo: Meta ya
 * decidió que no, y `resolveOutcome` lo hace fallar en este mismo intento en vez de
 * reintentarlo. Cualquier otro `failed` —incluido el de `publishContainer`, que no pasa
 * por acá— sigue sin la propiedad, y `resolveOutcome` lo trata exactamente como hoy.
 */
async function createContainer(
  input: PublishInput,
  params: Record<string, string>,
): Promise<{ id: string } | { failed: string; definitivo?: true }> {
  const r = await postForm(`${GRAPH}/${input.accountExternalId}/media`, {
    ...params,
    access_token: input.token,
  })
  if ('rechazo' in r) {
    const motivo = motivoDeRechazo(r.rechazo, input.opciones)
    return motivo ? { failed: motivo, definitivo: true } : { failed: PUBLISH_NETWORK_ERROR }
  }
  const id = r.data.id
  return typeof id === 'string' ? { id } : { failed: PUBLISH_NETWORK_ERROR }
}

/** El `failed` de `PublishOutcome` que corresponde a lo que devolvió `createContainer`,
 * llevando `definitivo` solo si venía puesto. */
function fromCreate(r: { failed: string; definitivo?: true }): PublishOutcome {
  return r.definitivo ? { kind: 'failed', reason: r.failed, definitivo: true } : { kind: 'failed', reason: r.failed }
}

async function publishContainer(input: PublishInput, containerId: string): Promise<PublishOutcome> {
  const r = await postForm(`${GRAPH}/${input.accountExternalId}/media_publish`, {
    creation_id: containerId,
    access_token: input.token,
  })
  const id = 'data' in r ? r.data.id : undefined
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
      const r = await createContainer(input, photoContainerParams(input.caption, media[0]!))
      if ('failed' in r) return fromCreate(r)
      return publishContainer(input, r.id)
    }

    // Single video: create the container and park — Meta processes it asynchronously
    // and the next cron run polls status_code before publishing.
    if (media.length === 1) {
      const r = await createContainer(
        input,
        reelContainerParams(input.caption, media[0]!, input.coverUrl, input.opciones),
      )
      if ('failed' in r) return fromCreate(r)
      return { kind: 'processing', containerId: r.id }
    }

    // Carousel: children first, then the parent, then park on the parent — its
    // status_code only turns FINISHED once every child (video included) is done.
    const childIds: string[] = []
    for (const item of media) {
      const r = await createContainer(input, carouselChildParams(item))
      if ('failed' in r) return fromCreate(r)
      childIds.push(r.id)
    }
    const parent = await createContainer(input, carouselParentParams(input.caption, childIds))
    if ('failed' in parent) return fromCreate(parent)
    return { kind: 'processing', containerId: parent.id }
  },
}
