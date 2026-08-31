# Conector de Facebook — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar la página de Facebook del dueño por OAuth y que el sync nocturno traiga sus publicaciones con métricas por post, con el mismo contrato `Connector` de las tres redes existentes.

**Architecture:** Un conector nuevo `src/lib/social/facebook.ts` (espejo de `instagram.ts`: helpers puros exportados + objeto `Connector`), registrado en `CONNECTORS` y `SOCIAL_NETWORKS`. El OAuth reusa la app de Meta de Instagram y las rutas genéricas `/api/social/[network]/connect|callback`; se guarda el **page access token** (no vence → `expiresAt` null). La UI no cambia salvo derivar la lista de redes del esquema y ajustar la grilla.

**Tech Stack:** Next.js App Router (route handlers con `params` como Promise), Drizzle + Neon, Vitest, Graph API v23.0.

**Spec:** `docs/superpowers/specs/2026-08-28-conector-facebook-design.md`

## Global Constraints

- Mensajes de error que llegan al navegador: frases fijas en español escritas por nosotros, **nunca** texto upstream de Meta. Nombres/usernames de Meta solo al log del servidor.
- Tokens siempre cifrados con `encryptToken`/`decryptToken` de `src/lib/social/crypto.ts`.
- Métrica que la red no reporta = `null`, nunca `0`. `saves` es siempre null en Facebook.
- `expiresAt` null para el token de página — no inventar fechas de vencimiento (lección del commit `dc49b91`).
- Tope compartido `MAX_POSTS_PER_SYNC` (200) importado de `./connector`; `windowWasCapped` honesto: tope alcanzado **o** cursor todavía en mano.
- Comentarios en el código solo para restricciones que el código no puede mostrar, siguiendo la densidad y el tono del archivo vecino (mira `instagram.ts`).
- Commits en español, presente, estilo del repo (p. ej. «Elige la página…»), con el footer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01RhwV6f39mgk5dRpv4UDoPH`
- Comandos de verificación: `npx vitest run <archivo>` por task; al final `npm test`, `npm run typecheck`, `npm run lint`.

---

### Task 1: Elección de página — `pickFacebookPage`

**Files:**
- Create: `src/lib/social/facebook.ts`
- Test: `src/lib/social/facebook.test.ts`

**Interfaces:**
- Consumes: nada (helpers puros).
- Produces (usados por Task 7):
  - `type FacebookPageEntry = { id?: string; name?: string; access_token?: string }`
  - `type FacebookPagesList = { data?: FacebookPageEntry[] }`
  - `type FacebookPage = { id: string; name: string | null; accessToken: string | null }`
  - `class FacebookPageError extends Error { candidates: FacebookPage[] }`
  - `pickFacebookPage(pages: FacebookPagesList, pinnedId?: string): FacebookPage`
  - Constantes `NO_FACEBOOK_PAGE`, `AMBIGUOUS_FACEBOOK_PAGE`, `PINNED_FACEBOOK_PAGE_MISSING`, `pinnedPageMissingMessage(candidates)`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/facebook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_FACEBOOK_PAGE,
  FacebookPageError,
  NO_FACEBOOK_PAGE,
  PINNED_FACEBOOK_PAGE_MISSING,
  pickFacebookPage,
  type FacebookPagesList,
} from './facebook'

describe('pickFacebookPage', () => {
  it('elige la única página administrable', () => {
    const pages: FacebookPagesList = {
      data: [{ id: '61550000000001', name: 'Ribs', access_token: 'PAGE_TOKEN' }],
    }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000001',
      name: 'Ribs',
      accessToken: 'PAGE_TOKEN',
    })
  })

  it('tolera una página sin nombre o sin token, con null y no inventando', () => {
    const pages: FacebookPagesList = { data: [{ id: '61550000000002' }] }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000002',
      name: null,
      accessToken: null,
    })
  })

  it('falla cuando no hay páginas', () => {
    expect(() => pickFacebookPage({ data: [] })).toThrowError(NO_FACEBOOK_PAGE)
    expect(() => pickFacebookPage({})).toThrowError(NO_FACEBOOK_PAGE)
  })

  const varias: FacebookPagesList = {
    data: [
      { id: '61550000000010', name: 'Personal', access_token: 'T10' },
      { id: '61550000000011', name: 'Gimnasio', access_token: 'T11' },
      { id: '61550000000012', name: 'Proyecto', access_token: 'T12' },
    ],
  }

  it('se niega a elegir cuando hay varias candidatas', () => {
    // Nunca la primera: el orden de me/accounts no es una promesa, y conectar otra
    // página archiva el catálogo entero de la anterior.
    expect(() => pickFacebookPage(varias)).toThrowError(AMBIGUOUS_FACEBOOK_PAGE)
  })

  it('con varias candidatas elige la fijada, no la primera', () => {
    expect(pickFacebookPage(varias, '61550000000012')).toEqual({
      id: '61550000000012',
      name: 'Proyecto',
      accessToken: 'T12',
    })
  })

  it('falla si la página fijada no está entre las disponibles', () => {
    expect(() => pickFacebookPage(varias, '61550000000099')).toThrowError(
      PINNED_FACEBOOK_PAGE_MISSING,
    )
  })

  it('con un pin que no calza, nombra los ids encontrados y no los nombres', () => {
    try {
      pickFacebookPage(varias, '61550000000099')
      expect.unreachable('debía lanzar')
    } catch (error) {
      const { message } = error as FacebookPageError
      expect(message).toContain('61550000000010')
      expect(message).toContain('61550000000012')
      expect(message).not.toContain('Gimnasio')
    }
  })

  it('sin ninguna candidata dice que no hay páginas, aunque haya pin', () => {
    expect(() => pickFacebookPage({ data: [] }, '61550000000099')).toThrowError(
      NO_FACEBOOK_PAGE,
    )
  })

  it('deja las candidatas en el error, no en el mensaje', () => {
    // Los nombres vienen de Meta: sirven para el log del servidor, nunca para el
    // texto que se le muestra a nadie.
    try {
      pickFacebookPage(varias)
      expect.unreachable('debía lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(FacebookPageError)
      const pageError = error as FacebookPageError
      expect(pageError.message).toBe(AMBIGUOUS_FACEBOOK_PAGE)
      expect(pageError.candidates.map((c) => c.id)).toEqual([
        '61550000000010',
        '61550000000011',
        '61550000000012',
      ])
    }
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: FAIL — `./facebook` no existe.

- [ ] **Step 3: Implementación mínima**

Crear `src/lib/social/facebook.ts`:

```ts
/** El `me/accounts?fields=id,name,access_token` payload. */
export type FacebookPageEntry = { id?: string; name?: string; access_token?: string }
export type FacebookPagesList = { data?: FacebookPageEntry[] }
export type FacebookPage = { id: string; name: string | null; accessToken: string | null }

/**
 * Why picking the page can fail loudly. `message` is always one of the fixed Spanish
 * sentences below — never upstream text — so the callback can show it as-is. The
 * candidates ride along separately for the server log: page names come from Meta, and
 * upstream text does not belong in anything the browser renders.
 */
export class FacebookPageError extends Error {
  constructor(
    message: string,
    public readonly candidates: FacebookPage[] = [],
  ) {
    super(message)
  }
}

export const NO_FACEBOOK_PAGE = 'Esta cuenta no administra ninguna página de Facebook.'
export const AMBIGUOUS_FACEBOOK_PAGE =
  'Hay varias páginas de Facebook disponibles. Define FACEBOOK_PAGE_ID con el id de la que quieres conectar.'
export const PINNED_FACEBOOK_PAGE_MISSING =
  'FACEBOOK_PAGE_ID no coincide con ninguna de las páginas disponibles.'

/** Ids are numeric and assigned by Meta, so echoing them into the page is safe. */
export function pinnedPageMissingMessage(candidates: FacebookPage[]): string {
  const ids = candidates.map((candidate) => candidate.id).join(', ')
  return `${PINNED_FACEBOOK_PAGE_MISSING} Encontradas: ${ids}.`
}

/**
 * Taking the first page is only safe when there is exactly one: the order Meta lists
 * pages in is not a promise, and silently connecting a different page than last time
 * makes the next sync archive the previous page's whole catalogue (same argument as
 * `pickInstagramAccount`). When the answer is ambiguous this throws instead of
 * guessing, and `pinnedId` (from FACEBOOK_PAGE_ID) is how the owner disambiguates.
 */
export function pickFacebookPage(
  pages: FacebookPagesList,
  pinnedId?: string,
): FacebookPage {
  const candidates: FacebookPage[] = []
  for (const page of pages.data ?? []) {
    if (page.id) {
      candidates.push({
        id: page.id,
        name: page.name ?? null,
        accessToken: page.access_token ?? null,
      })
    }
  }

  if (pinnedId) {
    const pinned = candidates.find((candidate) => candidate.id === pinnedId)
    if (pinned) return pinned
    if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
    throw new FacebookPageError(pinnedPageMissingMessage(candidates), candidates)
  }

  if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
  if (candidates.length === 1) return candidates[0]!
  throw new FacebookPageError(AMBIGUOUS_FACEBOOK_PAGE, candidates)
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/facebook.ts src/lib/social/facebook.test.ts
git commit -m "Elige la página de Facebook con la misma disciplina que Instagram"
```
(con el footer de Global Constraints)

---

### Task 2: Normalización — `normalizeFacebookPost`

**Files:**
- Modify: `src/lib/social/facebook.ts` (agregar al final)
- Create: `src/lib/social/fixtures/facebook-posts.json`
- Test: `src/lib/social/facebook.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `NO_METRICS`, `type FetchedPost`, `type PostMetricValues` de `./connector`.
- Produces (usados por Task 5):
  - `type FacebookPost` (forma cruda de Graph, ver abajo)
  - `type FacebookInsights = { data?: Array<{ name?: string; values?: Array<{ value?: number }> }> }`
  - `normalizeFacebookPost(post: FacebookPost, insights: FacebookInsights): FetchedPost`

- [ ] **Step 1: Crear el fixture**

`src/lib/social/fixtures/facebook-posts.json`:

```json
{
  "videoPost": {
    "id": "61550000000001_1020304050607080",
    "message": "Nueva rutina en el gimnasio 💪 link en la bio",
    "permalink_url": "https://www.facebook.com/61550000000001/posts/1020304050607080",
    "full_picture": "https://scontent.xx.fbcdn.net/v/thumb.jpg",
    "created_time": "2026-08-12T18:22:04+0000",
    "attachments": { "data": [{ "media_type": "video" }] },
    "shares": { "count": 34 },
    "likes": { "summary": { "total_count": 511 } },
    "comments": { "summary": { "total_count": 48 } }
  },
  "videoInsights": {
    "data": [
      { "name": "post_impressions", "values": [{ "value": 12840 }] },
      { "name": "post_impressions_unique", "values": [{ "value": 9310 }] }
    ]
  },
  "statusPost": {
    "id": "61550000000001_1111111111111111",
    "message": null,
    "permalink_url": "https://www.facebook.com/61550000000001/posts/1111111111111111",
    "created_time": "2026-08-01T12:00:00+0000",
    "likes": { "summary": { "total_count": 12 } },
    "comments": { "summary": { "total_count": 0 } }
  },
  "statusInsights": { "data": [] }
}
```

- [ ] **Step 2: Escribir los tests que fallan**

Agregar a `src/lib/social/facebook.test.ts` (sumar los imports nuevos al bloque existente de `./facebook`, y el import del fixture arriba del todo):

```ts
import fixture from './fixtures/facebook-posts.json'
import {
  normalizeFacebookPost,
  type FacebookInsights,
  type FacebookPost,
} from './facebook'

const videoPost = fixture.videoPost as FacebookPost
const videoInsights = fixture.videoInsights as FacebookInsights
const statusPost = fixture.statusPost as FacebookPost
const statusInsights = fixture.statusInsights as FacebookInsights

describe('normalizeFacebookPost', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeFacebookPost(videoPost, videoInsights)
    expect(post.externalId).toBe('61550000000001_1020304050607080')
    expect(post.permalink).toBe(
      'https://www.facebook.com/61550000000001/posts/1020304050607080',
    )
    expect(post.caption).toBe('Nueva rutina en el gimnasio 💪 link en la bio')
    expect(post.thumbnailUrl).toBe('https://scontent.xx.fbcdn.net/v/thumb.jpg')
    expect(post.mediaType).toBe('video')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T18:22:04.000Z')
  })

  it('une insights con los conteos que vienen en el post mismo', () => {
    const post = normalizeFacebookPost(videoPost, videoInsights)
    expect(post.metrics).toEqual({
      views: 12840,
      reach: 9310,
      likes: 511,
      comments: 48,
      shares: 34,
      saves: null,
    })
  })

  it('deja en null lo que no vino: shares ausente no es cero', () => {
    const post = normalizeFacebookPost(statusPost, statusInsights)
    expect(post.metrics.shares).toBeNull()
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.reach).toBeNull()
    // Un conteo que sí vino en cero es un cero real, no un null.
    expect(post.metrics.comments).toBe(0)
    expect(post.metrics.likes).toBe(12)
  })

  it('saves es siempre null: Facebook no lo reporta', () => {
    expect(normalizeFacebookPost(videoPost, videoInsights).metrics.saves).toBeNull()
  })

  it('tolera un post sin message ni full_picture', () => {
    const post = normalizeFacebookPost(statusPost, statusInsights)
    expect(post.caption).toBeNull()
    expect(post.thumbnailUrl).toBeNull()
  })

  it('mapea el media_type del attachment al vocabulario del catálogo', () => {
    const base = { id: 'x', created_time: '2026-08-01T12:00:00+0000' }
    const withType = (media_type: string): FacebookPost => ({
      ...base,
      attachments: { data: [{ media_type }] },
    })
    expect(normalizeFacebookPost(withType('video'), {}).mediaType).toBe('video')
    expect(normalizeFacebookPost(withType('photo'), {}).mediaType).toBe('image')
    expect(normalizeFacebookPost(withType('album'), {}).mediaType).toBe('carousel')
    expect(normalizeFacebookPost(withType('share'), {}).mediaType).toBe('link')
    // Sin attachment (un estado de texto) también cae en link.
    expect(normalizeFacebookPost(statusPost, {}).mediaType).toBe('link')
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: FAIL — `normalizeFacebookPost` no existe.

- [ ] **Step 4: Implementación**

Agregar a `src/lib/social/facebook.ts` (y el import arriba):

```ts
import {
  NO_METRICS,
  type FetchedPost,
  type PostMetricValues,
} from './connector'
```

```ts
export type FacebookPost = {
  id: string
  message?: string | null
  permalink_url?: string
  full_picture?: string
  created_time?: string
  attachments?: { data?: Array<{ media_type?: string }> }
  shares?: { count?: number }
  likes?: { summary?: { total_count?: number } }
  comments?: { summary?: { total_count?: number } }
}

export type FacebookInsights = {
  data?: Array<{ name?: string; values?: Array<{ value?: number }> }>
}

const METRIC_NAMES: Record<string, keyof PostMetricValues> = {
  post_impressions: 'views',
  post_impressions_unique: 'reach',
}

function mediaTypeOf(post: FacebookPost): string {
  const attached = post.attachments?.data?.[0]?.media_type
  if (attached === 'video') return 'video'
  if (attached === 'photo') return 'image'
  if (attached === 'album') return 'carousel'
  return 'link'
}

export function normalizeFacebookPost(
  post: FacebookPost,
  insights: FacebookInsights,
): FetchedPost {
  const metrics: PostMetricValues = { ...NO_METRICS }
  for (const entry of insights.data ?? []) {
    const key = entry.name ? METRIC_NAMES[entry.name] : undefined
    const value = entry.values?.[0]?.value
    if (key && typeof value === 'number') metrics[key] = value
  }

  // Unlike Instagram, the engagement counts ride on the post object itself, not on
  // insights. `typeof` guards keep an absent count as null — absent is not zero.
  const likes = post.likes?.summary?.total_count
  const comments = post.comments?.summary?.total_count
  const shares = post.shares?.count
  if (typeof likes === 'number') metrics.likes = likes
  if (typeof comments === 'number') metrics.comments = comments
  if (typeof shares === 'number') metrics.shares = shares

  return {
    externalId: post.id,
    permalink: post.permalink_url ?? null,
    caption: post.message ?? null,
    thumbnailUrl: post.full_picture ?? null,
    mediaType: mediaTypeOf(post),
    publishedAt: new Date(post.created_time ?? 0),
    metrics,
  }
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/facebook.ts src/lib/social/facebook.test.ts src/lib/social/fixtures/facebook-posts.json
git commit -m "Normaliza publicaciones de Facebook al contrato del conector"
```

---

### Task 3: Errores HTTP — `FacebookHttpError` e `isPostWithoutInsights`

**Files:**
- Modify: `src/lib/social/facebook.ts`
- Test: `src/lib/social/facebook.test.ts` (agregar describe)

**Interfaces:**
- Produces (usados por Task 5):
  - `class FacebookHttpError extends Error { status: number }`
  - `isPostWithoutInsights(error: unknown): boolean`
  - `getJson(url: string): Promise<Record<string, unknown>>` (no exportado; interno del archivo)

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `facebook.test.ts` (sumar `FacebookHttpError, isPostWithoutInsights` al import de `./facebook`):

```ts
describe('isPostWithoutInsights', () => {
  it('tolera un 404: la publicación no tiene estadísticas', () => {
    expect(isPostWithoutInsights(new FacebookHttpError(404, 'Facebook 404: ...'))).toBe(true)
  })

  it('no tolera un 400, un 429 ni un 5xx, que son sistémicos', () => {
    expect(isPostWithoutInsights(new FacebookHttpError(400, 'Facebook 400: ...'))).toBe(false)
    expect(isPostWithoutInsights(new FacebookHttpError(429, 'rate limit'))).toBe(false)
    expect(isPostWithoutInsights(new FacebookHttpError(500, 'boom'))).toBe(false)
  })

  it('no tolera un error que no venga de una respuesta HTTP', () => {
    expect(isPostWithoutInsights(new Error('fetch failed'))).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: FAIL — `FacebookHttpError` no existe.

- [ ] **Step 3: Implementación**

Agregar a `facebook.ts`:

```ts
// Carries the HTTP status alongside the message so callers can tell a 404 (a normal,
// per-post answer for insights) apart from anything systemic.
export class FacebookHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Whether Graph is telling us this one post has no insights, rather than that
 * something is wrong with the run. Anything that is not a 404 — expired token, rate
 * limit, 5xx — is systemic: swallowing it would silently write NO_METRICS as if it
 * were real data for every remaining post.
 */
export function isPostWithoutInsights(error: unknown): boolean {
  return error instanceof FacebookHttpError && error.status === 404
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new FacebookHttpError(
      response.status,
      `Facebook ${response.status}: ${body.slice(0, 200)}`,
    )
  }
  return response.json()
}
```

Nota: `getJson` queda sin usar hasta Task 5; si ESLint reclama por símbolo sin uso,
moverlo a Task 5 en vez de suprimir la regla.

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/facebook.ts src/lib/social/facebook.test.ts
git commit -m "Distingue el post sin insights del fallo sistémico en Facebook"
```

---

### Task 4: Paginación — `collectPublishedPosts`

**Files:**
- Modify: `src/lib/social/facebook.ts`
- Test: `src/lib/social/facebook.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `MAX_POSTS_PER_SYNC` de `./connector` (sumar al import existente).
- Produces (usado por Task 5):
  - `collectPublishedPosts(firstUrl: string, fetchJson: (url: string) => Promise<Record<string, unknown>>): Promise<{ posts: FacebookPost[]; windowWasCapped: boolean }>`

El `fetchJson` inyectado es lo que hace esto testeable sin tocar `fetch` global —
los tests del repo solo cubren helpers puros, y este lo sigue siendo módulo el callback.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `facebook.test.ts` (sumar `collectPublishedPosts` al import):

```ts
describe('collectPublishedPosts', () => {
  /** Sirve páginas de `count` posts; `next` dice si la página entrega cursor. */
  function serving(pages: Array<{ count: number; next: boolean }>) {
    let served = 0
    let calls = 0
    const fetchJson = async () => {
      const page = pages[calls] ?? { count: 0, next: true }
      calls++
      const data = Array.from({ length: page.count }, () => ({ id: String(served++) }))
      return { data, paging: page.next ? { next: `https://graph.test/p${calls}` } : {} }
    }
    return { fetchJson, callCount: () => calls }
  }

  it('junta todas las páginas hasta que se acaba el cursor', async () => {
    const { fetchJson, callCount } = serving([
      { count: 2, next: true },
      { count: 3, next: false },
    ])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts.map((p) => p.id)).toEqual(['0', '1', '2', '3', '4'])
    expect(windowWasCapped).toBe(false)
    expect(callCount()).toBe(2)
  })

  it('corta en MAX_POSTS_PER_SYNC y lo declara como ventana', async () => {
    const { fetchJson, callCount } = serving(
      Array.from({ length: 10 }, () => ({ count: 50, next: true })),
    )
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(200)
    expect(windowWasCapped).toBe(true)
    expect(callCount()).toBe(4)
  })

  it('un cursor que no trae datos no lo hace loopear para siempre', async () => {
    // Graph puede devolver data: [] con paging.next presente; sin tope de páginas el
    // while nunca llenaría el array y nunca saldría.
    const { fetchJson, callCount } = serving([])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(0)
    expect(callCount()).toBe(50)
    // Con el cursor todavía en mano, lo honesto es declarar la ventana recortada.
    expect(windowWasCapped).toBe(true)
  })

  it('exactamente 200 sin cursor pendiente también es ventana', async () => {
    // Los items de la última página se descartan cuando el array se llena, diga lo
    // que diga el cursor — mismo razonamiento que el conector de Instagram.
    const { fetchJson } = serving([
      { count: 100, next: true },
      { count: 100, next: false },
    ])
    const { posts, windowWasCapped } = await collectPublishedPosts('https://graph.test/p0', fetchJson)
    expect(posts).toHaveLength(200)
    expect(windowWasCapped).toBe(true)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: FAIL — `collectPublishedPosts` no existe.

- [ ] **Step 3: Implementación**

En `facebook.ts`, sumar `MAX_POSTS_PER_SYNC` al import de `./connector` y agregar:

```ts
// Bounds page fetches independently of how many items a page actually yields: Graph
// can return an empty `data: []` while still handing back a `paging.next` cursor,
// which would otherwise starve the length check below and loop forever.
const MAX_POST_PAGES = 50

export async function collectPublishedPosts(
  firstUrl: string,
  fetchJson: (url: string) => Promise<Record<string, unknown>>,
): Promise<{ posts: FacebookPost[]; windowWasCapped: boolean }> {
  const posts: FacebookPost[] = []
  let next = firstUrl
  let pagesFetched = 0

  while (next && posts.length < MAX_POSTS_PER_SYNC && pagesFetched < MAX_POST_PAGES) {
    const page = (await fetchJson(next)) as {
      data?: FacebookPost[]
      paging?: { next?: string }
    }
    pagesFetched++

    for (const item of page.data ?? []) {
      if (posts.length >= MAX_POSTS_PER_SYNC) break
      posts.push(item)
    }
    next = page.paging?.next ?? ''
  }

  // A cursor still in hand means the loop stopped at a ceiling, not at the end of the
  // page's posts. Hitting exactly MAX_POSTS_PER_SYNC counts too: items from the last
  // page get dropped once the array is full, whatever the cursor says.
  return { posts, windowWasCapped: posts.length >= MAX_POSTS_PER_SYNC || next !== '' }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/facebook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/facebook.ts src/lib/social/facebook.test.ts
git commit -m "Pagina published_posts con tope y ventana honesta"
```

---

### Task 5: El conector y su registro

**Files:**
- Modify: `src/lib/social/facebook.ts` (el objeto `facebookConnector`)
- Modify: `src/lib/social/index.ts:1-7`
- Modify: `src/db/schema.ts:132`
- Modify: `src/lib/social/campaign.ts:1-5`
- Test: `src/lib/social/campaign.test.ts` (agregar caso)

**Interfaces:**
- Consumes: todo lo de Tasks 1–4; `decryptToken` de `./crypto`; `type Connector`, `type FetchedBatch` de `./connector`; `type SocialAccount` de `@/db`.
- Produces: `facebookConnector: Connector` con `network: 'facebook'`; `'facebook'` en `SOCIAL_NETWORKS`; prefijo `fb` en `campaignTagFor`.

- [ ] **Step 1: Test del prefijo de campaña (falla)**

Agregar a `src/lib/social/campaign.test.ts`:

```ts
describe('campaignTagFor facebook', () => {
  it('acuña la etiqueta con el prefijo fb', () => {
    expect(campaignTagFor('facebook', '61550000000001_1020304050607080')).toBe(
      'fb-61550000000001_1020304050607080',
    )
  })
})
```

(Si el archivo importa con nombres distintos, sumar `campaignTagFor` al import existente de `./campaign`.)

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/social/campaign.test.ts`
Expected: FAIL — sin el prefijo, la etiqueta sale `facebook-…`.

- [ ] **Step 3: Implementación**

En `src/lib/social/campaign.ts`, el mapa de prefijos gana una línea:

```ts
const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  facebook: 'fb',
}
```

En `src/db/schema.ts` línea 132:

```ts
export const SOCIAL_NETWORKS = ['instagram', 'tiktok', 'youtube', 'facebook'] as const
```

En `src/lib/social/facebook.ts`, sumar imports y el conector:

```ts
import type { SocialAccount } from '@/db'
import { decryptToken } from './crypto'
// (sumar Connector y FetchedBatch al import de './connector')
```

```ts
const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_SIZE = 50
const INSIGHTS_CHUNK_SIZE = 5

export const facebookConnector: Connector = {
  network: 'facebook',

  /**
   * A page access token derived from a long-lived user token does not expire, so there
   * is nothing to refresh. If Meta invalidates it (password change, permissions
   * revoked), the Graph 190 lands in `lastSyncError`, the card turns red, and the
   * recovery path is reconnecting — same as every OAuth network here.
   */
  async ensureCredential(account: SocialAccount): Promise<string | null> {
    if (!account.accessToken) return null
    return decryptToken(account.accessToken)
  },

  async fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedBatch> {
    const pageId = account.externalId
    if (!token || !pageId) return { posts: [], windowWasCapped: false }

    const fields =
      'id,message,permalink_url,full_picture,attachments{media_type},created_time,shares,likes.summary(true),comments.summary(true)'
    const first = `${GRAPH}/${pageId}/published_posts?fields=${fields}&limit=${PAGE_SIZE}&access_token=${token}`
    const { posts: fetched, windowWasCapped } = await collectPublishedPosts(first, getJson)

    const metrics = 'post_impressions,post_impressions_unique'
    const posts: FetchedPost[] = []
    // Sequential chunks rather than one Promise.all over every post: up to 200
    // concurrent requests risks a 429, and a systemic insights failure aborts the whole
    // sync, so keeping concurrency low keeps that risk low. Wall-clock doesn't matter —
    // this runs once a day from a cron.
    for (let i = 0; i < fetched.length; i += INSIGHTS_CHUNK_SIZE) {
      const chunk = fetched.slice(i, i + INSIGHTS_CHUNK_SIZE)
      const chunkPosts = await Promise.all(
        chunk.map(async (item) => {
          let insights: FacebookInsights = {}
          try {
            insights = (await getJson(
              `${GRAPH}/${item.id}/insights?metric=${metrics}&access_token=${token}`,
            )) as FacebookInsights
          } catch (error) {
            if (isPostWithoutInsights(error)) {
              insights = {}
            } else {
              throw error
            }
          }
          return normalizeFacebookPost(item, insights)
        }),
      )
      posts.push(...chunkPosts)
    }

    return { posts, windowWasCapped }
  },
}
```

En `src/lib/social/index.ts`:

```ts
import type { Connector } from './connector'
import { facebookConnector } from './facebook'
import { instagramConnector } from './instagram'
import { tiktokConnector } from './tiktok'
import { youtubeConnector } from './youtube'

/** Adding a network is a file plus a line here. Nothing else knows they differ. */
export const CONNECTORS: Connector[] = [
  instagramConnector,
  tiktokConnector,
  youtubeConnector,
  facebookConnector,
]
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/social/` y `npm run typecheck`
Expected: PASS ambos. `syncAll` recorre `CONNECTORS`, así que Facebook entra al sync sin tocar `sync.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/facebook.ts src/lib/social/index.ts src/db/schema.ts src/lib/social/campaign.ts src/lib/social/campaign.test.ts
git commit -m "Registra el conector de Facebook en catálogo, esquema y etiquetas"
```

---

### Task 6: Ruta de conexión OAuth

**Files:**
- Modify: `src/app/api/social/[network]/connect/route.ts`

**Interfaces:**
- Produces: `GET /api/social/facebook/connect` redirige al diálogo de Facebook con los scopes de páginas.

Sin test unitario: el repo no testea route handlers y esta ruta no tiene lógica propia — la desambiguación vive en `pickFacebookPage`, ya testeada. Verificación por typecheck y lint.

- [ ] **Step 1: Implementación**

En `SCOPES`, agregar la entrada (entre `instagram` y `tiktok`):

```ts
  // Facebook rides the same Meta app as Instagram. `read_insights` is the only scope
  // Instagram's entry doesn't already request; the pages scopes repeat because each
  // network's authorization is its own consent screen.
  facebook: 'pages_show_list,pages_read_engagement,read_insights,business_management',
```

El branch de Instagram pasa a cubrir las dos redes de Meta — mismo diálogo, misma app:

```ts
  if (network === 'instagram' || network === 'facebook') {
    const appId = env('INSTAGRAM_APP_ID')
    if (!appId) return new NextResponse('Falta INSTAGRAM_APP_ID', { status: 400 })

    const url = new URL('https://www.facebook.com/v23.0/dialog/oauth')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return NextResponse.redirect(url)
  }
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/social/[network]/connect/route.ts"
git commit -m "Ofrece el flujo de conexión OAuth para Facebook"
```

---

### Task 7: Callback — canjear y guardar el token de página

**Files:**
- Modify: `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Consumes: `pickFacebookPage`, `FacebookPageError`, `type FacebookPagesList` de `@/lib/social/facebook` (Task 1).
- Produces: `facebookCredential(code, redirectUri): Promise<Credential>` con `expiresAt: null` y `accessToken` = page token; helper compartido `exchangeMetaCode(code, redirectUri, label): Promise<{ accessToken: string; expiresIn?: number }>` que `instagramCredential` también pasa a usar.

Sin test unitario nuevo: la ruta no se testea en el repo y su única lógica con ramas — elegir página — ya está testeada en Task 1. La extracción de `exchangeMetaCode` es refactor puro de `instagramCredential` (mismas URLs, mismos mensajes) verificado por typecheck.

- [ ] **Step 1: Extraer el canje compartido**

En `callback/route.ts`, encima de `instagramCredential`, agregar:

```ts
/**
 * The code → short token → long-lived token dance both Meta networks share. `label`
 * only flavors the fixed error sentences; the credentials are the same Meta app.
 */
async function exchangeMetaCode(
  code: string,
  redirectUri: string,
  label: 'Instagram' | 'Facebook',
): Promise<{ accessToken: string; expiresIn?: number }> {
  const appId = env('INSTAGRAM_APP_ID')
  const appSecret = env('INSTAGRAM_APP_SECRET')
  if (!appId || !appSecret) {
    throw new OAuthError('Faltan las credenciales de la app de Meta (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).')
  }

  const shortUrl = new URL(`${GRAPH}/oauth/access_token`)
  shortUrl.searchParams.set('client_id', appId)
  shortUrl.searchParams.set('client_secret', appSecret)
  shortUrl.searchParams.set('redirect_uri', redirectUri)
  shortUrl.searchParams.set('code', code)
  const short = await fetch(shortUrl)
  if (!short.ok) throw new OAuthError(`${label} rechazó el código: ${short.status}`)
  const shortData = (await short.json()) as { access_token?: string }
  if (!shortData.access_token) throw new OAuthError(`${label} no devolvió token`)

  // The code exchange returns a token good for a couple of hours; handing it straight
  // back through fb_exchange_token is what turns it into the ~60-day one worth keeping.
  const longUrl = new URL(`${GRAPH}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', appId)
  longUrl.searchParams.set('client_secret', appSecret)
  longUrl.searchParams.set('fb_exchange_token', shortData.access_token)
  const long = await fetch(longUrl)
  if (!long.ok) throw new OAuthError(`${label} no canjeó el token largo: ${long.status}`)
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }
  // A 200 without a token would store a credential good for about an hour stamped as
  // good for sixty days (see instagramCredential's history) — fail loudly instead.
  if (!longData.access_token) throw new OAuthError(`${label} no devolvió el token largo`)

  return { accessToken: longData.access_token, expiresIn: longData.expires_in }
}
```

`instagramCredential` pierde su bloque de canje (desde la lectura de `appId` hasta `const token = longData.access_token` inclusive, con sus comentarios) y arranca así:

```ts
async function instagramCredential(code: string, redirectUri: string): Promise<Credential> {
  const exchanged = await exchangeMetaCode(code, redirectUri, 'Instagram')
  const token = exchanged.accessToken
```

y su `return` usa `expiresAt: instagramTokenExpiry(exchanged.expiresIn)` en vez de `longData.expires_in`. El resto (descubrimiento de páginas, `pickInstagramAccount`, manejo de `InstagramAccountError`) queda idéntico.

- [ ] **Step 2: Agregar `facebookCredential`**

Debajo de `instagramCredential` (imports nuevos: `FacebookPageError, pickFacebookPage, type FacebookPagesList` desde `@/lib/social/facebook`):

```ts
async function facebookCredential(code: string, redirectUri: string): Promise<Credential> {
  const exchanged = await exchangeMetaCode(code, redirectUri, 'Facebook')

  const pages = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${exchanged.accessToken}`,
  )
  if (!pages.ok) {
    throw new OAuthError(`No se pudieron leer las páginas de Facebook: ${pages.status}`)
  }

  let page
  try {
    page = pickFacebookPage((await pages.json()) as FacebookPagesList, env('FACEBOOK_PAGE_ID'))
  } catch (error) {
    if (!(error instanceof FacebookPageError)) throw error
    // The message is one of the connector's own fixed sentences, so it is safe to show.
    // The candidates carry page names Meta sent us; those only go to the server log.
    if (error.candidates.length > 0) {
      console.error('Páginas de Facebook disponibles:', error.candidates)
    }
    throw new OAuthError(error.message)
  }

  if (!page.accessToken) {
    throw new OAuthError('Facebook no entregó el token de la página. Inténtalo de nuevo.')
  }

  return {
    // The page token, not the user token: it is what published_posts and insights are
    // asked with, and derived from a long-lived user token it does not expire — hence
    // expiresAt null rather than an invented date.
    accessToken: page.accessToken,
    refreshToken: null,
    expiresAt: null,
    externalId: page.id,
    handle: page.name,
  }
}
```

`fetchCredential` gana su rama (y su comentario deja de enumerar dos redes):

```ts
async function fetchCredential(network: string, code: string, redirectUri: string): Promise<Credential> {
  if (network === 'instagram') return instagramCredential(code, redirectUri)
  if (network === 'facebook') return facebookCredential(code, redirectUri)
  if (network === 'tiktok') return tiktokCredential(code, redirectUri)
  throw new OAuthError('Esa red no usa OAuth.')
}
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — el refactor de `instagramCredential` no toca ningún test existente.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/social/[network]/callback/route.ts"
git commit -m "Canjea y guarda el token de página de Facebook en el callback"
```

---

### Task 8: La card en la UI y verificación final

**Files:**
- Modify: `src/lib/posts.ts:260-266`
- Modify: `src/app/admin/(dash)/content/connections.tsx:44`

**Interfaces:**
- Consumes: `SOCIAL_NETWORKS` de `@/db` (re-exportado desde el esquema, Task 5).
- Produces: la card de Facebook con «Conectar →» en `/admin/content`.

Sin test unitario: `getConnections` habla con la base y el repo no la testea; el cambio es sustituir una lista duplicada por la del esquema.

- [ ] **Step 1: Derivar las redes del esquema**

En `src/lib/posts.ts`, sumar `SOCIAL_NETWORKS` al import existente de `@/db` y reemplazar:

```ts
const OAUTH_NETWORKS = new Set(['instagram', 'tiktok'])
```

por:

```ts
// YouTube is the one network configured by environment instead of a button.
const OAUTH_NETWORKS = new Set(['instagram', 'tiktok', 'facebook'])
```

y en `getConnections`, reemplazar:

```ts
  return ['instagram', 'tiktok', 'youtube'].map((network) => {
```

por:

```ts
  // Derived from the schema so this phase and the next ones add networks in one place.
  return SOCIAL_NETWORKS.map((network) => {
```

- [ ] **Step 2: La grilla acomoda cuatro cards**

En `connections.tsx` línea 44, reemplazar:

```tsx
      <div className="grid gap-3 sm:grid-cols-3">
```

por:

```tsx
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
```

- [ ] **Step 3: Verificación final completa**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS los tres. Después `npm run build` — Expected: compila (la base es lazy, no necesita `DATABASE_URL`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/posts.ts "src/app/admin/(dash)/content/connections.tsx"
git commit -m "Muestra la card de Facebook y deriva las redes del esquema"
```

---

## Notas para el ejecutor

- **Orden de cards**: `SOCIAL_NETWORKS` queda `['instagram', 'tiktok', 'youtube', 'facebook']` — Facebook aparece cuarto. Apendear al final es deliberado: no reordena nada existente.
- **Variables de entorno**: no hay nuevas obligatorias. `FACEBOOK_PAGE_ID` es opcional (solo si el login administra varias páginas). Las credenciales son las existentes `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.
- **Sin migración de base**: `SOCIAL_NETWORKS` es un tipo TS; ninguna tabla cambia.
- **AGENTS.md**: `next dev` re-agrega un bloque a `AGENTS.md`; si aparece en `git status`, commitearlo junto al trabajo está bien según el propio archivo.
