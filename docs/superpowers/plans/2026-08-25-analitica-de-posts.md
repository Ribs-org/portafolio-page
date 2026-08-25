# Analítica de posts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada post de Instagram, TikTok y YouTube aparezca en el panel como una fila con sus métricas de plataforma y el tráfico que trajo al sitio, ordenable por cualquier columna.

**Architecture:** Tres tablas nuevas (`social_accounts`, `social_posts`, `post_metrics`). Un contrato `Connector` con tres implementaciones aisladas, orquestadas por un `syncAll()` tolerante a fallos que corre por cron diario y por botón. El cruce entre plataforma y primera parte es por string: `visits.campaign = social_posts.campaign`.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon Postgres, Tailwind v4, Recharts, `jose`, Node `crypto`, vitest (nuevo).

**Spec:** `docs/superpowers/specs/2026-08-25-analitica-de-posts-design.md`

## Global Constraints

- **Idioma:** todo el texto visible al usuario va en español. Los comentarios de código van en inglés, como el resto del repo.
- **Comentarios:** el repo comenta el *por qué*, no el *qué*. Un comentario que reformula la línea siguiente sobra. Mira `src/lib/networks.ts` o `src/db/schema.ts` para el tono.
- **Variables de entorno:** todas las nuevas son opcionales. Sin ellas el sitio compila, despliega y funciona igual que antes. Se leen con `env()` de `src/lib/env.ts`, nunca con `process.env` directo (esa función limpia el BOM que agrega PowerShell).
- **Nulls:** `null` en una métrica significa "no hay dato". Nunca se sustituye por `0`. La UI muestra `—`.
- **Zona horaria:** los días se bucketean en `SITE_TIMEZONE` (`src/lib/analytics.ts`), nunca en UTC.
- **No romper el build sin credenciales:** ningún módulo puede lanzar en import time por falta de una variable de red social.
- **Tests:** los archivos bajo test **no pueden importar `src/lib/analytics.ts`** ni nada que arrastre `import 'server-only'` — revienta bajo vitest. Los tipos que vengan de `@/db` se importan con `import type`.
- **Verificación por tarea:** `npm run lint` y `npm run typecheck` pasan al cerrar cada tarea.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `vitest.config.ts` | Config de tests, alias `@` |
| `src/lib/social/crypto.ts` | Cifrar/descifrar tokens con AES-256-GCM |
| `src/lib/social/campaign.ts` | Generar la etiqueta `?s=` desde el id nativo |
| `src/lib/social/delta.ts` | Restar snapshots acumulados dentro de un período |
| `src/lib/social/archive.ts` | Decidir qué posts marcar como archivados |
| `src/lib/social/connector.ts` | Tipos `FetchedPost` y `Connector`. Sin lógica |
| `src/lib/social/youtube.ts` | Data API v3 |
| `src/lib/social/instagram.ts` | Graph API con Business Login |
| `src/lib/social/tiktok.ts` | Display API |
| `src/lib/social/index.ts` | Registro de conectores |
| `src/lib/social/sync.ts` | Orquestador: fetch, upsert, archivado, estado |
| `src/lib/social/fixtures/*.json` | Respuestas grabadas de cada API |
| `src/lib/posts.ts` | Capa de consultas de la vista y del gráfico |
| `src/components/charts/use-sorted-rows.ts` | Hook de ordenamiento compartido |
| `src/app/api/cron/sync-social/route.ts` | Corrida diaria |
| `src/app/api/social/[network]/connect/route.ts` | Inicio de OAuth |
| `src/app/api/social/[network]/callback/route.ts` | Canje del código |
| `src/app/admin/(dash)/content/page.tsx` | La vista |
| `src/app/admin/(dash)/content/connections.tsx` | Tarjetas de conexión |
| `src/app/admin/(dash)/content/post-table.tsx` | La tabla |
| `vercel.json` | Declaración del cron |

**Modificar:** `src/db/schema.ts`, `src/app/admin/(dash)/nav.tsx`, `src/app/admin/actions.ts`, `src/components/charts/campaign-table.tsx`, `src/components/charts/traffic-chart.tsx`, `src/app/admin/(dash)/analytics/page.tsx`, `next.config.ts`, `package.json`, `.env.example`, `README.md`.

---

### Task 1: Vitest y cifrado de tokens

**Files:**
- Create: `vitest.config.ts`, `src/lib/social/crypto.ts`, `src/lib/social/crypto.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `env()` de `src/lib/env.ts`
- Produces: `encryptToken(plain: string): string`, `decryptToken(payload: string): string`

- [ ] **Step 1: Instalar vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

- [ ] **Step 3: Agregar el script en `package.json`**

En `"scripts"`, junto a `"typecheck"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Escribir el test que falla**

`src/lib/social/crypto.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from './crypto'

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-do-not-use-in-production'
})

describe('token encryption', () => {
  it('devuelve el valor original', () => {
    const token = 'IGQVJYc0hBbUxxx-long-lived-token'
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it('produce un texto cifrado distinto cada vez', () => {
    expect(encryptToken('mismo')).not.toBe(encryptToken('mismo'))
  })

  it('rechaza un texto cifrado manipulado en vez de devolver basura', () => {
    const payload = encryptToken('token')
    const parts = payload.split('.')
    parts[3] = Buffer.from('otra-cosa').toString('base64url')
    expect(() => decryptToken(parts.join('.'))).toThrow()
  })

  it('rechaza un formato desconocido', () => {
    expect(() => decryptToken('no-es-un-payload')).toThrow()
  })
})
```

- [ ] **Step 5: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./crypto"`

- [ ] **Step 6: Implementar `src/lib/social/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from '../env'

const VERSION = 'v1'
const IV_BYTES = 12

/**
 * Derived rather than used raw: AUTH_SECRET also signs the admin session, and a key
 * reused across two purposes turns one leak into two.
 */
function key(): Buffer {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', secret, 'portafolio-social-v1', 'token', 32))
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.')
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, body] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('Unrecognised token payload')
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  // GCM throws here when the ciphertext or tag was altered, which is the point.
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
```

- [ ] **Step 7: Correr el test y verificar que pasa**

Run: `npm test`
Expected: PASS — 4 tests

- [ ] **Step 8: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/social/crypto.ts src/lib/social/crypto.test.ts
git commit -m "Cifra los tokens de las redes con una clave derivada de AUTH_SECRET"
```

---

### Task 2: Generación de etiquetas de campaña

**Files:**
- Create: `src/lib/social/campaign.ts`, `src/lib/social/campaign.test.ts`

**Interfaces:**
- Produces: `campaignTagFor(network: string, externalId: string): string`

- [ ] **Step 1: Escribir el test que falla**

`src/lib/social/campaign.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { campaignTagFor } from './campaign'

describe('campaignTagFor', () => {
  it('prefija según la red', () => {
    expect(campaignTagFor('instagram', 'C8xK2Lp')).toBe('ig-C8xK2Lp')
    expect(campaignTagFor('tiktok', '7234567890')).toBe('tt-7234567890')
    expect(campaignTagFor('youtube', 'dQw4w9WgXcQ')).toBe('yt-dQw4w9WgXcQ')
  })

  it('es determinista', () => {
    expect(campaignTagFor('instagram', 'C8xK2Lp')).toBe(campaignTagFor('instagram', 'C8xK2Lp'))
  })

  it('limpia lo que no sobrevive a una query string', () => {
    expect(campaignTagFor('instagram', 'abc/def?g h')).toBe('ig-abc-def-g-h')
  })

  it('colapsa separadores repetidos y recorta los de los bordes', () => {
    expect(campaignTagFor('tiktok', '__7234//')).toBe('tt-7234')
  })

  it('acota el largo', () => {
    expect(campaignTagFor('youtube', 'x'.repeat(200)).length).toBeLessThanOrEqual(48)
  })

  it('cae a la red misma como prefijo cuando no la conoce', () => {
    expect(campaignTagFor('threads', 'abc')).toBe('threads-abc')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test src/lib/social/campaign.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar `src/lib/social/campaign.ts`**

```ts
const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
}

const MAX_LENGTH = 48

/**
 * The `?s=` tag a post is born with. Kept short and readable because it ends up
 * pasted by hand into a bio link, and stable because changing it would orphan the
 * traffic already attributed to the old one.
 */
export function campaignTagFor(network: string, externalId: string): string {
  const prefix = PREFIXES[network] ?? network
  const body = externalId
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return `${prefix}-${body}`.slice(0, MAX_LENGTH)
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test src/lib/social/campaign.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/campaign.ts src/lib/social/campaign.test.ts
git commit -m "Genera la etiqueta de campaña a partir del id nativo del post"
```

---

### Task 3: Tablas nuevas

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: tablas `socialAccounts`, `socialPosts`, `postMetrics`; tipos `SocialAccount`, `SocialPost`, `PostMetric`; constante `SOCIAL_NETWORKS`

- [ ] **Step 1: Agregar los imports que faltan**

En la primera línea del import de `drizzle-orm/pg-core`, agregar `date` y `unique` a la lista existente.

- [ ] **Step 2: Agregar las tres tablas al final de `src/db/schema.ts`, antes del bloque de tipos**

```ts
export const SOCIAL_NETWORKS = ['instagram', 'tiktok', 'youtube'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

/**
 * One connected network. Tokens are stored encrypted — see `lib/social/crypto`.
 * YouTube needs no OAuth, so it lands here with both tokens null and only a channel id.
 */
export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  network: text('network').notNull().unique(),
  handle: text('handle'),
  externalId: text('external_id'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A published piece of content.
 *
 * `campaign` is the `?s=` tag that joins this post to `visits`. The join is by string
 * and not by foreign key on purpose: visits are written long before the post exists
 * here, and editing the tag re-links the whole history without migrating a row.
 * The sync never overwrites it.
 *
 * `archivedAt` marks a post deleted on the network. The row survives — dropping it
 * would erase traffic that really happened.
 */
export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    network: text('network').notNull(),
    externalId: text('external_id').notNull(),
    permalink: text('permalink'),
    caption: text('caption'),
    thumbnailUrl: text('thumbnail_url'),
    mediaType: text('media_type'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    campaign: text('campaign').notNull().unique(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('social_posts_network_external_key').on(t.network, t.externalId),
    index('social_posts_campaign_idx').on(t.campaign),
    index('social_posts_published_idx').on(t.publishedAt),
  ],
)

/**
 * One cumulative snapshot per post per local day — cumulative because that is what
 * all three APIs return. A period's growth is the difference between two snapshots.
 *
 * Every metric is nullable: null means the network does not report it, which is not
 * the same as zero. TikTok has no saves or reach; the YouTube Data API has no shares
 * or saves.
 *
 * The unique on `(postId, day)` is what makes the sync idempotent.
 */
export const postMetrics = pgTable(
  'post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views'),
    likes: integer('likes'),
    comments: integer('comments'),
    shares: integer('shares'),
    saves: integer('saves'),
    reach: integer('reach'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('post_metrics_post_day_key').on(t.postId, t.day), index('post_metrics_day_idx').on(t.day)],
)
```

- [ ] **Step 3: Agregar los tipos al bloque final**

```ts
export type SocialAccount = typeof socialAccounts.$inferSelect
export type SocialPost = typeof socialPosts.$inferSelect
export type PostMetric = typeof postMetrics.$inferSelect
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sin errores

- [ ] **Step 5: Aplicar el esquema a la base**

Run: `npm run db:push`
Expected: drizzle-kit reporta las tres tablas creadas. Requiere `.env.local` con `DATABASE_URL`.

- [ ] **Step 6: Verificar que las tablas existen**

Run: `npm run db:studio` y confirmar que aparecen `social_accounts`, `social_posts` y `post_metrics`. Cerrar con Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts
git commit -m "Agrega las tablas de cuentas, posts y snapshots de métricas"
```

---

### Task 4: Contrato del conector y conector de YouTube

**Files:**
- Create: `src/lib/social/connector.ts`, `src/lib/social/youtube.ts`, `src/lib/social/youtube.test.ts`, `src/lib/social/fixtures/youtube-videos.json`

**Interfaces:**
- Consumes: `campaignTagFor` (Task 2), tipo `SocialAccount` (Task 3)
- Produces: tipos `PostMetricValues`, `FetchedPost`, `Connector`; `youtubeConnector: Connector`; `normalizeYouTubeVideo(item: YouTubeVideo): FetchedPost`

- [ ] **Step 1: Crear `src/lib/social/connector.ts`**

Solo tipos — este archivo no tiene lógica y nadie lo prueba.

```ts
import type { SocialAccount } from '@/db'

export type PostMetricValues = {
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  reach: number | null
}

export type FetchedPost = {
  externalId: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: Date
  metrics: PostMetricValues
}

/**
 * The only thing the orchestrator knows about a network. Everything network-specific —
 * field names, pagination, auth dance — stays inside the implementation.
 */
export type Connector = {
  network: string
  /** Returns the usable credential, refreshing it first when it is close to expiring. */
  ensureCredential(account: SocialAccount): Promise<string | null>
  fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedPost[]>
}

/** Every metric absent — the starting point a connector fills in with what it has. */
export const NO_METRICS: PostMetricValues = {
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  reach: null,
}
```

- [ ] **Step 2: Grabar la respuesta de la API como fixture**

`src/lib/social/fixtures/youtube-videos.json` — recorte real de `videos.list?part=snippet,statistics,contentDetails`:

```json
{
  "items": [
    {
      "id": "dQw4w9WgXcQ",
      "snippet": {
        "publishedAt": "2026-08-12T14:03:11Z",
        "title": "Cómo edito mis reels",
        "thumbnails": {
          "medium": { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" },
          "high": { "url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }
        }
      },
      "statistics": { "viewCount": "8412", "likeCount": "402", "commentCount": "51" },
      "contentDetails": { "duration": "PT8M12S" }
    },
    {
      "id": "aBcDeFgHiJk",
      "snippet": {
        "publishedAt": "2026-08-20T09:00:00Z",
        "title": "Short de prueba",
        "thumbnails": { "medium": { "url": "https://i.ytimg.com/vi/aBcDeFgHiJk/mqdefault.jpg" } }
      },
      "statistics": { "viewCount": "1203" },
      "contentDetails": { "duration": "PT41S" }
    }
  ]
}
```

El segundo item no trae `likeCount` ni `commentCount` a propósito: YouTube los omite cuando el creador los oculta, y el normalizador tiene que producir `null`, no `0`.

- [ ] **Step 3: Escribir el test que falla**

`src/lib/social/youtube.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/youtube-videos.json'
import { normalizeYouTubeVideo, type YouTubeVideo } from './youtube'

const [video, short] = fixture.items as YouTubeVideo[]

describe('normalizeYouTubeVideo', () => {
  it('mapea los campos que sí vienen', () => {
    const post = normalizeYouTubeVideo(video!)
    expect(post.externalId).toBe('dQw4w9WgXcQ')
    expect(post.permalink).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(post.caption).toBe('Cómo edito mis reels')
    expect(post.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T14:03:11.000Z')
    expect(post.metrics.views).toBe(8412)
    expect(post.metrics.likes).toBe(402)
    expect(post.metrics.comments).toBe(51)
  })

  it('deja en null lo que la Data API no reporta', () => {
    const post = normalizeYouTubeVideo(video!)
    expect(post.metrics.shares).toBeNull()
    expect(post.metrics.saves).toBeNull()
    expect(post.metrics.reach).toBeNull()
  })

  it('distingue un contador oculto de un cero', () => {
    const post = normalizeYouTubeVideo(short!)
    expect(post.metrics.views).toBe(1203)
    expect(post.metrics.likes).toBeNull()
    expect(post.metrics.comments).toBeNull()
  })

  it('llama short a lo que dura menos de un minuto', () => {
    expect(normalizeYouTubeVideo(short!).mediaType).toBe('short')
    expect(normalizeYouTubeVideo(video!).mediaType).toBe('video')
  })
})
```

- [ ] **Step 4: Correr y verificar que falla**

Run: `npm test src/lib/social/youtube.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 5: Implementar `src/lib/social/youtube.ts`**

```ts
import type { SocialAccount } from '@/db'
import { env } from '../env'
import { NO_METRICS, type Connector, type FetchedPost } from './connector'

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

const MAX_POSTS = 200
const PAGE_SIZE = 50

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

  async fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedPost[]> {
    const apiKey = token
    const channelId = account.externalId ?? env('YOUTUBE_CHANNEL_ID')
    if (!apiKey || !channelId) return []

    const playlist = await uploadsPlaylistId(channelId, apiKey)
    const ids: string[] = []
    let pageToken = ''

    while (ids.length < MAX_POSTS) {
      const page = (await getJson(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails` +
          `&playlistId=${playlist}&maxResults=${PAGE_SIZE}&key=${apiKey}` +
          (pageToken ? `&pageToken=${pageToken}` : ''),
      )) as {
        items?: Array<{ contentDetails?: { videoId?: string } }>
        nextPageToken?: string
      }

      for (const item of page.items ?? []) {
        if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId)
      }
      if (!page.nextPageToken) break
      pageToken = page.nextPageToken
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

    return posts
  },
}
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npm test src/lib/social/youtube.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 7: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 8: Commit**

```bash
git add src/lib/social/connector.ts src/lib/social/youtube.ts src/lib/social/youtube.test.ts src/lib/social/fixtures/youtube-videos.json
git commit -m "Define el contrato del conector y lo implementa para YouTube"
```

---

### Task 5: Conector de Instagram

**Files:**
- Create: `src/lib/social/instagram.ts`, `src/lib/social/instagram.test.ts`, `src/lib/social/fixtures/instagram-media.json`

**Interfaces:**
- Consumes: `Connector`, `FetchedPost`, `NO_METRICS` (Task 4); `decryptToken`, `encryptToken` (Task 1)
- Produces: `instagramConnector: Connector`; `normalizeInstagramMedia(media: InstagramMedia, insights: InstagramInsights): FetchedPost`

- [ ] **Step 1: Crear el fixture**

`src/lib/social/fixtures/instagram-media.json`:

```json
{
  "media": {
    "id": "17912345678901234",
    "caption": "Rutina de gimnasio completa 💪 link en bio",
    "media_type": "VIDEO",
    "media_product_type": "REELS",
    "media_url": "https://scontent.cdninstagram.com/v/video.mp4",
    "thumbnail_url": "https://scontent.cdninstagram.com/v/thumb.jpg",
    "permalink": "https://www.instagram.com/reel/C8xK2Lp/",
    "timestamp": "2026-08-12T18:22:04+0000"
  },
  "insights": {
    "data": [
      { "name": "views", "values": [{ "value": 42130 }] },
      { "name": "reach", "values": [{ "value": 38104 }] },
      { "name": "likes", "values": [{ "value": 3211 }] },
      { "name": "comments", "values": [{ "value": 180 }] },
      { "name": "saved", "values": [{ "value": 640 }] },
      { "name": "shares", "values": [{ "value": 212 }] }
    ]
  },
  "imageMedia": {
    "id": "17998877665544332",
    "caption": null,
    "media_type": "IMAGE",
    "media_url": "https://scontent.cdninstagram.com/v/foto.jpg",
    "permalink": "https://www.instagram.com/p/C9aB3Cd/",
    "timestamp": "2026-08-01T12:00:00+0000"
  },
  "imageInsights": { "data": [{ "name": "reach", "values": [{ "value": 900 }] }] }
}
```

- [ ] **Step 2: Escribir el test que falla**

`src/lib/social/instagram.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/instagram-media.json'
import {
  normalizeInstagramMedia,
  type InstagramInsights,
  type InstagramMedia,
} from './instagram'

const media = fixture.media as InstagramMedia
const insights = fixture.insights as InstagramInsights
const imageMedia = fixture.imageMedia as InstagramMedia
const imageInsights = fixture.imageInsights as InstagramInsights

describe('normalizeInstagramMedia', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.externalId).toBe('17912345678901234')
    expect(post.permalink).toBe('https://www.instagram.com/reel/C8xK2Lp/')
    expect(post.caption).toBe('Rutina de gimnasio completa 💪 link en bio')
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/thumb.jpg')
    expect(post.mediaType).toBe('reel')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T18:22:04.000Z')
  })

  it('aplana la forma anidada de insights', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.metrics).toEqual({
      views: 42130,
      reach: 38104,
      likes: 3211,
      comments: 180,
      saves: 640,
      shares: 212,
    })
  })

  it('deja en null la métrica que no vino', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.metrics.reach).toBe(900)
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.likes).toBeNull()
  })

  it('usa media_url cuando no hay thumbnail, que es el caso de las fotos', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/foto.jpg')
    expect(post.mediaType).toBe('image')
  })

  it('tolera un post sin caption', () => {
    expect(normalizeInstagramMedia(imageMedia, imageInsights).caption).toBeNull()
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npm test src/lib/social/instagram.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 4: Implementar `src/lib/social/instagram.ts`**

```ts
import type { SocialAccount } from '@/db'
import { NO_METRICS, type Connector, type FetchedPost, type PostMetricValues } from './connector'
import { decryptToken } from './crypto'

const GRAPH = 'https://graph.instagram.com/v23.0'
const MAX_POSTS = 200
const PAGE_SIZE = 50
const REFRESH_WINDOW_MS = 7 * 864e5

export type InstagramMedia = {
  id: string
  caption?: string | null
  media_type?: string
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
}

export type InstagramInsights = {
  data?: Array<{ name?: string; values?: Array<{ value?: number }> }>
}

const METRIC_NAMES: Record<string, keyof PostMetricValues> = {
  views: 'views',
  reach: 'reach',
  likes: 'likes',
  comments: 'comments',
  saved: 'saves',
  shares: 'shares',
}

/** REELS and VIDEO both arrive as media_type VIDEO; only the product type separates them. */
function mediaType(media: InstagramMedia): string {
  if (media.media_product_type === 'REELS') return 'reel'
  if (media.media_type === 'CAROUSEL_ALBUM') return 'carousel'
  if (media.media_type === 'VIDEO') return 'video'
  return 'image'
}

export function normalizeInstagramMedia(
  media: InstagramMedia,
  insights: InstagramInsights,
): FetchedPost {
  const metrics: PostMetricValues = { ...NO_METRICS }
  for (const entry of insights.data ?? []) {
    const key = entry.name ? METRIC_NAMES[entry.name] : undefined
    const value = entry.values?.[0]?.value
    if (key && typeof value === 'number') metrics[key] = value
  }

  return {
    externalId: media.id,
    permalink: media.permalink ?? null,
    caption: media.caption ?? null,
    thumbnailUrl: media.thumbnail_url ?? media.media_url ?? null,
    mediaType: mediaType(media),
    publishedAt: new Date(media.timestamp ?? 0),
    metrics,
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Instagram ${response.status}: ${(await response.text()).slice(0, 200)}`)
  }
  return response.json()
}

export const instagramConnector: Connector = {
  network: 'instagram',

  /**
   * A long-lived token lasts 60 days and is refreshed by use, so the daily cron keeps
   * it alive on its own. Refreshing a week early leaves room for a few missed runs.
   */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    const token = decryptToken(account.accessToken)

    const expiresSoon =
      !account.expiresAt || account.expiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS
    if (!expiresSoon) return token

    const refreshed = (await getJson(
      `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
    )) as { access_token?: string; expires_in?: number }

    if (!refreshed.access_token) return token

    const { getDb, socialAccounts } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { encryptToken } = await import('./crypto')

    await getDb()
      .update(socialAccounts)
      .set({
        accessToken: encryptToken(refreshed.access_token),
        expiresAt: new Date(Date.now() + (refreshed.expires_in ?? 5184000) * 1000),
      })
      .where(eq(socialAccounts.id, account.id))

    return refreshed.access_token
  },

  async fetchPosts(_account: SocialAccount, token: string | null): Promise<FetchedPost[]> {
    if (!token) return []

    const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp'
    const media: InstagramMedia[] = []
    let next = `${GRAPH}/me/media?fields=${fields}&limit=${PAGE_SIZE}&access_token=${token}`

    while (next && media.length < MAX_POSTS) {
      const page = (await getJson(next)) as {
        data?: InstagramMedia[]
        paging?: { next?: string }
      }
      media.push(...(page.data ?? []))
      next = page.paging?.next ?? ''
    }

    const metrics = 'views,reach,likes,comments,saved,shares'
    return Promise.all(
      media.slice(0, MAX_POSTS).map(async (item) => {
        // Insights are per-media and 404 for content too old or of the wrong type,
        // which is a normal answer here rather than a failure worth aborting the sync.
        let insights: InstagramInsights = {}
        try {
          insights = (await getJson(
            `${GRAPH}/${item.id}/insights?metric=${metrics}&access_token=${token}`,
          )) as InstagramInsights
        } catch {
          insights = {}
        }
        return normalizeInstagramMedia(item, insights)
      }),
    )
  },
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npm test src/lib/social/instagram.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/instagram.ts src/lib/social/instagram.test.ts src/lib/social/fixtures/instagram-media.json
git commit -m "Implementa el conector de Instagram sobre la Graph API"
```

---

### Task 6: Conector de TikTok

**Files:**
- Create: `src/lib/social/tiktok.ts`, `src/lib/social/tiktok.test.ts`, `src/lib/social/fixtures/tiktok-videos.json`

**Interfaces:**
- Consumes: `Connector`, `FetchedPost`, `NO_METRICS` (Task 4); `decryptToken`, `encryptToken` (Task 1)
- Produces: `tiktokConnector: Connector`; `normalizeTikTokVideo(video: TikTokVideo): FetchedPost`

- [ ] **Step 1: Crear el fixture**

`src/lib/social/fixtures/tiktok-videos.json`:

```json
{
  "data": {
    "videos": [
      {
        "id": "7234567890123456789",
        "title": "Respuesta a @alguien sobre entrenar en casa",
        "cover_image_url": "https://p16.tiktokcdn.com/cover1.jpeg",
        "share_url": "https://www.tiktok.com/@ribs/video/7234567890123456789",
        "create_time": 1786012800,
        "duration": 42,
        "view_count": 91204,
        "like_count": 7712,
        "comment_count": 620,
        "share_count": 388
      },
      {
        "id": "7234567890123456790",
        "title": "",
        "cover_image_url": "https://p16.tiktokcdn.com/cover2.jpeg",
        "share_url": "https://www.tiktok.com/@ribs/video/7234567890123456790",
        "create_time": 1786099200,
        "duration": 15,
        "view_count": 0,
        "like_count": 0,
        "comment_count": 0,
        "share_count": 0
      }
    ],
    "cursor": 0,
    "has_more": false
  }
}
```

El segundo video tiene todos los contadores en cero de verdad — un post recién publicado. El test tiene que confirmar que se guardan como `0` y no como `null`: es la distinción que sostiene toda la UI.

- [ ] **Step 2: Escribir el test que falla**

`src/lib/social/tiktok.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/tiktok-videos.json'
import { normalizeTikTokVideo, type TikTokVideo } from './tiktok'

const [video, fresh] = fixture.data.videos as TikTokVideo[]

describe('normalizeTikTokVideo', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.externalId).toBe('7234567890123456789')
    expect(post.permalink).toBe('https://www.tiktok.com/@ribs/video/7234567890123456789')
    expect(post.caption).toBe('Respuesta a @alguien sobre entrenar en casa')
    expect(post.thumbnailUrl).toBe('https://p16.tiktokcdn.com/cover1.jpeg')
    expect(post.mediaType).toBe('video')
  })

  it('lee create_time como segundos epoch, no milisegundos', () => {
    expect(normalizeTikTokVideo(video!).publishedAt.toISOString()).toBe('2026-08-04T00:00:00.000Z')
  })

  it('mapea los cuatro contadores que TikTok sí reporta', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.metrics.views).toBe(91204)
    expect(post.metrics.likes).toBe(7712)
    expect(post.metrics.comments).toBe(620)
    expect(post.metrics.shares).toBe(388)
  })

  it('deja en null lo que la Display API no expone', () => {
    const post = normalizeTikTokVideo(video!)
    expect(post.metrics.saves).toBeNull()
    expect(post.metrics.reach).toBeNull()
  })

  it('guarda un cero real como cero, no como ausencia', () => {
    const post = normalizeTikTokVideo(fresh!)
    expect(post.metrics.views).toBe(0)
    expect(post.metrics.likes).toBe(0)
  })

  it('trata el título vacío como sin caption', () => {
    expect(normalizeTikTokVideo(fresh!).caption).toBeNull()
  })
})
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npm test src/lib/social/tiktok.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 4: Implementar `src/lib/social/tiktok.ts`**

```ts
import type { SocialAccount } from '@/db'
import { env } from '../env'
import { NO_METRICS, type Connector, type FetchedPost } from './connector'
import { decryptToken } from './crypto'

const API = 'https://open.tiktokapis.com/v2'
const MAX_POSTS = 200
const PAGE_SIZE = 20
const REFRESH_WINDOW_MS = 60 * 60 * 1000

export type TikTokVideo = {
  id: string
  title?: string
  cover_image_url?: string
  share_url?: string
  create_time?: number
  duration?: number
  view_count?: number
  like_count?: number
  comment_count?: number
  share_count?: number
}

/** Absent and zero are different answers; only `undefined` becomes null. */
function count(raw: number | undefined): number | null {
  return typeof raw === 'number' ? raw : null
}

export function normalizeTikTokVideo(video: TikTokVideo): FetchedPost {
  return {
    externalId: video.id,
    permalink: video.share_url ?? null,
    caption: video.title ? video.title : null,
    thumbnailUrl: video.cover_image_url ?? null,
    mediaType: 'video',
    // create_time is epoch seconds, not milliseconds.
    publishedAt: new Date((video.create_time ?? 0) * 1000),
    metrics: {
      ...NO_METRICS,
      views: count(video.view_count),
      likes: count(video.like_count),
      comments: count(video.comment_count),
      shares: count(video.share_count),
    },
  }
}

export const tiktokConnector: Connector = {
  network: 'tiktok',

  /** The access token lasts 24 hours, so a daily cron always finds it expired. */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    const token = decryptToken(account.accessToken)

    const stillValid =
      account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
    if (stillValid) return token

    const clientKey = env('TIKTOK_CLIENT_KEY')
    const clientSecret = env('TIKTOK_CLIENT_SECRET')
    if (!clientKey || !clientSecret || !account.refreshToken) return token

    const response = await fetch(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: decryptToken(account.refreshToken),
      }),
    })
    if (!response.ok) throw new Error(`TikTok refresh ${response.status}`)

    const data = (await response.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    if (!data.access_token) return token

    const { getDb, socialAccounts } = await import('@/db')
    const { eq } = await import('drizzle-orm')
    const { encryptToken } = await import('./crypto')

    await getDb()
      .update(socialAccounts)
      .set({
        accessToken: encryptToken(data.access_token),
        refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : account.refreshToken,
        expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
      })
      .where(eq(socialAccounts.id, account.id))

    return data.access_token
  },

  async fetchPosts(_account: SocialAccount, token: string | null): Promise<FetchedPost[]> {
    if (!token) return []

    const fields = [
      'id',
      'title',
      'cover_image_url',
      'share_url',
      'create_time',
      'duration',
      'view_count',
      'like_count',
      'comment_count',
      'share_count',
    ].join(',')

    const videos: TikTokVideo[] = []
    let cursor: number | undefined

    while (videos.length < MAX_POSTS) {
      const response = await fetch(`${API}/video/list/?fields=${fields}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: PAGE_SIZE, ...(cursor ? { cursor } : {}) }),
      })
      if (!response.ok) {
        throw new Error(`TikTok ${response.status}: ${(await response.text()).slice(0, 200)}`)
      }

      const payload = (await response.json()) as {
        data?: { videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }
      }
      videos.push(...(payload.data?.videos ?? []))

      if (!payload.data?.has_more) break
      cursor = payload.data.cursor
    }

    return videos.slice(0, MAX_POSTS).map(normalizeTikTokVideo)
  },
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `npm test src/lib/social/tiktok.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/tiktok.ts src/lib/social/tiktok.test.ts src/lib/social/fixtures/tiktok-videos.json
git commit -m "Implementa el conector de TikTok sobre la Display API"
```

---

### Task 7: Matemática de períodos y regla de archivado

**Files:**
- Create: `src/lib/social/delta.ts`, `src/lib/social/delta.test.ts`, `src/lib/social/archive.ts`, `src/lib/social/archive.test.ts`

**Interfaces:**
- Produces: `periodChange(snapshots: Snapshot[], from: string, to: string): PeriodChange`; `postsToArchive(known, fetched): string[]`

- [ ] **Step 1: Escribir el test de deltas**

`src/lib/social/delta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { periodChange, type Snapshot } from './delta'

const snapshots: Snapshot[] = [
  { day: '2026-08-01', value: 100 },
  { day: '2026-08-10', value: 400 },
  { day: '2026-08-20', value: 900 },
]

describe('periodChange', () => {
  it('resta el último snapshot previo al período', () => {
    expect(periodChange(snapshots, '2026-08-05', '2026-08-25')).toEqual({
      current: 900,
      change: 800,
      isNew: false,
    })
  })

  it('sin snapshot previo, el crecimiento es el acumulado y el post es nuevo', () => {
    expect(periodChange(snapshots, '2026-07-01', '2026-08-25')).toEqual({
      current: 900,
      change: 900,
      isNew: true,
    })
  })

  it('sin snapshots dentro del período no hay dato', () => {
    expect(periodChange(snapshots, '2026-09-01', '2026-09-30')).toEqual({
      current: null,
      change: null,
      isNew: false,
    })
  })

  it('usa el snapshot más cercano al borde, no uno exacto', () => {
    // El cron se saltó el 2026-08-15; el borde cae en un día sin fila.
    expect(periodChange(snapshots, '2026-08-15', '2026-08-25').change).toBe(500)
  })

  it('piso en cero cuando el contador retrocede', () => {
    const corrected: Snapshot[] = [
      { day: '2026-08-01', value: 500 },
      { day: '2026-08-10', value: 450 },
    ]
    expect(periodChange(corrected, '2026-08-05', '2026-08-25').change).toBe(0)
  })

  it('ignora los snapshots con la métrica ausente', () => {
    const partial: Snapshot[] = [
      { day: '2026-08-01', value: null },
      { day: '2026-08-10', value: 300 },
    ]
    expect(periodChange(partial, '2026-08-05', '2026-08-25')).toEqual({
      current: 300,
      change: 300,
      isNew: true,
    })
  })

  it('sin snapshots no revienta', () => {
    expect(periodChange([], '2026-08-01', '2026-08-25')).toEqual({
      current: null,
      change: null,
      isNew: false,
    })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test src/lib/social/delta.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 3: Implementar `src/lib/social/delta.ts`**

```ts
/** One cumulative reading. `day` is `YYYY-MM-DD`, so string comparison is date order. */
export type Snapshot = { day: string; value: number | null }

export type PeriodChange = {
  /** The cumulative total at the end of the period. */
  current: number | null
  /** How much it grew during the period. */
  change: number | null
  /** No reading exists before the period — the post was published inside it. */
  isNew: boolean
}

/**
 * Counters are cumulative, so a period's growth is the difference between its edges.
 *
 * The baseline is the last reading strictly before `from`, not one taken exactly on
 * it: the daily cron can miss a run, and demanding an exact match would report a
 * month of growth as nothing.
 */
export function periodChange(snapshots: Snapshot[], from: string, to: string): PeriodChange {
  const known = snapshots
    .filter((s) => s.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day)) as Array<{ day: string; value: number }>

  const inside = known.filter((s) => s.day >= from && s.day <= to)
  if (inside.length === 0) return { current: null, change: null, isNew: false }

  const current = inside[inside.length - 1]!.value
  const before = known.filter((s) => s.day < from).at(-1)

  if (!before) return { current, change: current, isNew: true }

  // Instagram revises views downward sometimes. Negative growth is noise, not a story.
  return { current, change: Math.max(0, current - before.value), isNew: false }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test src/lib/social/delta.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Escribir el test de archivado**

`src/lib/social/archive.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { postsToArchive } from './archive'

const d = (iso: string) => new Date(iso)

describe('postsToArchive', () => {
  it('archiva un post que desapareció dentro de la ventana', () => {
    const known = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'b', publishedAt: d('2026-08-10') },
    ]
    const fetched = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, fetched)).toEqual(['b'])
  })

  it('no archiva lo que quedó fuera del tope de la ventana', () => {
    // 'viejo' es anterior al más antiguo que vino: cayó por el límite de 200, no fue borrado.
    const known = [
      { externalId: 'nuevo', publishedAt: d('2026-08-20') },
      { externalId: 'viejo', publishedAt: d('2024-01-01') },
    ]
    const fetched = [{ externalId: 'nuevo', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, fetched)).toEqual([])
  })

  it('no archiva nada ante una respuesta vacía', () => {
    // Una API que devuelve cero posts es casi siempre un problema de la API.
    const known = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(known, [])).toEqual([])
  })

  it('no archiva nada cuando vino todo', () => {
    const posts = [{ externalId: 'a', publishedAt: d('2026-08-20') }]
    expect(postsToArchive(posts, posts)).toEqual([])
  })

  it('incluye el borde exacto de la ventana', () => {
    const known = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'borde', publishedAt: d('2026-08-10') },
    ]
    const fetched = [
      { externalId: 'a', publishedAt: d('2026-08-20') },
      { externalId: 'c', publishedAt: d('2026-08-10') },
    ]
    expect(postsToArchive(known, fetched)).toEqual(['borde'])
  })
})
```

- [ ] **Step 6: Correr y verificar que falla**

Run: `npm test src/lib/social/archive.test.ts`
Expected: FAIL — no existe el módulo

- [ ] **Step 7: Implementar `src/lib/social/archive.ts`**

```ts
type Identified = { externalId: string; publishedAt: Date }

/**
 * Which known posts count as deleted on the network.
 *
 * The fetch is capped at the 200 most recent, so "did not come back" is not enough on
 * its own — post 201 would be archived on the first run just for falling off the end.
 * Only posts inside the range the response actually covered are candidates.
 *
 * An empty response archives nothing: zero posts is almost always the API having a bad
 * day, and archiving the whole catalogue over it is not a recoverable mistake.
 */
export function postsToArchive(known: Identified[], fetched: Identified[]): string[] {
  if (fetched.length === 0) return []

  const oldestFetched = Math.min(...fetched.map((p) => p.publishedAt.getTime()))
  const seen = new Set(fetched.map((p) => p.externalId))

  return known
    .filter((p) => !seen.has(p.externalId) && p.publishedAt.getTime() >= oldestFetched)
    .map((p) => p.externalId)
}
```

- [ ] **Step 8: Correr y verificar que pasa**

Run: `npm test`
Expected: PASS — toda la suite

- [ ] **Step 9: Commit**

```bash
git add src/lib/social/delta.ts src/lib/social/delta.test.ts src/lib/social/archive.ts src/lib/social/archive.test.ts
git commit -m "Calcula el crecimiento por período y acota qué posts se archivan"
```

---

### Task 8: Orquestador de sincronización

**Files:**
- Create: `src/lib/social/index.ts`, `src/lib/social/sync.ts`

**Interfaces:**
- Consumes: los tres conectores (Tasks 4-6), `campaignTagFor` (Task 2), `postsToArchive` (Task 7), `SITE_TIMEZONE` (`src/lib/analytics.ts`)
- Produces: `CONNECTORS: Connector[]`, `connectorFor(network: string): Connector | undefined`, `syncAll(): Promise<SyncReport>`, `syncNetwork(network: string): Promise<void>`, `localDay(date: Date): string`

> **Nota para quien implemente:** esta tarea toca la base de datos, así que no lleva tests unitarios — las piezas puras que la sostienen (`postsToArchive`, `campaignTagFor`, los normalizadores) ya están cubiertas en las tareas anteriores. La verificación es la corrida real del Step 6.

- [ ] **Step 1: Crear el registro `src/lib/social/index.ts`**

```ts
import type { Connector } from './connector'
import { instagramConnector } from './instagram'
import { tiktokConnector } from './tiktok'
import { youtubeConnector } from './youtube'

/** Adding a network is a file plus a line here. Nothing else knows they differ. */
export const CONNECTORS: Connector[] = [instagramConnector, tiktokConnector, youtubeConnector]

export function connectorFor(network: string): Connector | undefined {
  return CONNECTORS.find((c) => c.network === network)
}

export type { Connector, FetchedPost, PostMetricValues } from './connector'
```

- [ ] **Step 2: Implementar `src/lib/social/sync.ts`**

```ts
import 'server-only'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { getDb, postMetrics, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { SITE_TIMEZONE } from '../analytics'
import { env } from '../env'
import { postsToArchive } from './archive'
import { campaignTagFor } from './campaign'
import type { FetchedPost } from './connector'
import { CONNECTORS, connectorFor } from './index'

export type SyncReport = Array<{ network: string; ok: boolean; posts: number; error?: string }>

/** The dashboard buckets days in SITE_TIMEZONE, and a snapshot has to agree with it. */
export function localDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * YouTube has no OAuth to complete, so its account row is born the first time a sync
 * runs with the two variables present. The other two arrive through the callback.
 */
async function ensureYouTubeAccount(): Promise<void> {
  const channelId = env('YOUTUBE_CHANNEL_ID')
  if (!channelId || !env('YOUTUBE_API_KEY')) return

  await getDb()
    .insert(socialAccounts)
    .values({ network: 'youtube', externalId: channelId, handle: channelId })
    .onConflictDoUpdate({
      target: socialAccounts.network,
      set: { externalId: channelId },
    })
}

async function upsertPost(post: FetchedPost, network: string): Promise<string> {
  const db = getDb()

  const [row] = await db
    .insert(socialPosts)
    .values({
      network,
      externalId: post.externalId,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedAt: post.publishedAt,
      campaign: campaignTagFor(network, post.externalId),
    })
    .onConflictDoUpdate({
      target: [socialPosts.network, socialPosts.externalId],
      // `campaign` is deliberately absent: once the owner edits the tag, it is theirs.
      set: {
        permalink: post.permalink,
        caption: post.caption,
        thumbnailUrl: post.thumbnailUrl,
        mediaType: post.mediaType,
        publishedAt: post.publishedAt,
        archivedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: socialPosts.id })

  return row!.id
}

async function writeSnapshot(postId: string, post: FetchedPost, day: string): Promise<void> {
  await getDb()
    .insert(postMetrics)
    .values({ postId, day, ...post.metrics })
    .onConflictDoUpdate({
      target: [postMetrics.postId, postMetrics.day],
      set: { ...post.metrics, capturedAt: new Date() },
    })
}

export async function syncNetwork(network: string): Promise<number> {
  const db = getDb()
  const connector = connectorFor(network)
  if (!connector) throw new Error(`Unknown network ${network}`)

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.network, network))
  if (!account) return 0

  try {
    const token = await connector.ensureCredential(account as SocialAccount)
    const fetched = await connector.fetchPosts(account as SocialAccount, token)

    const day = localDay(new Date())
    for (const post of fetched) {
      const id = await upsertPost(post, network)
      await writeSnapshot(id, post, day)
    }

    const known = await db
      .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(and(eq(socialPosts.network, network), isNull(socialPosts.archivedAt)))

    const gone = postsToArchive(known, fetched)
    if (gone.length > 0) {
      await db
        .update(socialPosts)
        .set({ archivedAt: new Date() })
        .where(and(eq(socialPosts.network, network), inArray(socialPosts.externalId, gone)))
    }

    await db
      .update(socialAccounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: null })
      .where(eq(socialAccounts.id, account.id))

    return fetched.length
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(socialAccounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: message.slice(0, 500) })
      .where(eq(socialAccounts.id, account.id))
    throw error
  }
}

/**
 * Every network runs on its own. A connector that throws leaves its error on its own
 * account row and the others still finish and store their snapshot — which is the whole
 * reason it was defensible to take on three integrations at once.
 */
export async function syncAll(): Promise<SyncReport> {
  await ensureYouTubeAccount()

  const results = await Promise.allSettled(CONNECTORS.map((c) => syncNetwork(c.network)))

  return CONNECTORS.map((connector, i) => {
    const result = results[i]!
    return result.status === 'fulfilled'
      ? { network: connector.network, ok: true, posts: result.value }
      : {
          network: connector.network,
          ok: false,
          posts: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
  })
}
```

- [ ] **Step 3: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 4: Conseguir una API key de YouTube para probar de verdad**

En https://console.cloud.google.com → crear proyecto → *APIs & Services* → habilitar **YouTube Data API v3** → *Credentials* → *Create credentials* → *API key*. Agregar a `.env.local`:

```
YOUTUBE_API_KEY=AIza...
YOUTUBE_CHANNEL_ID=UC...
```

El channel id sale de https://www.youtube.com/account_advanced.

- [ ] **Step 5: Escribir un script de humo desechable**

`scripts/sync-once.ts`:

```ts
import { syncAll } from '../src/lib/social/sync'

syncAll()
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

- [ ] **Step 6: Correr la sincronización de verdad**

Run: `npx dotenv -e .env.local -- tsx scripts/sync-once.ts`
Expected: el reporte muestra `youtube` con `ok: true` y un conteo de posts; `instagram` y `tiktok` con `posts: 0` y `ok: true` (sin cuenta conectada, se saltan en silencio).

- [ ] **Step 7: Verificar que la corrida es idempotente**

Run: `npx dotenv -e .env.local -- tsx scripts/sync-once.ts` otra vez, después `npm run db:studio`
Expected: en `post_metrics` hay **una** fila por post para el día de hoy, no dos.

- [ ] **Step 8: Commit**

```bash
git add src/lib/social/index.ts src/lib/social/sync.ts scripts/sync-once.ts
git commit -m "Sincroniza las tres redes con aislamiento de fallos por conector"
```

---

### Task 9: Cron diario y acción de sincronizar

**Files:**
- Create: `src/app/api/cron/sync-social/route.ts`, `vercel.json`
- Modify: `src/app/admin/actions.ts`, `.env.example`

**Interfaces:**
- Consumes: `syncAll` (Task 8), `requireAuth` (existente en `actions.ts`)
- Produces: `syncSocialNow(): Promise<{ ok?: boolean; error?: string }>`

- [ ] **Step 1: Crear `src/app/api/cron/sync-social/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { syncAll } from '@/lib/social/sync'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Without a secret the endpoint stays shut rather than open: an unauthenticated
  // sync is a free way for anyone to burn the day's API quota.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const report = await syncAll()
  return NextResponse.json({ report })
}
```

- [ ] **Step 2: Crear `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/sync-social", "schedule": "0 9 * * *" }]
}
```

Las 9:00 UTC son las 5:00 o 6:00 en Santiago según horario de verano — la corrida cae de madrugada y el snapshot del día queda escrito antes de que alguien mire el panel.

- [ ] **Step 3: Agregar la acción al final de `src/app/admin/actions.ts`**

```ts
/* ------------------------------------------------------------------ social -- */

let lastSyncStartedAt = 0
const SYNC_COOLDOWN_MS = 5 * 60 * 1000

export async function syncSocialNow(): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth()

  if (Date.now() - lastSyncStartedAt < SYNC_COOLDOWN_MS) {
    return { error: 'Espera unos minutos antes de volver a sincronizar.' }
  }
  lastSyncStartedAt = Date.now()

  const { syncAll } = await import('@/lib/social/sync')
  const report = await syncAll()

  revalidatePath('/admin/content')

  const failed = report.filter((r) => !r.ok)
  if (failed.length === report.length) {
    return { error: 'Ninguna red respondió. Revisa las tarjetas de conexión.' }
  }
  return { ok: true }
}

export async function disconnectNetwork(network: string): Promise<void> {
  await requireAuth()

  const { socialAccounts } = await import('@/db')
  // Posts and metrics survive: the traffic they brought really happened.
  await getDb().delete(socialAccounts).where(eq(socialAccounts.network, network))

  revalidatePath('/admin/content')
}

export async function updatePostCampaign(
  postId: string,
  campaign: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth()

  const clean = campaign.trim().replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 48)
  if (!clean) return { error: 'La etiqueta no puede quedar vacía.' }

  const { socialPosts } = await import('@/db')

  try {
    await getDb().update(socialPosts).set({ campaign: clean }).where(eq(socialPosts.id, postId))
  } catch {
    // The unique index is what rejects it; two posts sharing a tag would merge histories.
    return { error: 'Otra pieza de contenido ya usa esa etiqueta.' }
  }

  revalidatePath('/admin/content')
  revalidatePath('/admin/analytics')
  return { ok: true }
}
```

- [ ] **Step 4: Documentar las variables en `.env.example`**

Agregar al final:

```
# Analítica de posts. Todas opcionales: sin ellas esa red aparece como no conectada.
# YouTube no usa OAuth, solo estas dos.
YOUTUBE_API_KEY=
YOUTUBE_CHANNEL_ID=
# Instagram y TikTok sí. Se crean en developers.facebook.com y developers.tiktok.com.
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
# La inyecta Vercel al declarar el cron. Sin ella el endpoint responde 401 siempre.
CRON_SECRET=
```

- [ ] **Step 5: Verificar que el endpoint rechaza sin secreto**

Run: `npm run dev` en una terminal, y en otra:

```bash
curl -i http://localhost:3000/api/cron/sync-social
```

Expected: `HTTP/1.1 401`

- [ ] **Step 6: Verificar que acepta con secreto**

Agregar `CRON_SECRET=prueba-local` a `.env.local`, reiniciar `npm run dev`, y:

```bash
curl -s -H "Authorization: Bearer prueba-local" http://localhost:3000/api/cron/sync-social
```

Expected: JSON con el reporte de las tres redes.

- [ ] **Step 7: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 8: Commit**

```bash
git add vercel.json src/app/api/cron/sync-social/route.ts src/app/admin/actions.ts .env.example
git commit -m "Corre la sincronización por cron diario y por botón del panel"
```

---

### Task 10: OAuth de Instagram y TikTok

**Files:**
- Create: `src/app/api/social/[network]/connect/route.ts`, `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Consumes: `encryptToken` (Task 1), `isAuthenticated` (`src/lib/auth.ts`), `env`
- Produces: rutas `GET /api/social/[network]/connect` y `GET /api/social/[network]/callback`

- [ ] **Step 1: Crear `src/app/api/social/[network]/connect/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const SCOPES: Record<string, string> = {
  instagram: 'instagram_business_basic,instagram_business_manage_insights',
  tiktok: 'user.info.basic,video.list',
}

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  if (!(await isAuthenticated())) return new NextResponse('No autorizado', { status: 401 })

  const { network } = await params
  const scope = SCOPES[network]
  if (!scope) return new NextResponse('Esa red no usa OAuth', { status: 400 })

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/social/${network}/callback`

  // A signed, short-lived state is what stops a stranger's callback from writing
  // their tokens into this dashboard.
  const state = await new SignJWT({ network })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())

  if (network === 'instagram') {
    const appId = env('INSTAGRAM_APP_ID')
    if (!appId) return new NextResponse('Falta INSTAGRAM_APP_ID', { status: 400 })

    const url = new URL('https://www.instagram.com/oauth/authorize')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return NextResponse.redirect(url)
  }

  const clientKey = env('TIKTOK_CLIENT_KEY')
  if (!clientKey) return new NextResponse('Falta TIKTOK_CLIENT_KEY', { status: 400 })

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', clientKey)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return NextResponse.redirect(url)
}
```

- [ ] **Step 2: Crear `src/app/api/social/[network]/callback/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDb, socialAccounts } from '@/db'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'
import { encryptToken } from '@/lib/social/crypto'

export const dynamic = 'force-dynamic'

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

type Credential = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  externalId: string | null
  handle: string | null
}

async function instagramCredential(code: string, redirectUri: string): Promise<Credential> {
  const appId = env('INSTAGRAM_APP_ID')
  const appSecret = env('INSTAGRAM_APP_SECRET')
  if (!appId || !appSecret) throw new Error('Faltan las credenciales de Instagram')

  const short = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!short.ok) throw new Error(`Instagram rechazó el código: ${short.status}`)
  const shortData = (await short.json()) as { access_token?: string; user_id?: number }
  if (!shortData.access_token) throw new Error('Instagram no devolvió token')

  // The short-lived token lasts an hour; only the long-lived one is worth storing.
  const long = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
      `&client_secret=${appSecret}&access_token=${shortData.access_token}`,
  )
  if (!long.ok) throw new Error(`Instagram no canjeó el token largo: ${long.status}`)
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }

  const token = longData.access_token ?? shortData.access_token
  const profile = (await (
    await fetch(`https://graph.instagram.com/v23.0/me?fields=id,username&access_token=${token}`)
  ).json()) as { id?: string; username?: string }

  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
    externalId: profile.id ?? String(shortData.user_id ?? ''),
    handle: profile.username ? `@${profile.username}` : null,
  }
}

async function tiktokCredential(code: string, redirectUri: string): Promise<Credential> {
  const clientKey = env('TIKTOK_CLIENT_KEY')
  const clientSecret = env('TIKTOK_CLIENT_SECRET')
  if (!clientKey || !clientSecret) throw new Error('Faltan las credenciales de TikTok')

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!response.ok) throw new Error(`TikTok rechazó el código: ${response.status}`)

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    open_id?: string
  }
  if (!data.access_token) throw new Error('TikTok no devolvió token')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    externalId: data.open_id ?? null,
    handle: null,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  if (!(await isAuthenticated())) return new NextResponse('No autorizado', { status: 401 })

  const { network } = await params
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const back = (message: string) =>
    NextResponse.redirect(`${url.origin}/admin/content?mensaje=${encodeURIComponent(message)}`)

  if (!code || !state) return back('La red no devolvió el código de autorización.')

  try {
    const { payload } = await jwtVerify(state, secret())
    if (payload.network !== network) return back('El estado no corresponde a esa red.')
  } catch {
    return back('El enlace de conexión expiró. Inténtalo de nuevo.')
  }

  const redirectUri = `${url.origin}/api/social/${network}/callback`

  try {
    const credential =
      network === 'instagram'
        ? await instagramCredential(code, redirectUri)
        : await tiktokCredential(code, redirectUri)

    await getDb()
      .insert(socialAccounts)
      .values({
        network,
        handle: credential.handle,
        externalId: credential.externalId,
        accessToken: encryptToken(credential.accessToken),
        refreshToken: credential.refreshToken ? encryptToken(credential.refreshToken) : null,
        expiresAt: credential.expiresAt,
        lastSyncError: null,
      })
      .onConflictDoUpdate({
        target: socialAccounts.network,
        set: {
          handle: credential.handle,
          externalId: credential.externalId,
          accessToken: encryptToken(credential.accessToken),
          refreshToken: credential.refreshToken ? encryptToken(credential.refreshToken) : null,
          expiresAt: credential.expiresAt,
          lastSyncError: null,
        },
      })

    return back(`${network} conectado.`)
  } catch (error) {
    return back(error instanceof Error ? error.message : 'No se pudo conectar.')
  }
}
```

- [ ] **Step 3: Verificar que las rutas rechazan sin sesión**

Run: con `npm run dev` corriendo,

```bash
curl -i http://localhost:3000/api/social/instagram/connect
```

Expected: `HTTP/1.1 401`

- [ ] **Step 4: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/social/[network]"
git commit -m "Conecta Instagram y TikTok por OAuth con estado firmado"
```

---

### Task 11: Capa de consultas de la vista

**Files:**
- Create: `src/lib/posts.ts`

**Interfaces:**
- Consumes: `Filters`, `SITE_TIMEZONE` (`src/lib/analytics.ts`); `periodChange` (Task 7); tablas (Task 3)
- Produces: `getPostRows(f: Filters, includeArchived?: boolean): Promise<PostRow[]>`, `getPostKpis(f: Filters): Promise<PostKpis>`, `getPostSeries(f: Filters): Promise<PostSeriesPoint[]>`, `getConnections(): Promise<ConnectionRow[]>`, `getCampaignPosts(campaigns: string[]): Promise<Map<string, CampaignPost>>`; tipos `PostRow`, `PostKpis`, `PostSeriesPoint`, `ConnectionRow`, `CampaignPost`

- [ ] **Step 1: Implementar `src/lib/posts.ts`**

```ts
import 'server-only'
import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { clicks, getDb, postMetrics, socialAccounts, socialPosts, visits } from '@/db'
import type { Filters } from './analytics'
import { SITE_TIMEZONE } from './analytics'
import { periodChange, type Snapshot } from './social/delta'

export type PostRow = {
  id: string
  network: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: string
  campaign: string
  /** Deleted on the network. Hidden unless the view asks for them. */
  archived: boolean
  views: number | null
  viewsChange: number | null
  isNew: boolean
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  reach: number | null
  /** null when the tag has never been seen in a visit — the link was never pasted. */
  visits: number | null
  uniques: number | null
  clicks: number | null
  ctr: number | null
  /** Visits over views: the fraction of the audience that actually arrived. */
  pull: number | null
}

export type PostKpis = {
  views: number
  engagement: number
  visits: number
  pull: number | null
}

export type ConnectionRow = {
  network: string
  handle: string | null
  connected: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  /** YouTube is configured by environment and has no button. */
  usesOAuth: boolean
}

export type CampaignPost = {
  network: string
  caption: string | null
  thumbnailUrl: string | null
  permalink: string | null
}

const int = (fragment: SQL) => sql<number>`${fragment}`.mapWith(Number)

function day(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export async function getPostRows(f: Filters, includeArchived = false): Promise<PostRow[]> {
  const db = getDb()
  const from = day(f.from)
  const to = day(f.to)

  const posts = await db
    .select()
    .from(socialPosts)
    .where(includeArchived ? undefined : isNull(socialPosts.archivedAt))
    .orderBy(desc(socialPosts.publishedAt))
    .limit(200)

  if (posts.length === 0) return []

  const ids = posts.map((p) => p.id)
  const campaigns = posts.map((p) => p.campaign)

  // Every snapshot from before the window too: the baseline for a period's growth is
  // the last reading *before* it, which by definition falls outside the range.
  const snapshots = await db
    .select()
    .from(postMetrics)
    .where(and(inArray(postMetrics.postId, ids), lte(postMetrics.day, to)))

  const byPost = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const list = byPost.get(snapshot.postId) ?? []
    list.push(snapshot)
    byPost.set(snapshot.postId, list)
  }

  const visitConds: SQL[] = [
    gte(visits.createdAt, f.from),
    lte(visits.createdAt, f.to),
    inArray(visits.campaign, campaigns),
  ]
  if (f.profileId) visitConds.push(eq(visits.profileId, f.profileId))
  if (!f.includeBots) visitConds.push(eq(visits.isBot, false))

  const visitRows = await db
    .select({
      campaign: sql<string>`${visits.campaign}`,
      total: int(sql`count(*)`),
      uniques: int(sql`count(distinct ${visits.visitorHash})`),
    })
    .from(visits)
    .where(and(...visitConds))
    .groupBy(visits.campaign)

  const clickConds: SQL[] = [
    gte(clicks.createdAt, f.from),
    lte(clicks.createdAt, f.to),
    inArray(visits.campaign, campaigns),
  ]
  if (f.profileId) clickConds.push(eq(clicks.profileId, f.profileId))
  if (!f.includeBots) clickConds.push(eq(clicks.isBot, false))

  const clickRows = await db
    .select({ campaign: sql<string>`${visits.campaign}`, total: int(sql`count(*)`) })
    .from(clicks)
    .innerJoin(visits, eq(clicks.visitId, visits.id))
    .where(and(...clickConds))
    .groupBy(visits.campaign)

  // A tag with no traffic *ever* means the link was never pasted, which reads as "—".
  // A tag with traffic before but none this period is a real zero.
  const everSeen = await db
    .selectDistinct({ campaign: sql<string>`${visits.campaign}` })
    .from(visits)
    .where(inArray(visits.campaign, campaigns))

  const seen = new Set(everSeen.map((r) => r.campaign))
  const visitMap = new Map(visitRows.map((r) => [r.campaign, r]))
  const clickMap = new Map(clickRows.map((r) => [r.campaign, r.total]))

  return posts.map((post) => {
    const list = byPost.get(post.id) ?? []
    const snapshotsOf = (key: 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach'): Snapshot[] =>
      list.map((s) => ({ day: s.day, value: s[key] }))

    const views = periodChange(snapshotsOf('views'), from, to)
    const pasted = seen.has(post.campaign)
    const traffic = visitMap.get(post.campaign)
    const visitCount = pasted ? (traffic?.total ?? 0) : null
    const clickCount = pasted ? (clickMap.get(post.campaign) ?? 0) : null

    return {
      id: post.id,
      network: post.network,
      permalink: post.permalink,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      publishedAt: post.publishedAt.toISOString(),
      campaign: post.campaign,
      archived: post.archivedAt !== null,
      views: views.current,
      viewsChange: views.change,
      isNew: views.isNew,
      likes: periodChange(snapshotsOf('likes'), from, to).current,
      comments: periodChange(snapshotsOf('comments'), from, to).current,
      shares: periodChange(snapshotsOf('shares'), from, to).current,
      saves: periodChange(snapshotsOf('saves'), from, to).current,
      reach: periodChange(snapshotsOf('reach'), from, to).current,
      visits: visitCount,
      uniques: pasted ? (traffic?.uniques ?? 0) : null,
      clicks: clickCount,
      ctr:
        visitCount !== null && visitCount > 0 && clickCount !== null
          ? (clickCount / visitCount) * 100
          : null,
      pull:
        views.current !== null && views.current > 0 && visitCount !== null
          ? (visitCount / views.current) * 100
          : null,
    }
  })
}

export async function getPostKpis(f: Filters): Promise<PostKpis> {
  const rows = await getPostRows(f)

  const sum = (pick: (row: PostRow) => number | null) =>
    rows.reduce((total, row) => total + (pick(row) ?? 0), 0)

  const views = sum((r) => r.views)
  const visitTotal = sum((r) => r.visits)

  return {
    views,
    engagement: sum((r) => r.likes) + sum((r) => r.comments) + sum((r) => r.shares),
    visits: visitTotal,
    pull: views > 0 ? (visitTotal / views) * 100 : null,
  }
}

export type PostSeriesPoint = {
  bucket: string
  label: string
  fullLabel: string
  views: number
  visits: number
}

const TICK = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FULL = new Intl.DateTimeFormat('es', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/**
 * Views gained per day against the visits they drove.
 *
 * The `lag` window is what turns cumulative counters into daily gains, and the
 * `greatest(0, …)` absorbs the downward revisions Instagram occasionally publishes.
 */
export async function getPostSeries(f: Filters): Promise<PostSeriesPoint[]> {
  const tz = SITE_TIMEZONE
  const from = day(f.from)
  const to = day(f.to)

  const query = sql`
    with span as (
      select generate_series(
        date_trunc('day', ${f.from}::timestamptz at time zone ${tz}),
        date_trunc('day', ${f.to}::timestamptz at time zone ${tz}),
        '1 day'::interval
      ) as bucket
    ),
    gains as (
      select m.day,
             greatest(0, m.views - lag(m.views) over (partition by m.post_id order by m.day)) as gained
      from ${postMetrics} m
      join ${socialPosts} p on p.id = m.post_id
      where p.archived_at is null and m.views is not null and m.day <= ${to}
    ),
    g as (
      select day, sum(gained)::int as total from gains where day >= ${from} group by 1
    ),
    v as (
      select date_trunc('day', vi.created_at at time zone ${tz}) as bucket, count(*) as total
      from ${visits} vi
      join ${socialPosts} p on p.campaign = vi.campaign
      where vi.created_at >= ${f.from} and vi.created_at <= ${f.to}
        ${f.profileId ? sql`and vi.profile_id = ${f.profileId}` : sql``}
        ${f.includeBots ? sql`` : sql`and vi.is_bot = false`}
      group by 1
    )
    select to_char(span.bucket, 'YYYY-MM-DD') as bucket,
           coalesce(g.total, 0)::int as views,
           coalesce(v.total, 0)::int as visits
    from span
    left join g on g.day = span.bucket::date
    left join v on v.bucket = span.bucket
    order by span.bucket
  `

  const result = await getDb().execute(query)
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{
    bucket: string
    views: number
    visits: number
  }>

  return rows.map((row) => {
    const at = new Date(`${row.bucket}T00:00:00Z`)
    return {
      bucket: row.bucket,
      label: TICK.format(at),
      fullLabel: FULL.format(at),
      views: Number(row.views),
      visits: Number(row.visits),
    }
  })
}

const OAUTH_NETWORKS = new Set(['instagram', 'tiktok'])

export async function getConnections(): Promise<ConnectionRow[]> {
  const accounts = await getDb().select().from(socialAccounts)
  const byNetwork = new Map(accounts.map((a) => [a.network, a]))

  return ['instagram', 'tiktok', 'youtube'].map((network) => {
    const account = byNetwork.get(network)
    return {
      network,
      handle: account?.handle ?? null,
      connected: Boolean(account),
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: account?.lastSyncError ?? null,
      usesOAuth: OAUTH_NETWORKS.has(network),
    }
  })
}

/** Lets the analytics campaign table show a post's caption instead of a bare tag. */
export async function getCampaignPosts(campaigns: string[]): Promise<Map<string, CampaignPost>> {
  if (campaigns.length === 0) return new Map()

  const rows = await getDb()
    .select({
      campaign: socialPosts.campaign,
      network: socialPosts.network,
      caption: socialPosts.caption,
      thumbnailUrl: socialPosts.thumbnailUrl,
      permalink: socialPosts.permalink,
    })
    .from(socialPosts)
    .where(inArray(socialPosts.campaign, campaigns))

  return new Map(rows.map((r) => [r.campaign, r]))
}
```

- [ ] **Step 2: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add src/lib/posts.ts
git commit -m "Cruza las métricas de plataforma con el tráfico propio por etiqueta"
```

---

### Task 12: Hook de ordenamiento compartido

**Files:**
- Create: `src/components/charts/use-sorted-rows.ts`
- Modify: `src/components/charts/campaign-table.tsx`

**Interfaces:**
- Produces: `useSortedRows<T>(rows: T[], initialKey: keyof T & string): { sorted: T[]; sortKey: string; descending: boolean; toggle: (key: string) => void }`

- [ ] **Step 1: Crear `src/components/charts/use-sorted-rows.ts`**

```ts
'use client'

import { useMemo, useState } from 'react'

/**
 * Column sorting for a table of plain rows.
 *
 * Nulls sink to the bottom in both directions on purpose: "no data" is not a small
 * number, and letting it win the ascending sort buries the rows worth reading.
 */
export function useSortedRows<T extends Record<string, unknown>>(
  rows: T[],
  initialKey: keyof T & string,
) {
  const [sortKey, setSortKey] = useState<string>(initialKey)
  const [descending, setDescending] = useState(true)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]

      if (left == null && right == null) return 0
      if (left == null) return 1
      if (right == null) return -1

      const comparison =
        typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right, 'es')
          : Number(left) - Number(right)

      return descending ? -comparison : comparison
    })
  }, [rows, sortKey, descending])

  function toggle(key: string) {
    if (key === sortKey) setDescending((value) => !value)
    else {
      setSortKey(key)
      setDescending(true)
    }
  }

  return { sorted, sortKey, descending, toggle }
}
```

- [ ] **Step 2: Reemplazar el estado local de `CampaignTable` por el hook**

En `src/components/charts/campaign-table.tsx`, borrar el bloque `const [sort, setSort] = useState<Column>('visits')`, el `const [descending, setDescending] = useState(true)`, el `useMemo` de `sorted` y la función `toggle`. En su lugar, justo después de la firma del componente:

```tsx
const { sorted, sortKey, descending, toggle } = useSortedRows(rows, 'visits')
```

Ajustar los imports: quitar `useMemo` y `useState` de `react`, agregar
`import { useSortedRows } from './use-sorted-rows'`. En el `<th>`, reemplazar las tres
apariciones de `sort === column.key` por `sortKey === column.key`.

- [ ] **Step 3: Verificar que la tabla existente sigue ordenando**

Run: `npm run dev`, abrir `/admin/analytics` y hacer click en las cabeceras de *"Qué contenido te trae gente"*.
Expected: ordena por cada columna y alterna ascendente/descendente igual que antes.

- [ ] **Step 4: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/use-sorted-rows.ts src/components/charts/campaign-table.tsx
git commit -m "Extrae el ordenamiento por columna a un hook que comparten dos tablas"
```

---

### Task 13: La vista — tarjetas de conexión

**Files:**
- Create: `src/app/admin/(dash)/content/page.tsx`, `src/app/admin/(dash)/content/connections.tsx`
- Modify: `src/app/admin/(dash)/nav.tsx`

**Interfaces:**
- Consumes: `getConnections` (Task 11), `syncSocialNow`, `disconnectNetwork` (Task 9), `networkLabel` (`src/lib/networks.ts`), `Panel` / `Empty`
- Produces: la ruta `/admin/content` con la tira de conexiones funcionando

- [ ] **Step 1: Agregar la pestaña en `src/app/admin/(dash)/nav.tsx`**

En `TABS`, entre Analítica y Perfiles:

```ts
{ href: '/admin/content', label: 'Contenido' },
```

- [ ] **Step 2: Crear `src/app/admin/(dash)/content/connections.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { disconnectNetwork, syncSocialNow } from '@/app/admin/actions'
import type { ConnectionRow } from '@/lib/posts'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function syncedAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6)
  if (hours < 1) return 'recién'
  if (hours < 24) return RELATIVE.format(-hours, 'hour')
  return RELATIVE.format(-Math.round(hours / 24), 'day')
}

export function Connections({ rows }: { rows: ConnectionRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function sync() {
    startTransition(async () => {
      const result = await syncSocialNow()
      setMessage(result.error ?? 'Listo.')
    })
  }

  return (
    <section className="mb-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.network} className="surface rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold">
                {networkLabel(row.network)}
              </span>
              {row.lastSyncError ? (
                <AlertTriangle className="h-3.5 w-3.5 text-[#d03b3b]" aria-hidden />
              ) : row.connected ? (
                <Check className="h-3.5 w-3.5 text-[#0ca30c]" aria-hidden />
              ) : null}
            </div>

            <p className="mt-1 truncate text-[0.78rem] text-fg-muted">
              {row.handle ?? (row.connected ? 'Conectado' : 'Sin conectar')}
            </p>

            <p className="mt-0.5 font-mono text-[0.68rem] text-fg-faint">
              Sincronizado {syncedAgo(row.lastSyncedAt)}
            </p>

            {row.lastSyncError ? (
              <p className="mt-2 line-clamp-2 text-[0.72rem] text-[#d03b3b]">{row.lastSyncError}</p>
            ) : null}

            <div className="mt-3">
              {!row.usesOAuth ? (
                <span className="font-mono text-[0.68rem] text-fg-faint">
                  {row.connected
                    ? 'Configurado por entorno'
                    : 'Falta YOUTUBE_API_KEY o YOUTUBE_CHANNEL_ID'}
                </span>
              ) : row.connected ? (
                <button
                  type="button"
                  onClick={() => startTransition(() => disconnectNetwork(row.network))}
                  className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
                >
                  Desconectar
                </button>
              ) : (
                <a
                  href={`/api/social/${row.network}/connect`}
                  className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
                >
                  Conectar →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={sync}
          disabled={pending}
          className="surface flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} aria-hidden />
          Sincronizar ahora
        </button>
        {message ? <span className="text-[0.78rem] text-fg-faint">{message}</span> : null}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Crear `src/app/admin/(dash)/content/page.tsx`**

```tsx
import { FilterBar } from '@/components/filter-bar'
import { parseFilters } from '@/lib/filters'
import { getConnections } from '@/lib/posts'
import { getAllProfiles } from '@/lib/profiles'
import { Connections } from './connections'

export const dynamic = 'force-dynamic'

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  parseFilters(params)

  const [profiles, connections] = await Promise.all([getAllProfiles(), getConnections()])

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contenido</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Cada post con lo que hizo en la red y lo que trajo a tu página.
        </p>
      </header>

      <Connections rows={connections} />
      <FilterBar profiles={profiles} />
    </>
  )
}
```

- [ ] **Step 4: Verificar la vista en el navegador**

Run: `npm run dev`, abrir http://localhost:3000/admin/content
Expected: la pestaña *Contenido* aparece en la barra; las tres tarjetas se ven; YouTube dice *Configurado por entorno* si están las variables, y las otras dos ofrecen *Conectar →*.

- [ ] **Step 5: Verificar que Sincronizar ahora funciona**

Apretar *Sincronizar ahora*.
Expected: el ícono gira, y al terminar aparece "Listo." y la fecha de sincronización de YouTube pasa a "recién". Apretarlo de nuevo de inmediato responde "Espera unos minutos antes de volver a sincronizar."

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(dash)/content" "src/app/admin/(dash)/nav.tsx"
git commit -m "Agrega la pestaña Contenido con las tarjetas de conexión"
```

---

### Task 14: La vista — KPIs y tabla de posts

**Files:**
- Create: `src/app/admin/(dash)/content/post-table.tsx`
- Modify: `src/app/admin/(dash)/content/page.tsx`

**Interfaces:**
- Consumes: `getPostRows`, `getPostKpis`, `PostRow` (Task 11); `useSortedRows` (Task 12); `StatTile`, `Panel`, `Empty`, `formatNumber`, `formatPercent`
- Produces: la tabla ordenable

- [ ] **Step 1: Crear `src/app/admin/(dash)/content/post-table.tsx`**

```tsx
'use client'

import Image from 'next/image'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useSortedRows } from '@/components/charts/use-sorted-rows'
import { networkLabel } from '@/lib/networks'
import type { PostRow } from '@/lib/posts'
import { cn, formatNumber } from '@/lib/utils'

const COLUMNS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Coment.' },
  { key: 'visits', label: 'Visitas' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'pull', label: 'Arrastre' },
]

const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

/** `—` and never `0`: no data and no traffic are different answers. */
function num(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

function pct(value: number | null, digits = 1): string {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

export function PostTable({ rows }: { rows: PostRow[] }) {
  const { sorted, sortKey, descending, toggle } = useSortedRows(rows, 'views')

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-fg-faint">Todavía no hay posts sincronizados.</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.8rem] leading-relaxed text-fg-faint">
          Conecta una red arriba y aprieta <span className="text-fg-muted">Sincronizar ahora</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[46rem] border-collapse text-[0.85rem]">
        <thead>
          <tr>
            <th scope="col" className="pb-2 text-left font-normal">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
                Post
              </span>
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sortKey === column.key ? (descending ? 'descending' : 'ascending') : 'none'
                }
                className="pb-2 text-right font-normal"
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors',
                    sortKey === column.key ? 'text-fg' : 'text-fg-faint hover:text-fg-muted',
                  )}
                >
                  {column.label}
                  {sortKey === column.key ? (
                    descending ? (
                      <ArrowDown className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowUp className="h-3 w-3" aria-hidden />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={cn('border-t border-white/[0.06]', row.archived && 'opacity-50')}
            >
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2.5">
                  {row.thumbnailUrl ? (
                    <Image
                      src={row.thumbnailUrl}
                      alt=""
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded-md bg-white/[0.06]" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <a
                      href={row.permalink ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[18rem] truncate text-fg transition-colors hover:text-fg-muted"
                    >
                      {row.caption ?? 'Sin descripción'}
                    </a>
                    <span className="font-mono text-[0.65rem] text-fg-faint">
                      {networkLabel(row.network)} · {DATE.format(new Date(row.publishedAt))}
                      {row.isNew ? ' · nuevo' : ''}
                    </span>
                  </div>
                </div>
              </td>

              <td className="py-2 text-right font-mono tabular-nums">
                {num(row.views)}
                {row.viewsChange !== null && row.viewsChange > 0 && !row.isNew ? (
                  <span className="ml-1 text-[0.68rem] text-fg-faint">
                    +{formatNumber(row.viewsChange)}
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.likes)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.comments)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{num(row.visits)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {num(row.clicks)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums text-fg-muted">
                {pct(row.ctr)}
              </td>
              <td className="py-2 text-right font-mono tabular-nums">{pct(row.pull, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Permitir las miniaturas remotas en `next.config.ts`**

Agregar a la configuración (o crear la clave si no existe):

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '**.cdninstagram.com' },
    { protocol: 'https', hostname: '**.fbcdn.net' },
    { protocol: 'https', hostname: '**.tiktokcdn.com' },
    { protocol: 'https', hostname: 'i.ytimg.com' },
  ],
},
```

Las miniaturas van con `unoptimized` porque las URLs de Instagram y TikTok caducan en horas — optimizarlas y cachearlas produciría imágenes rotas.

- [ ] **Step 3: Conectar todo en `src/app/admin/(dash)/content/page.tsx`**

Reemplazar el cuerpo del componente por:

```tsx
  const params = await searchParams
  const filters = parseFilters(params)
  const includeArchived = params.archivados === '1'

  const [profiles, connections, rows, kpis] = await Promise.all([
    getAllProfiles(),
    getConnections(),
    getPostRows(filters, includeArchived),
    getPostKpis(filters),
  ])

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contenido</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Cada post con lo que hizo en la red y lo que trajo a tu página.
        </p>
      </header>

      <Connections rows={connections} />
      <FilterBar profiles={profiles} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Views" value={formatNumber(kpis.views)} hint="En el período" />
        <StatTile
          label="Interacciones"
          value={formatNumber(kpis.engagement)}
          hint="Likes, comentarios y compartidos"
        />
        <StatTile
          label="Visitas desde posts"
          value={formatNumber(kpis.visits)}
          hint="Atribuidas por etiqueta"
        />
        <StatTile
          label="Arrastre"
          value={kpis.pull === null ? '—' : formatPercent(kpis.pull, 2)}
          hint="De quienes vieron, cuántos llegaron"
        />
      </div>

      <div className="mt-4">
        <Panel
          title="Tus posts"
          hint="Ordena por cualquier columna. Arrastre es visitas sobre views — lo que ninguna de las dos plataformas calcula sola."
          action={
            <Link
              href={includeArchived ? '/admin/content' : '/admin/content?archivados=1'}
              className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
            >
              {includeArchived ? 'Ocultar borrados' : 'Ver borrados'}
            </Link>
          }
        >
          <PostTable rows={rows} />
        </Panel>
      </div>
    </>
  )
```

Y agregar los imports que faltan: `Link` de `next/link`, `Panel` de `@/components/charts/panel`, `StatTile` de `@/components/charts/stat-tile`, `getPostKpis` y `getPostRows` de `@/lib/posts`, `formatNumber` y `formatPercent` de `@/lib/utils`, y `PostTable` de `./post-table`.

- [ ] **Step 4: Verificar la tabla en el navegador**

Run: `npm run dev`, abrir http://localhost:3000/admin/content
Expected: los KPIs muestran los totales de YouTube y la tabla lista los videos con views, likes y comentarios. Las columnas de primera parte están en `—` porque las etiquetas todavía no se pegaron en ninguna parte.

- [ ] **Step 5: Verificar el ordenamiento**

Hacer click en *Views*, *Coment.* y *Arrastre*.
Expected: reordena en cada click y alterna la dirección al repetir. Las filas con `—` quedan al final en ambas direcciones.

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add "src/app/admin/(dash)/content" next.config.ts
git commit -m "Muestra los posts en una tabla ordenable con arrastre y KPIs"
```

---

### Task 15: Copiar el link y editar la etiqueta

**Files:**
- Modify: `src/app/admin/(dash)/content/post-table.tsx`

**Interfaces:**
- Consumes: `updatePostCampaign` (Task 9)
- Produces: la celda de etiqueta editable con botón de copiar

- [ ] **Step 1: Agregar el componente de etiqueta al final de `post-table.tsx`**

```tsx
function CampaignCell({ postId, campaign }: { postId: string; campaign: string }) {
  const [value, setValue] = useState(campaign)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setEditing(false)
    if (value === campaign) return
    startTransition(async () => {
      const result = await updatePostCampaign(postId, value)
      if (result.error) {
        setError(result.error)
        setValue(campaign)
      } else setError(null)
    })
  }

  function copy() {
    // Built here rather than on the server so the URL matches whatever host the
    // dashboard is actually being used on.
    void navigator.clipboard.writeText(`${window.location.origin}/?s=${value}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {editing ? (
        <input
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') {
              setValue(campaign)
              setEditing(false)
            }
          }}
          className="w-36 rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.65rem] text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={pending}
          title="Editar la etiqueta"
          className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.65rem] text-fg-muted transition-colors hover:text-fg"
        >
          ?s={value}
        </button>
      )}

      <button
        type="button"
        onClick={copy}
        title="Copiar el link con la etiqueta"
        className="text-fg-faint transition-colors hover:text-fg"
      >
        {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      </button>

      {error ? <span className="text-[0.65rem] text-[#d03b3b]">{error}</span> : null}
    </div>
  )
}
```

- [ ] **Step 2: Ajustar los imports del archivo**

```tsx
import { useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Check, Copy } from 'lucide-react'
import { updatePostCampaign } from '@/app/admin/actions'
```

- [ ] **Step 3: Usarlo en la celda del post**

Dentro del `<div className="min-w-0">`, después del `<span>` con red y fecha, agregar:

```tsx
<CampaignCell postId={row.id} campaign={row.campaign} />
```

- [ ] **Step 4: Reemplazar los ceros por el empujón cuando falta pegar el link**

En la celda de visitas, cambiar `{num(row.visits)}` por:

```tsx
{row.visits === null ? (
  <span className="text-[0.7rem] text-fg-faint">pega el link</span>
) : (
  formatNumber(row.visits)
)}
```

- [ ] **Step 5: Verificar copiar y editar**

Run: `npm run dev`, abrir `/admin/content`.
Expected: el botón de copiar deja `http://localhost:3000/?s=yt-...` en el portapapeles y muestra un check por un segundo. Click en la etiqueta la vuelve editable; Enter guarda; Escape descarta.

- [ ] **Step 6: Verificar que una etiqueta duplicada se rechaza**

Editar la etiqueta de un post para que coincida con la de otro.
Expected: aparece "Otra pieza de contenido ya usa esa etiqueta." y el valor vuelve al anterior.

- [ ] **Step 7: Verificar el cruce de punta a punta**

Copiar el link de un post, abrirlo en una ventana de incógnito, hacer click en algún link del perfil, volver a `/admin/content` y recargar.
Expected: esa fila pasa de "pega el link" a mostrar 1 visita, 1 click y un porcentaje de arrastre.

- [ ] **Step 8: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 9: Commit**

```bash
git add "src/app/admin/(dash)/content/post-table.tsx"
git commit -m "Permite copiar el link etiquetado y editar la etiqueta en línea"
```

---

### Task 16: Gráfico de views ganadas contra visitas

**Files:**
- Modify: `src/components/charts/traffic-chart.tsx`, `src/app/admin/(dash)/content/page.tsx`

**Interfaces:**
- Consumes: `getPostSeries`, `PostSeriesPoint` (Task 11)
- Produces: `TrafficChart` acepta la prop opcional `series?: [Series, Series]`

- [ ] **Step 1: Generalizar las dos series de `TrafficChart`**

Hoy el componente tiene los nombres *Visitas* y *Clicks* y las claves `visits` y `clicks`
incrustados. Reusarlo tal cual para views contra visitas etiquetaría mal la leyenda, así
que se parametriza sin cambiar su comportamiento actual.

En `src/components/charts/traffic-chart.tsx`, reemplazar el bloque de tipos y la firma:

```tsx
type Series = { key: string; name: string }

/** The dashboard's original pair, kept as the default so existing call sites are unchanged. */
const DEFAULT_SERIES: [Series, Series] = [
  { key: 'visits', name: 'Visitas' },
  { key: 'clicks', name: 'Clicks' },
]

type ChartPoint = { label: string; fullLabel: string } & Record<string, string | number>

type Props = { data: ChartPoint[]; series?: [Series, Series] }
```

Y cambiar `export function TrafficChart({ data }: Props)` por:

```tsx
export function TrafficChart({ data, series = DEFAULT_SERIES }: Props) {
  const empty = data.every((point) => !point[series[0].key] && !point[series[1].key])
```

- [ ] **Step 2: Usar las series parametrizadas en leyenda y áreas**

Reemplazar el `.map` de la leyenda:

```tsx
{series.map((entry, i) => (
  <li key={entry.key} className="flex items-center gap-1.5 text-fg-muted">
    <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden />
    {entry.name}
  </li>
))}
```

Y en cada `<Area>`, cambiar `dataKey="visits" name="Visitas"` por
`dataKey={series[0].key} name={series[0].name}`, y `dataKey="clicks" name="Clicks"` por
`dataKey={series[1].key} name={series[1].name}`.

En `TooltipCard`, cambiar el tipo `payload?: Array<{ …; payload?: SeriesPoint }>` por
`payload?: Array<{ …; payload?: ChartPoint }>` y quitar el import de `SeriesPoint` si
queda sin uso.

- [ ] **Step 3: Verificar que el gráfico de Analítica no cambió**

Run: `npm run dev`, abrir `/admin/analytics`.
Expected: el gráfico *"Tráfico en el tiempo"* se ve exactamente igual que antes — misma leyenda, mismas dos series.

- [ ] **Step 4: Agregar el panel en `/admin/content`**

En `src/app/admin/(dash)/content/page.tsx`, sumar `getPostSeries(filters)` al `Promise.all`
(recibiéndolo como `series`) y agregar el panel después del de la tabla:

```tsx
<Panel
  title="Views ganadas por día"
  hint="Cuánto creció el alcance contra cuánta gente llegó efectivamente a tu página"
>
  <TrafficChart
    data={series}
    series={[
      { key: 'views', name: 'Views ganadas' },
      { key: 'visits', name: 'Visitas' },
    ]}
  />
</Panel>
```

Agregar los imports de `TrafficChart` y `getPostSeries`.

- [ ] **Step 5: Verificar el gráfico nuevo**

Run: `npm run dev`, abrir `/admin/content`.
Expected: el gráfico muestra dos series con la leyenda *Views ganadas* y *Visitas*. Con un solo día de snapshots la serie de views va en cero — el crecimiento necesita dos lecturas, y eso es correcto, no un bug.

- [ ] **Step 6: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 7: Commit**

```bash
git add src/components/charts/traffic-chart.tsx "src/app/admin/(dash)/content/page.tsx"
git commit -m "Grafica las views ganadas por día contra las visitas que trajeron"
```

---

### Task 17: Coherencia con la pestaña Analítica

**Files:**
- Modify: `src/components/charts/campaign-table.tsx`, `src/app/admin/(dash)/analytics/page.tsx`

**Interfaces:**
- Consumes: `getCampaignPosts`, `CampaignPost` (Task 11)
- Produces: `CampaignTable` acepta la prop opcional `posts?: Record<string, CampaignPost>`

- [ ] **Step 1: Aceptar la prop en `CampaignTable`**

Cambiar la firma:

```tsx
export function CampaignTable({
  rows,
  posts = {},
}: {
  rows: CampaignRow[]
  posts?: Record<string, CampaignPost>
})
```

Agregar `import type { CampaignPost } from '@/lib/posts'`.

- [ ] **Step 2: Mostrar el caption cuando la etiqueta es un post**

Reemplazar el `<span className="font-mono text-[0.8rem]">{row.campaign}</span>` por:

```tsx
{posts[row.campaign] ? (
  <span className="flex items-center gap-2">
    {posts[row.campaign]!.thumbnailUrl ? (
      <Image
        src={posts[row.campaign]!.thumbnailUrl!}
        alt=""
        width={20}
        height={20}
        unoptimized
        className="h-5 w-5 shrink-0 rounded object-cover"
      />
    ) : null}
    <span className="truncate text-[0.8rem]">
      {posts[row.campaign]!.caption ?? row.campaign}
    </span>
  </span>
) : (
  <span className="font-mono text-[0.8rem]">{row.campaign}</span>
)}
```

Agregar `import Image from 'next/image'`.

- [ ] **Step 3: Pasar los posts y el enlace desde la página de analítica**

En `src/app/admin/(dash)/analytics/page.tsx`, después del `Promise.all` que ya calcula `campaigns`:

```tsx
const campaignPosts = await getCampaignPosts(campaigns.map((c) => c.campaign))
```

Y en el `<Panel>` de *"Qué contenido te trae gente"*, agregar la acción y la prop:

```tsx
<Panel
  title="Qué contenido te trae gente"
  hint="Cada etiqueta ?s= es una pieza de contenido. Ordena por CTR para ver cuál convierte."
  action={
    <Link
      href="/admin/content"
      className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
    >
      Ver por post →
    </Link>
  }
>
  <CampaignTable rows={campaigns} posts={Object.fromEntries(campaignPosts)} />
</Panel>
```

Agregar `import Link from 'next/link'` y `import { getCampaignPosts } from '@/lib/posts'`.

- [ ] **Step 4: Verificar en el navegador**

Run: `npm run dev`, abrir `/admin/analytics`.
Expected: las etiquetas que corresponden a un post sincronizado muestran miniatura y título; las que no, siguen mostrando el string en monoespaciado. Arriba a la derecha del panel aparece *Ver por post →* y lleva a `/admin/content`.

- [ ] **Step 5: Verificar lint y tipos**

Run: `npm run lint && npm run typecheck`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/campaign-table.tsx "src/app/admin/(dash)/analytics/page.tsx"
git commit -m "Muestra el post detrás de cada etiqueta en la tabla de contenido"
```

---

### Task 18: Documentación y limpieza

**Files:**
- Modify: `README.md`
- Delete: `scripts/sync-once.ts`

- [ ] **Step 1: Borrar el script de humo**

```bash
git rm scripts/sync-once.ts
```

Cumplió su función en la Task 8; la sincronización ahora se dispara por cron o por botón.

- [ ] **Step 1b: Verificar que el archivado se comporta**

Con `db:studio`, poner `archived_at` a mano en un post. Recargar `/admin/content`.
Expected: la fila desaparece; el enlace *Ver borrados* la trae de vuelta en gris.

- [ ] **Step 2: Agregar la sección al `README.md`**

Después de la sección de despliegue, antes de la licencia:

````markdown
## Analítica de posts (opcional)

El panel puede traer las métricas de tus posts desde Instagram, TikTok y YouTube y
cruzarlas con el tráfico que cada uno te trajo. La columna que importa es **arrastre**:
de cada mil personas que vieron el post, cuántas llegaron efectivamente a tu página.

Sin configurar nada, la pestaña *Contenido* aparece vacía y el resto del sitio funciona
igual. Cada red se activa por separado.

### YouTube — sin trámite

En [Google Cloud Console](https://console.cloud.google.com), crea un proyecto, habilita
**YouTube Data API v3** y genera una API key. El channel id sale de
[youtube.com/account_advanced](https://www.youtube.com/account_advanced).

```
YOUTUBE_API_KEY=AIza...
YOUTUBE_CHANNEL_ID=UC...
```

### Instagram — cuenta profesional

Necesitas una cuenta Business o Creator. No hace falta ligarla a una página de Facebook.

En [developers.facebook.com](https://developers.facebook.com), crea una app, agrega el
producto **Instagram**, y en *Business Login* configura como redirect URI:

```
https://TU-DOMINIO/api/social/instagram/callback
```

Copia el app id y el secret. Mientras la app esté en **modo desarrollo** y tú seas su
dueño, no necesitas App Review.

```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

### TikTok

En [developers.tiktok.com](https://developers.tiktok.com), registra una app, agrega el
producto **Login Kit** con el scope `video.list`, y usa como redirect URI:

```
https://TU-DOMINIO/api/social/tiktok/callback
```

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

### Conectar y sincronizar

Con las variables puestas y un redeploy hecho, entra a `/admin/content` y aprieta
*Conectar* en cada tarjeta. El `vercel.json` del repo declara una corrida diaria a las
9:00 UTC; Vercel inyecta `CRON_SECRET` solo. También puedes apretar *Sincronizar ahora*
cuando quieras.

Después de sincronizar, cada post trae su etiqueta `?s=` lista. Copia el link de la fila,
pégalo en el post, y de ahí en adelante el cruce es automático.
````

- [ ] **Step 3: Correr la suite completa**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: todo pasa, incluida la compilación de producción.

- [ ] **Step 4: Commit**

```bash
git add README.md scripts/sync-once.ts
git commit -m "Documenta cómo conectar cada red para la analítica de posts"
```

---

## Verificación final

Contra los criterios de aceptación del spec:

1. **Conectar las tres redes deja las tarjetas en verde** — Tasks 10, 13. Instagram y TikTok requieren que hayas creado las apps en sus paneles.
2. **Sincronizar dos veces no duplica filas** — Task 8, Step 7.
3. **La tabla ordena por las siete columnas** — Task 14, Step 5.
4. **Pegar el link hace aparecer visitas y arrastre** — Task 15, Step 7.
5. **Desconectar no borra posts ni métricas** — `disconnectNetwork` borra solo de `social_accounts` (Task 9). Verificar a mano: desconectar y confirmar en `db:studio` que `social_posts` sigue poblada.
6. **Sin variables de entorno el sitio funciona igual** — Task 18, Step 3. Verificar además moviendo temporalmente las variables fuera de `.env.local` y corriendo `npm run build`.
7. **`npm run lint`, `npm run typecheck` y `npm test` pasan** — Task 18, Step 3.
