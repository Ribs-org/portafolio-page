# Calendario de publicación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sección «Calendario» donde el dueño compone un post (texto + media + destinos + fecha/hora) y un cron lo publica solo en Instagram a su hora, con reintentos, fallo visible y aviso por email.

**Architecture:** Espejo del patrón `Connector`: un contrato `Publisher` en `src/lib/social/publish/` registrado en `PUBLISHERS[]`, tres tablas nuevas (`scheduled_posts`, `scheduled_post_targets` con estado por destino, `scheduled_post_media` en Vercel Blob), un cron `/api/cron/publish-social` cada 5 minutos que avanza una máquina de estados entre corridas (los videos de Instagram procesan asíncrono), y server actions + UI en el dash admin.

**Tech Stack:** Next.js App Router (route handlers con `params` como Promise), Drizzle + Neon, Vercel Blob (`put` de `@vercel/blob`, ya en deps), Vitest, Graph API v23.0, Resend (REST, sin SDK).

**Spec:** `docs/superpowers/specs/2026-08-31-calendario-publicacion-design.md`

## Global Constraints

- Mensajes que ven el dueño (UI, `lastError`, email): frases fijas en español escritas por nosotros, **nunca** texto upstream de Meta. El detalle real va a `console.error`.
- Métrica/estado ausente = `null`, nunca inventar valores.
- Fechas: editadas en `SITE_TIMEZONE` con `fromZonedInput` de `src/lib/utils.ts` (firma: `(value: string, timeZone: string) => Date | null`), guardadas en UTC (`timestamp withTimezone`).
- Tokens: siempre vía `ensureCredential` del connector correspondiente (`CONNECTORS` de `@/lib/social`); nunca descifrar a mano.
- Comentarios solo para restricciones que el código no puede mostrar, densidad y tono de `src/lib/social/instagram.ts`.
- Commits en español, presente, estilo del repo, con footer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01GfKG533gmtPXZ8ku9QpK12`
- Verificación: `npx vitest run <archivo>` por task; al final `npm test && npm run typecheck && npm run lint && npm run build`.
- El esquema se aplica con `npm run db:push` (drizzle-kit, lee `.env.local`).

---

### Task 1: Esquema — tres tablas nuevas

**Files:**
- Modify: `src/db/schema.ts` (agregar al final, antes de los `export type`)
- Modify: `src/db/index.ts` (solo si no re-exporta `* from './schema'` — verificar primero)

**Interfaces:**
- Consumes: convenciones existentes del archivo (`pgTable`, `uuid`, `text`, `integer`, `timestamp`, `index`, ya importados).
- Produces (usados por Tasks 4–10): tablas `scheduledPosts`, `scheduledPostTargets`, `scheduledPostMedia`; tipos `ScheduledPost`, `ScheduledPostTarget`, `ScheduledPostMedia`; constantes `TARGET_STATUSES`, `type TargetStatus`.

Sin test unitario: el repo no testea el esquema. Verificación por typecheck y `db:push`.

- [ ] **Step 1: Agregar las tablas**

En `src/db/schema.ts`, después de `postMetrics` y antes de los `export type` finales:

```ts
export const TARGET_STATUSES = ['scheduled', 'publishing', 'published', 'failed'] as const
export type TargetStatus = (typeof TARGET_STATUSES)[number]

/**
 * What the owner composes once. No status column of its own: the post's state is the
 * summary of its targets, and duplicating it here would let the two disagree.
 */
export const scheduledPosts = pgTable('scheduled_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  caption: text('caption').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per destination network, each living its own publish cycle: if Instagram
 * publishes and a future network fails, the calendar shows exactly that.
 *
 * `containerId` is Meta's async-processing handle: a video target parks in
 * 'publishing' holding it, and the next cron run asks Meta whether it finished.
 * `lastError` is always one of our fixed Spanish sentences — never upstream text.
 */
export const scheduledPostTargets = pgTable(
  'scheduled_post_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => scheduledPosts.id, { onDelete: 'cascade' }),
    network: text('network').notNull(),
    captionOverride: text('caption_override'),
    status: text('status').$type<TargetStatus>().notNull().default('scheduled'),
    containerId: text('container_id'),
    externalId: text('external_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('scheduled_post_targets_post_network_key').on(t.postId, t.network),
    index('scheduled_post_targets_status_idx').on(t.status),
  ],
)

/** One row per file, already living in Vercel Blob; `position` orders the carousel. */
export const scheduledPostMedia = pgTable(
  'scheduled_post_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => scheduledPosts.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    mediaType: text('media_type').$type<'image' | 'video'>().notNull(),
    position: integer('position').notNull(),
  },
  (t) => [index('scheduled_post_media_post_idx').on(t.postId)],
)
```

Y al bloque de tipos del final:

```ts
export type ScheduledPost = typeof scheduledPosts.$inferSelect
export type ScheduledPostTarget = typeof scheduledPostTargets.$inferSelect
export type ScheduledPostMedia = typeof scheduledPostMedia.$inferSelect
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run db:push`
Expected: typecheck limpio; drizzle crea las tres tablas sin tocar las existentes.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "Agrega las tablas del calendario de publicación"
```
(con el footer de Global Constraints)

---

### Task 2: Contrato `Publisher`, transiciones y frases fijas

**Files:**
- Create: `src/lib/social/publish/publisher.ts`
- Test: `src/lib/social/publish/publisher.test.ts`

**Interfaces:**
- Consumes: `type TargetStatus` de `@/db/schema`.
- Produces (usados por Tasks 3–8):
  - `type PublishMedia = { url: string; mediaType: 'image' | 'video'; position: number }`
  - `type PublishInput = { caption: string; media: PublishMedia[]; containerId: string | null; token: string; accountExternalId: string }`
  - `type PublishOutcome = { kind: 'published'; externalId: string } | { kind: 'processing'; containerId: string } | { kind: 'failed'; reason: string }`
  - `type Publisher = { network: string; publish(input: PublishInput): Promise<PublishOutcome> }`
  - `type TargetPatch = { status: TargetStatus; containerId: string | null; externalId: string | null; attemptCount: number; lastError: string | null }`
  - `MAX_PUBLISH_ATTEMPTS = 3`, `STALE_PROCESSING_HOURS = 24`
  - `resolveOutcome(outcome: PublishOutcome, attemptCount: number): TargetPatch`
  - `isStaleProcessing(updatedAt: Date, now: Date): boolean`
  - Frases fijas: `PUBLISH_REJECTED`, `PUBLISH_NETWORK_ERROR`, `NO_PUBLISH_TOKEN`, `STALE_PROCESSING`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/publish/publisher.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_PUBLISH_ATTEMPTS,
  PUBLISH_REJECTED,
  isStaleProcessing,
  resolveOutcome,
} from './publisher'

describe('resolveOutcome', () => {
  it('publicado guarda el id externo y limpia el resto', () => {
    expect(resolveOutcome({ kind: 'published', externalId: '18000000000000001' }, 1)).toEqual({
      status: 'published',
      containerId: null,
      externalId: '18000000000000001',
      attemptCount: 1,
      lastError: null,
    })
  })

  it('procesando estaciona el contenedor sin gastar intentos', () => {
    // Esperar a Meta no es un fallo: el intento se gasta solo cuando algo salió mal.
    expect(resolveOutcome({ kind: 'processing', containerId: 'CT_1' }, 0)).toEqual({
      status: 'publishing',
      containerId: 'CT_1',
      externalId: null,
      attemptCount: 0,
      lastError: null,
    })
  })

  it('un fallo con intentos restantes vuelve a programado, con el motivo visible', () => {
    const patch = resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, 0)
    expect(patch.status).toBe('scheduled')
    expect(patch.attemptCount).toBe(1)
    expect(patch.lastError).toBe(PUBLISH_REJECTED)
    expect(patch.containerId).toBeNull()
  })

  it('el tercer fallo es definitivo', () => {
    const patch = resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, MAX_PUBLISH_ATTEMPTS - 1)
    expect(patch.status).toBe('failed')
    expect(patch.attemptCount).toBe(MAX_PUBLISH_ATTEMPTS)
  })

  it('solo el tercer fallo produce failed: el email de aviso sale una única vez', () => {
    const statuses = [0, 1, 2].map(
      (attempts) => resolveOutcome({ kind: 'failed', reason: PUBLISH_REJECTED }, attempts).status,
    )
    expect(statuses).toEqual(['scheduled', 'scheduled', 'failed'])
  })
})

describe('isStaleProcessing', () => {
  const base = new Date('2026-08-31T12:00:00Z')

  it('un publishing reciente no está vencido', () => {
    expect(isStaleProcessing(new Date('2026-08-31T11:00:00Z'), base)).toBe(false)
  })

  it('a las 24 horas exactas ya venció', () => {
    expect(isStaleProcessing(new Date('2026-08-30T12:00:00Z'), base)).toBe(true)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/publisher.test.ts`
Expected: FAIL — `./publisher` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/publisher.ts`:

```ts
import type { TargetStatus } from '@/db/schema'

export type PublishMedia = { url: string; mediaType: 'image' | 'video'; position: number }

export type PublishInput = {
  caption: string
  media: PublishMedia[]
  containerId: string | null
  token: string
  accountExternalId: string
}

export type PublishOutcome =
  | { kind: 'published'; externalId: string }
  | { kind: 'processing'; containerId: string }
  | { kind: 'failed'; reason: string }

/** Adding a network in later phases is a file plus a line, same as Connector. */
export type Publisher = {
  network: string
  publish(input: PublishInput): Promise<PublishOutcome>
}

export type TargetPatch = {
  status: TargetStatus
  containerId: string | null
  externalId: string | null
  attemptCount: number
  lastError: string | null
}

// Every sentence the owner can see. Upstream detail goes to the server log only.
export const PUBLISH_REJECTED = 'Instagram rechazó la publicación.'
export const PUBLISH_NETWORK_ERROR = 'No se pudo hablar con la red. Se reintentará.'
export const NO_PUBLISH_TOKEN = 'La cuenta no está conectada. Reconéctala y reprograma.'
export const STALE_PROCESSING = 'La red no terminó de procesar el video.'

export const MAX_PUBLISH_ATTEMPTS = 3
export const STALE_PROCESSING_HOURS = 24

/**
 * The whole state machine in one pure spot. Waiting on Meta ('processing') spends no
 * attempt — attempts are for things that went wrong. Only the last allowed failure
 * lands on 'failed', which is also what makes the alert email fire exactly once.
 */
export function resolveOutcome(outcome: PublishOutcome, attemptCount: number): TargetPatch {
  if (outcome.kind === 'published') {
    return {
      status: 'published',
      containerId: null,
      externalId: outcome.externalId,
      attemptCount,
      lastError: null,
    }
  }
  if (outcome.kind === 'processing') {
    return {
      status: 'publishing',
      containerId: outcome.containerId,
      externalId: null,
      attemptCount,
      lastError: null,
    }
  }
  const attempts = attemptCount + 1
  return {
    status: attempts >= MAX_PUBLISH_ATTEMPTS ? 'failed' : 'scheduled',
    containerId: null,
    externalId: null,
    attemptCount: attempts,
    lastError: outcome.reason,
  }
}

/** A target parked in 'publishing' must never wait forever: 24 hours is a verdict. */
export function isStaleProcessing(updatedAt: Date, now: Date): boolean {
  return now.getTime() - updatedAt.getTime() >= STALE_PROCESSING_HOURS * 60 * 60 * 1000
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/publisher.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/publisher.ts src/lib/social/publish/publisher.test.ts
git commit -m "Define el contrato Publisher y su máquina de estados"
```

---

### Task 3: Payloads de Instagram — helpers puros

**Files:**
- Create: `src/lib/social/publish/instagram.ts`
- Test: `src/lib/social/publish/instagram.test.ts`

**Interfaces:**
- Consumes: `type PublishMedia` de `./publisher`.
- Produces (usados por Task 4):
  - `photoContainerParams(caption: string, media: PublishMedia): Record<string, string>`
  - `reelContainerParams(caption: string, media: PublishMedia): Record<string, string>`
  - `carouselChildParams(media: PublishMedia): Record<string, string>`
  - `carouselParentParams(caption: string, childIds: string[]): Record<string, string>`
  - `classifyContainerStatus(payload: Record<string, unknown>): 'finished' | 'in_progress' | 'error'`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/publish/instagram.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  carouselChildParams,
  carouselParentParams,
  classifyContainerStatus,
  photoContainerParams,
  reelContainerParams,
} from './instagram'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('payloads de contenedores', () => {
  it('foto: image_url y caption, nada más', () => {
    expect(photoContainerParams('Hola', image)).toEqual({
      image_url: 'https://blob.test/a.jpg',
      caption: 'Hola',
    })
  })

  it('video: media_type REELS con video_url', () => {
    expect(reelContainerParams('Hola', video)).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob.test/b.mp4',
      caption: 'Hola',
    })
  })

  it('hijo de carrusel: imagen y video llevan is_carousel_item', () => {
    expect(carouselChildParams(image)).toEqual({
      image_url: 'https://blob.test/a.jpg',
      is_carousel_item: 'true',
    })
    expect(carouselChildParams(video)).toEqual({
      media_type: 'VIDEO',
      video_url: 'https://blob.test/b.mp4',
      is_carousel_item: 'true',
    })
  })

  it('padre de carrusel: children en orden, separados por coma', () => {
    expect(carouselParentParams('Hola', ['C1', 'C2', 'C3'])).toEqual({
      media_type: 'CAROUSEL',
      children: 'C1,C2,C3',
      caption: 'Hola',
    })
  })
})

describe('classifyContainerStatus', () => {
  it('FINISHED está listo para publicar', () => {
    expect(classifyContainerStatus({ status_code: 'FINISHED' })).toBe('finished')
  })

  it('ERROR y EXPIRED son veredictos, no esperas', () => {
    expect(classifyContainerStatus({ status_code: 'ERROR' })).toBe('error')
    expect(classifyContainerStatus({ status_code: 'EXPIRED' })).toBe('error')
  })

  it('IN_PROGRESS, ausente o desconocido siguen esperando', () => {
    expect(classifyContainerStatus({ status_code: 'IN_PROGRESS' })).toBe('in_progress')
    expect(classifyContainerStatus({})).toBe('in_progress')
    expect(classifyContainerStatus({ status_code: 'PUBLISHED' })).toBe('in_progress')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/instagram.test.ts`
Expected: FAIL — `./instagram` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/instagram.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/instagram.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/instagram.ts src/lib/social/publish/instagram.test.ts
git commit -m "Arma los payloads de publicación de Instagram"
```

---

### Task 4: El publisher de Instagram y su registro

**Files:**
- Modify: `src/lib/social/publish/instagram.ts` (agregar al final)
- Create: `src/lib/social/publish/index.ts`

**Interfaces:**
- Consumes: helpers de Task 3; `PUBLISH_NETWORK_ERROR`, `PUBLISH_REJECTED`, `STALE_PROCESSING`, tipos de Task 2.
- Produces (usados por Task 7): `instagramPublisher: Publisher` con `network: 'instagram'`; `PUBLISHERS: Publisher[]` en `src/lib/social/publish/index.ts`.

Sin test unitario nuevo: la orquestación HTTP sigue el estilo de los connectors (no se testea `fetch`); todas las ramas con lógica viven en los helpers ya testeados de Tasks 2–3. Verificación por typecheck y lint.

- [ ] **Step 1: Implementar el publisher**

Agregar a `src/lib/social/publish/instagram.ts` (sumar al import de `./publisher`: `PUBLISH_NETWORK_ERROR`, `PUBLISH_REJECTED`, `type PublishInput`, `type PublishOutcome`, `type Publisher`):

```ts
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
```

- [ ] **Step 2: El registro**

Crear `src/lib/social/publish/index.ts`:

```ts
import type { Publisher } from './publisher'
import { instagramPublisher } from './instagram'

/** Adding a network in later phases is a file plus a line here, same as CONNECTORS. */
export const PUBLISHERS: Publisher[] = [instagramPublisher]

export * from './publisher'
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run src/lib/social/publish/ && npm run typecheck && npm run lint`
Expected: PASS los tres.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/publish/instagram.ts src/lib/social/publish/index.ts
git commit -m "Publica en Instagram: foto directa, video y carrusel por contenedor"
```

---

### Task 5: Validación del compositor

**Files:**
- Create: `src/lib/social/publish/validate.ts`
- Test: `src/lib/social/publish/validate.test.ts`

**Interfaces:**
- Consumes: nada (helper puro).
- Produces (usado por Task 9):
  - `type ScheduleDraft = { caption: string; imageCount: number; videoCount: number; networks: string[]; scheduledAt: Date | null }`
  - `validateScheduleDraft(draft: ScheduleDraft, now: Date): string | null` (mensaje de error fijo, o null si es válido)
  - `MAX_CAROUSEL_ITEMS = 10`, `MAX_CAPTION_LENGTH = 2200`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/publish/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateScheduleDraft, type ScheduleDraft } from './validate'

const now = new Date('2026-08-31T12:00:00Z')
const base: ScheduleDraft = {
  caption: 'Hola',
  imageCount: 1,
  videoCount: 0,
  networks: ['instagram'],
  scheduledAt: new Date('2026-08-31T13:00:00Z'),
}

describe('validateScheduleDraft', () => {
  it('acepta una foto con caption, destino y hora futura', () => {
    expect(validateScheduleDraft(base, now)).toBeNull()
  })

  it('acepta un solo video', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 0, videoCount: 1 }, now)).toBeNull()
  })

  it('acepta un carrusel mixto de hasta diez', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 8, videoCount: 2 }, now)).toBeNull()
  })

  it('rechaza no adjuntar nada', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 0 }, now)).toMatch(/archivo/)
  })

  it('rechaza más de diez archivos', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 11 }, now)).toMatch(/diez/)
  })

  it('rechaza quedarse sin destino', () => {
    expect(validateScheduleDraft({ ...base, networks: [] }, now)).toMatch(/plataforma/)
  })

  it('rechaza una hora pasada o ilegible', () => {
    expect(validateScheduleDraft({ ...base, scheduledAt: new Date('2026-08-31T11:59:00Z') }, now)).toMatch(/futuro/)
    expect(validateScheduleDraft({ ...base, scheduledAt: null }, now)).toMatch(/fecha/)
  })

  it('rechaza un caption sobre el límite de Instagram', () => {
    expect(validateScheduleDraft({ ...base, caption: 'x'.repeat(2201) }, now)).toMatch(/largo/)
  })

  it('acepta caption vacío: un carrusel sin texto es un post legítimo', () => {
    expect(validateScheduleDraft({ ...base, caption: '' }, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts`
Expected: FAIL — `./validate` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/validate.ts`:

```ts
export type ScheduleDraft = {
  caption: string
  imageCount: number
  videoCount: number
  networks: string[]
  scheduledAt: Date | null
}

export const MAX_CAROUSEL_ITEMS = 10
export const MAX_CAPTION_LENGTH = 2200

/**
 * The composer's whole rulebook, pure so it is testable and shared: the server action
 * runs it as the real gate. Returns a fixed sentence or null.
 */
export function validateScheduleDraft(draft: ScheduleDraft, now: Date): string | null {
  const files = draft.imageCount + draft.videoCount
  if (files === 0) return 'Adjunta al menos un archivo.'
  if (files > MAX_CAROUSEL_ITEMS) return 'Máximo diez archivos por publicación.'
  if (draft.networks.length === 0) return 'Elige al menos una plataforma.'
  if (!draft.scheduledAt) return 'La fecha no se entendió.'
  if (draft.scheduledAt.getTime() <= now.getTime()) return 'La hora debe estar en el futuro.'
  if (draft.caption.length > MAX_CAPTION_LENGTH) return 'El texto es demasiado largo para Instagram.'
  return null
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/validate.ts src/lib/social/publish/validate.test.ts
git commit -m "Valida el borrador del compositor con reglas fijas"
```

---

### Task 6: Email de fallo por Resend

**Files:**
- Create: `src/lib/social/publish/alert.ts`
- Test: `src/lib/social/publish/alert.test.ts`
- Modify: `README.md` (tabla de variables de entorno)

**Interfaces:**
- Consumes: `env` de `@/lib/env`.
- Produces (usado por Task 7):
  - `failureEmail(caption: string, network: string, reason: string): { subject: string; text: string }`
  - `sendFailureAlert(caption: string, network: string, reason: string): Promise<void>` (best-effort: nunca lanza)

**⚠️ Paso con intervención humana:** la integración se instala con
`vercel link` (si el proyecto no está linkeado) y luego
`vercel integration add resend --yes --no-claim`. Si el CLI pide completar en el
navegador (`vercel integration open resend`), detenerse y pedirle al dueño que
termine ahí, luego `vercel env pull --yes` para traer `RESEND_API_KEY`. Además el
dueño define `PUBLISH_ALERT_TO` (su correo) en Vercel. `PUBLISH_ALERT_FROM` es
opcional (default `onboarding@resend.dev`, que Resend acepta sin verificar dominio).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/publish/alert.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { failureEmail } from './alert'

describe('failureEmail', () => {
  it('asunto y cuerpo con la red, el motivo fijo y el comienzo del caption', () => {
    const mail = failureEmail('Nueva rutina en el gimnasio 💪', 'instagram', 'Instagram rechazó la publicación.')
    expect(mail.subject).toBe('No se pudo publicar en Instagram')
    expect(mail.text).toContain('Nueva rutina en el gimnasio 💪')
    expect(mail.text).toContain('Instagram rechazó la publicación.')
  })

  it('recorta un caption kilométrico para que el correo respire', () => {
    const mail = failureEmail('x'.repeat(500), 'instagram', 'motivo')
    expect(mail.text.length).toBeLessThan(400)
  })

  it('capitaliza la red aunque venga en minúscula', () => {
    expect(failureEmail('a', 'facebook', 'm').subject).toBe('No se pudo publicar en Facebook')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/alert.test.ts`
Expected: FAIL — `./alert` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/alert.ts`:

```ts
import { env } from '@/lib/env'

export function failureEmail(
  caption: string,
  network: string,
  reason: string,
): { subject: string; text: string } {
  const name = network.charAt(0).toUpperCase() + network.slice(1)
  const excerpt = caption.length > 120 ? `${caption.slice(0, 120)}…` : caption
  return {
    subject: `No se pudo publicar en ${name}`,
    text: `La publicación «${excerpt}» falló sus tres intentos en ${name}.\n\nMotivo: ${reason}\n\nRevisa el calendario en /admin/schedule para reprogramarla.`,
  }
}

/**
 * Best-effort by design: the calendar's 'failed' state is the source of truth, and a
 * mail provider outage must never turn into a crashed cron run. Hence the swallow.
 */
export async function sendFailureAlert(caption: string, network: string, reason: string): Promise<void> {
  const apiKey = env('RESEND_API_KEY')
  const to = env('PUBLISH_ALERT_TO')
  if (!apiKey || !to) return

  const { subject, text } = failureEmail(caption, network, reason)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('PUBLISH_ALERT_FROM') ?? 'onboarding@resend.dev',
        to,
        subject,
        text,
      }),
    })
    if (!response.ok) {
      console.error('Resend respondió', response.status, (await response.text()).slice(0, 200))
    }
  } catch (error) {
    console.error('No se pudo enviar el aviso de fallo:', error)
  }
}
```

- [ ] **Step 4: README**

En la tabla de variables de entorno de `README.md`, tres filas nuevas siguiendo el
formato existente:

```markdown
| `RESEND_API_KEY` | Enviar el email de aviso cuando una publicación programada falla | La provisiona la integración de Resend del marketplace de Vercel |
| `PUBLISH_ALERT_TO` | A qué correo llega el aviso de fallo | Sin ella no se envía ningún email; el calendario sigue mostrando el fallo |
| `PUBLISH_ALERT_FROM` | Remitente del aviso | Opcional; default `onboarding@resend.dev` |
```

- [ ] **Step 5: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/alert.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Instalar la integración** *(intervención humana, ver arriba)*

Run: `vercel integration add resend --yes --no-claim` (tras `vercel link` si hace falta)
Si pide navegador: detenerse, avisar al dueño, esperar, luego `vercel env pull --yes`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/publish/alert.ts src/lib/social/publish/alert.test.ts README.md
git commit -m "Avisa por correo cuando una publicación agota sus intentos"
```

---

### Task 7: El orquestador `publishDue`

**Files:**
- Create: `src/lib/social/publish/run.ts`

**Interfaces:**
- Consumes: `PUBLISHERS` y todo `./publisher` (Tasks 2 y 4); `sendFailureAlert` (Task 6); `CONNECTORS` de `@/lib/social`; `getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia, socialAccounts` de `@/db`; `and, asc, eq, lte, or` de `drizzle-orm`.
- Produces (usado por Task 8): `publishDue(now?: Date): Promise<{ published: number; processing: number; retried: number; failed: number }>`

Sin test unitario: toda la lógica con ramas (transiciones, vencimiento, clasificación)
ya está testeada en Tasks 2–3; esto es la costura con la base y el HTTP, el mismo trato
que recibe `syncAll`. Verificación por typecheck y lint.

- [ ] **Step 1: Implementación**

Crear `src/lib/social/publish/run.ts`:

```ts
import { and, asc, eq, lte, or } from 'drizzle-orm'
import {
  getDb,
  scheduledPostMedia,
  scheduledPosts,
  scheduledPostTargets,
  socialAccounts,
} from '@/db'
import { CONNECTORS } from '@/lib/social'
import { PUBLISHERS } from './index'
import {
  NO_PUBLISH_TOKEN,
  PUBLISH_NETWORK_ERROR,
  STALE_PROCESSING,
  isStaleProcessing,
  resolveOutcome,
  type PublishOutcome,
} from './publisher'
import { sendFailureAlert } from './alert'

type Report = { published: number; processing: number; retried: number; failed: number }

/**
 * One cron run: advance every due target one step. Sequential on purpose — the volume
 * is one person's calendar, and the connectors already taught us that low concurrency
 * against Meta is the cheap way to never meet a 429.
 */
export async function publishDue(now: Date = new Date()): Promise<Report> {
  const db = getDb()
  const report: Report = { published: 0, processing: 0, retried: 0, failed: 0 }

  const due = await db
    .select({ target: scheduledPostTargets, post: scheduledPosts })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(
      or(
        and(eq(scheduledPostTargets.status, 'scheduled'), lte(scheduledPosts.scheduledAt, now)),
        eq(scheduledPostTargets.status, 'publishing'),
      ),
    )
    .orderBy(asc(scheduledPosts.scheduledAt))

  for (const { target, post } of due) {
    let outcome: PublishOutcome

    if (target.status === 'publishing' && isStaleProcessing(target.updatedAt, now)) {
      // Never wait forever: 24 hours parked in 'publishing' is a verdict. Skipping the
      // publisher counts the stale check itself as the failed attempt.
      outcome = { kind: 'failed', reason: STALE_PROCESSING }
    } else {
      outcome = await attempt(target.network, target.id, post.id, target.containerId, {
        caption: target.captionOverride ?? post.caption,
      })
    }

    const patch = resolveOutcome(outcome, target.attemptCount)
    await db
      .update(scheduledPostTargets)
      .set({ ...patch, updatedAt: now })
      .where(eq(scheduledPostTargets.id, target.id))

    if (patch.status === 'published') report.published++
    else if (patch.status === 'publishing') report.processing++
    else if (patch.status === 'scheduled') report.retried++
    else {
      report.failed++
      await sendFailureAlert(post.caption, target.network, patch.lastError ?? '')
    }
  }

  return report
}

async function attempt(
  network: string,
  targetId: string,
  postId: string,
  containerId: string | null,
  content: { caption: string },
): Promise<PublishOutcome> {
  const db = getDb()
  const publisher = PUBLISHERS.find((p) => p.network === network)
  const connector = CONNECTORS.find((c) => c.network === network)
  if (!publisher || !connector) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.network, network))
  const token = account ? await connector.ensureCredential(account) : null
  if (!token || !account?.externalId) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }

  const media = await db
    .select()
    .from(scheduledPostMedia)
    .where(eq(scheduledPostMedia.postId, postId))
    .orderBy(asc(scheduledPostMedia.position))

  try {
    return await publisher.publish({
      caption: content.caption,
      media: media.map((m) => ({ url: m.blobUrl, mediaType: m.mediaType, position: m.position })),
      containerId,
      token,
      accountExternalId: account.externalId,
    })
  } catch (error) {
    // A publisher that throws (network hiccup, DNS, anything before Meta answered) is
    // a retryable failure, not a crash of the whole run.
    console.error(`Falló publicar el destino ${targetId}:`, error)
    return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
  }
}
```

Nota: si ESLint reclama `retried` o algún import sin uso, es un error de transcripción —
revisar contra este bloque, no suprimir reglas. `ensureCredential` existe en el contrato
`Connector` (`src/lib/social/connector.ts`) y todos los connectors lo implementan.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS los tres (ningún test existente cambia).

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/publish/run.ts
git commit -m "Orquesta la publicación de los destinos vencidos"
```

---

### Task 8: El cron de publicación

**Files:**
- Create: `src/app/api/cron/publish-social/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `publishDue` de `@/lib/social/publish/run` (Task 7); `env` de `@/lib/env`.
- Produces: `GET /api/cron/publish-social` protegido por `CRON_SECRET`.

Sin test unitario (el repo no testea route handlers). Verificación por typecheck y lint.

- [ ] **Step 1: La ruta**

Crear `src/app/api/cron/publish-social/route.ts`, espejo de `sync-social`:

```ts
import { NextResponse } from 'next/server'
import { publishDue } from '@/lib/social/publish/run'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Same discipline as sync-social: without a secret the endpoint stays shut.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    // Failed targets answer 200 on purpose: each one wrote its own lastError and the
    // calendar shows it. A non-2xx here means the orchestrator itself broke.
    const report = await publishDue()
    return NextResponse.json({ report })
  } catch (error) {
    console.error('Falló la corrida de publicación:', error)
    return NextResponse.json({ error: 'La publicación falló por completo.' }, { status: 500 })
  }
}
```

- [ ] **Step 2: El cron**

En `vercel.json`, el arreglo `crons` gana una entrada:

```json
{
  "crons": [
    { "path": "/api/cron/sync-social", "schedule": "0 9 * * *" },
    { "path": "/api/cron/publish-social", "schedule": "*/5 * * * *" }
  ]
}
```

Nota del spec: en plan Hobby de Vercel los crons corren máximo una vez al día. Si el
deploy rechaza el schedule o el cron no dispara, la alternativa es un pinger externo
(cron-job.org) llamando al endpoint cada 5 minutos con el header
`Authorization: Bearer <CRON_SECRET>` — la ruta es la misma. Dejar la entrada en
`vercel.json` igual: en Pro funciona directa.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/publish-social/route.ts vercel.json
git commit -m "Corre la publicación programada cada cinco minutos"
```

---

### Task 9: Server actions del calendario

**Files:**
- Modify: `src/app/admin/actions.ts` (agregar al final)

**Interfaces:**
- Consumes: `validateScheduleDraft` (Task 5); tablas de Task 1; `put` de `@vercel/blob`, `fromZonedInput`, `SITE_TIMEZONE`, `requireAuth`, `FormState` — todos ya presentes en el archivo.
- Produces (usados por Task 10):
  - `createScheduledPost(prev: FormState, formData: FormData): Promise<FormState>`
  - `rescheduleTarget(targetId: string, localDatetime: string): Promise<FormState>`
  - `deleteScheduledPost(postId: string): Promise<FormState>`

Sin test unitario: las actions del repo no se testean; la única lógica con ramas
(validación) vive en Task 5, ya testeada. Verificación por typecheck y lint.

- [ ] **Step 1: Implementación**

Agregar al final de `src/app/admin/actions.ts` (sumar a los imports existentes:
`scheduledPosts, scheduledPostTargets, scheduledPostMedia` desde `@/db`;
`validateScheduleDraft` desde `@/lib/social/publish/validate`):

```ts
export async function createScheduledPost(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAuth()

  const caption = String(formData.get('caption') ?? '').trim()
  const networks = formData.getAll('networks').map(String)
  const scheduledAt = fromZonedInput(String(formData.get('scheduledAt') ?? ''), SITE_TIMEZONE)
  const files = formData.getAll('media').filter((f): f is File => f instanceof File && f.size > 0)

  const videoCount = files.filter((f) => f.type.startsWith('video/')).length
  const error = validateScheduleDraft(
    { caption, imageCount: files.length - videoCount, videoCount, networks, scheduledAt },
    new Date(),
  )
  if (error) return { error }

  const uploaded: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const file of files) {
    // Public on purpose: Instagram's Graph API fetches the media from this URL.
    const blob = await put(`scheduled/${randomUUID()}-${file.name}`, file, { access: 'public' })
    uploaded.push({ url: blob.url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
  }

  const db = getDb()
  const [post] = await db
    .insert(scheduledPosts)
    .values({ caption, scheduledAt: scheduledAt! })
    .returning()
  await db.insert(scheduledPostMedia).values(
    uploaded.map((m, position) => ({ postId: post!.id, blobUrl: m.url, mediaType: m.mediaType, position })),
  )
  await db.insert(scheduledPostTargets).values(networks.map((network) => ({ postId: post!.id, network })))

  revalidatePath('/admin/schedule')
  return { ok: true }
}

export async function rescheduleTarget(targetId: string, localDatetime: string): Promise<FormState> {
  await requireAuth()

  const scheduledAt = fromZonedInput(localDatetime, SITE_TIMEZONE)
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    return { error: 'La hora debe estar en el futuro.' }
  }

  const db = getDb()
  const [target] = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.id, targetId))
  if (!target) return { error: 'Ese destino ya no existe.' }

  await db.update(scheduledPosts).set({ scheduledAt, updatedAt: new Date() }).where(eq(scheduledPosts.id, target.postId))
  // Back to square one: attempts spent against the old hour say nothing about the new one.
  await db
    .update(scheduledPostTargets)
    .set({ status: 'scheduled', attemptCount: 0, lastError: null, containerId: null, updatedAt: new Date() })
    .where(eq(scheduledPostTargets.id, targetId))

  revalidatePath('/admin/schedule')
  return { ok: true }
}

export async function deleteScheduledPost(postId: string): Promise<FormState> {
  await requireAuth()

  const db = getDb()
  const targets = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.postId, postId))
  // Deleting the row cannot unpublish the post on the network — refuse instead of lying.
  if (targets.some((t) => t.status === 'published' || t.status === 'publishing')) {
    return { error: 'Ya se publicó (o está publicando): elimínalo en la red.' }
  }

  await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId))
  revalidatePath('/admin/schedule')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "Crea, reprograma y elimina publicaciones programadas"
```

---

### Task 10: La sección «Calendario» y verificación final

**Files:**
- Modify: `src/app/admin/(dash)/nav.tsx:7-12`
- Create: `src/app/admin/(dash)/schedule/page.tsx`
- Create: `src/app/admin/(dash)/schedule/composer.tsx`
- Create: `src/app/admin/(dash)/schedule/queue.tsx`

**Interfaces:**
- Consumes: actions de Task 9; tablas de Task 1; `SOCIAL_NETWORKS` de `@/db/schema`; `networkLabel` de `@/lib/networks`; `PUBLISHERS` de `@/lib/social/publish`; `cn` de `@/lib/utils`.
- Produces: la pestaña «Calendario» funcionando en `/admin/schedule`.

Sin test unitario (el repo no testea UI). Verificación: typecheck, lint, build y prueba
manual del flujo completo.

- [ ] **Step 1: La pestaña**

En `nav.tsx`, `TABS` gana una entrada entre Contenido y Perfiles:

```ts
const TABS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/analytics', label: 'Analítica' },
  { href: '/admin/content', label: 'Contenido' },
  { href: '/admin/schedule', label: 'Calendario' },
  { href: '/admin/profiles', label: 'Perfiles' },
]
```

- [ ] **Step 2: La página (server component)**

Crear `src/app/admin/(dash)/schedule/page.tsx`:

```tsx
import { asc, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { Composer } from './composer'
import { Queue } from './queue'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const db = getDb()
  const rows = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .orderBy(asc(scheduledPosts.scheduledAt))

  const posts = new Map<string, { post: (typeof rows)[number]['post']; targets: Array<(typeof rows)[number]['target']> }>()
  for (const row of rows) {
    const entry = posts.get(row.post.id) ?? { post: row.post, targets: [] }
    entry.targets.push(row.target)
    posts.set(row.post.id, entry)
  }

  return (
    <div className="space-y-6">
      <Composer />
      <Queue items={[...posts.values()]} />
    </div>
  )
}
```

- [ ] **Step 3: El compositor (client component)**

Crear `src/app/admin/(dash)/schedule/composer.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { createScheduledPost } from '@/app/admin/actions'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

// Phase 1 publishes to Instagram; the rest of the checkboxes exist but wait.
const ENABLED = new Set(['instagram'])

export function Composer() {
  const [state, action, pending] = useActionState(createScheduledPost, {})

  return (
    <form action={action} className="space-y-4 rounded-xl bg-white/[0.03] p-4">
      <h2 className="text-sm font-medium">Programar publicación</h2>

      <textarea
        name="caption"
        rows={4}
        maxLength={2200}
        placeholder="Texto del post…"
        className="w-full rounded-lg bg-white/[0.06] p-3 text-sm outline-none"
      />

      <input
        type="file"
        name="media"
        multiple
        accept="image/*,video/*"
        className="block text-sm text-fg-muted"
      />

      <div className="flex flex-wrap gap-3">
        {SOCIAL_NETWORKS.map((network) => {
          const enabled = ENABLED.has(network)
          return (
            <label
              key={network}
              className={cn('flex items-center gap-2 text-sm', !enabled && 'opacity-40')}
            >
              <input
                type="checkbox"
                name="networks"
                value={network}
                disabled={!enabled}
                defaultChecked={network === 'instagram'}
              />
              {networkLabel(network)}
              {!enabled && <span className="text-xs text-fg-faint">próximamente</span>}
            </label>
          )
        })}
      </div>

      <input
        type="datetime-local"
        name="scheduledAt"
        required
        className="rounded-lg bg-white/[0.06] p-2 text-sm"
      />

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-400">Programado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15] disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Programar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: La cola (client component)**

Crear `src/app/admin/(dash)/schedule/queue.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { deleteScheduledPost, rescheduleTarget } from '@/app/admin/actions'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

export function Queue({
  items,
}: {
  items: Array<{ post: ScheduledPost; targets: ScheduledPostTarget[] }>
}) {
  const [pending, start] = useTransition()

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-faint">Nada programado todavía.</p>
  }

  return (
    <ul className="space-y-3">
      {items.map(({ post, targets }) => (
        <li key={post.id} className="rounded-xl bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm">{post.caption || '(sin texto)'}</p>
              <p className="mt-1 text-xs text-fg-faint">
                {post.scheduledAt.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => void deleteScheduledPost(post.id))}
              className="text-xs text-fg-faint hover:text-fg"
            >
              Eliminar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {targets.map((target) => (
              <span
                key={target.id}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  target.status === 'published' && 'bg-emerald-500/15 text-emerald-300',
                  target.status === 'failed' && 'bg-red-500/15 text-red-300',
                  (target.status === 'scheduled' || target.status === 'publishing') &&
                    'bg-white/[0.08] text-fg-muted',
                )}
              >
                {networkLabel(target.network)}: {STATUS_LABEL[target.status]}
                {target.status === 'failed' && target.lastError && ` — ${target.lastError}`}
                {target.status === 'failed' && (
                  <button
                    type="button"
                    disabled={pending}
                    className="ml-2 underline"
                    onClick={() => {
                      const when = prompt('Nueva fecha y hora (YYYY-MM-DDTHH:MM):')
                      if (when) start(() => void rescheduleTarget(target.id, when))
                    }}
                  >
                    Reprogramar
                  </button>
                )}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Verificación final completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS los cuatro.

Prueba manual (requiere `.env.local` con base y blob): `npm run dev`, entrar a
`/admin/schedule`, programar una foto para dentro de 6 minutos con Instagram marcado,
y disparar la corrida a mano:
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/publish-social`
Expected: el chip pasa a «Publicado» y el post aparece en Instagram.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/(dash)/nav.tsx" "src/app/admin/(dash)/schedule/page.tsx" "src/app/admin/(dash)/schedule/composer.tsx" "src/app/admin/(dash)/schedule/queue.tsx"
git commit -m "Muestra el calendario: compositor, cola y estados por destino"
```

---

## Notas para el ejecutor

- **Orden de tasks**: 1→10 es dependencia real; no reordenar. Tasks 2, 3, 5 y 6 son
  puras y podrían paralelizarse, pero comparten directorio — mejor secuencial.
- **`getDb`**: se importa de `@/db` (lazy, no necesita `DATABASE_URL` en build).
- **`networkLabel`**: vive en `src/lib/networks.ts` y ya conoce las cuatro redes.
- **Resend**: el paso de instalación (Task 6, Step 6) puede requerir al dueño en el
  navegador. Si bloquea, seguir con Tasks 7–10 y volver: `sendFailureAlert` sin
  `RESEND_API_KEY` simplemente no envía, por diseño.
- **Límites de archivo**: las functions aceptan cuerpos de hasta 100 MB — suficiente
  para reels cortos. No agregar validación de tamaño en fase 1 (YAGNI); si un video
  enorme falla al subir, el error del action lo dirá.
- **AGENTS.md**: `next dev` re-agrega su bloque; commitearlo junto al trabajo está bien
  según el propio archivo.
- **Selección de vencidos**: el spec la lista entre lo testeable; sus dos ramas con
  lógica (corte de 24 horas, transiciones) se testean en Task 2, y el filtro
  scheduled-vencido-o-publishing vive como cláusula SQL en `run.ts` a propósito — un
  gemelo puro en JS podría divergir del SQL real y daría una confianza falsa. Es una
  desviación deliberada del spec, no un olvido.
