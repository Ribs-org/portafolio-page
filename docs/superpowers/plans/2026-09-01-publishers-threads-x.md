# Publishers de Threads y X — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar Threads y/o X en el compositor — incluso sin archivos — y que el cron publique a la hora señalada: texto puro, imagen o video según lo que cada red acepta.

**Architecture:** Dos ramas OAuth nuevas en las rutas genéricas (Threads calcado del molde de Instagram; X con PKCE y el `code_verifier` en cookie httpOnly), dos publishers con `ensureCredential` propio (no hay connector de lectura; el orquestador ya prefiere la credencial del publisher desde la fase 3), validación por-destino en el helper puro existente, y Facebook ganando el post de solo-texto de regalo.

**Tech Stack:** Next.js App Router, Drizzle + Neon, Vitest, Threads API (graph.threads.net v1.0), X API v2 (OAuth 2.0 + PKCE, media upload por fragmentos), Vercel Blob.

**Spec:** `docs/superpowers/specs/2026-09-01-publishers-threads-x-design.md`

## Global Constraints

- Frases fijas en español al dueño; detalle upstream a `console.error` truncado a 300; tokens jamás al log.
- Tokens cifrados con `encryptToken`/`decryptToken`; `expiresAt` real desde `expires_in`.
- Comentarios solo para restricciones que el código no puede mostrar, tono de los archivos vecinos.
- Commits en español, presente, estilo del repo, con footer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01GfKG533gmtPXZ8ku9QpK12`
- Disciplina git del ejecutor: verificar HEAD antes de empezar, jamás checkout/reset/rebase/stash, `git add` por archivo (nunca `-A`), verificar el padre tras commitear.
- Verificación: `npx vitest run <archivo>` por task; al final `npm test && npm run typecheck && npm run lint && npm run build`.

---

### Task 1: Catálogo — redes, prefijos de campaña

**Files:**
- Modify: `src/db/schema.ts:132`
- Modify: `src/lib/social/campaign.ts` (mapa `PREFIXES`)
- Test: `src/lib/social/campaign.test.ts` (agregar describes)

**Interfaces:**
- Produces: `'threads'` y `'x'` en `SOCIAL_NETWORKS`; prefijos `th` y `x` en `campaignTagFor`.

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/social/campaign.test.ts` (junto a los describes de prefijos existentes):

```ts
describe('campaignTagFor threads y x', () => {
  it('acuña th- para threads', () => {
    expect(campaignTagFor('threads', '18000000000000001')).toBe('th-18000000000000001')
  })

  it('acuña x- para x', () => {
    expect(campaignTagFor('x', '1830000000000000000')).toBe('x-1830000000000000000')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/campaign.test.ts`
Expected: FAIL — sin prefijo, las etiquetas salen `threads-…` y `x-…`.

- [ ] **Step 3: Implementación**

`src/db/schema.ts:132`:

```ts
export const SOCIAL_NETWORKS = ['instagram', 'tiktok', 'youtube', 'facebook', 'threads', 'x'] as const
```

`src/lib/social/campaign.ts`, el mapa gana dos líneas:

```ts
const PREFIXES: Record<string, string> = {
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  facebook: 'fb',
  threads: 'th',
  x: 'x',
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/campaign.test.ts && npm run typecheck`
Expected: PASS ambos. (`networkLabel` ya conoce threads y x — nada que tocar ahí.)

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/lib/social/campaign.ts src/lib/social/campaign.test.ts
git commit -m "Suma Threads y X al catálogo de redes y sus prefijos de campaña"
```
(con el footer de Global Constraints)

---

### Task 2: Validación por-destino

**Files:**
- Modify: `src/lib/social/publish/validate.ts`
- Test: `src/lib/social/publish/validate.test.ts` (agregar describe)

**Interfaces:**
- Produces: `X_CAPTION_LIMIT = 280`, `THREADS_CAPTION_LIMIT = 500`; `validateScheduleDraft` acepta texto puro cuando ningún destino exige media.

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/social/publish/validate.test.ts`:

```ts
describe('validación por destino (Threads y X)', () => {
  it('acepta texto puro cuando ningún destino exige archivo', () => {
    expect(
      validateScheduleDraft(
        { ...base, imageCount: 0, networks: ['x', 'threads', 'facebook'] },
        now,
      ),
    ).toBeNull()
  })

  it('rechaza texto puro si Instagram o YouTube están marcados', () => {
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, networks: ['x', 'instagram'] }, now),
    ).toMatch(/archivo/)
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, networks: ['youtube'] }, now),
    ).toMatch(/archivo/)
  })

  it('280 exactos pasan por X; 281 no', () => {
    const conX = { ...base, networks: ['x'], imageCount: 0 }
    expect(validateScheduleDraft({ ...conX, caption: 'x'.repeat(280) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...conX, caption: 'x'.repeat(281) }, now)).toMatch(/280/)
  })

  it('500 exactos pasan por Threads; 501 no', () => {
    const conTh = { ...base, networks: ['threads'], imageCount: 0 }
    expect(validateScheduleDraft({ ...conTh, caption: 'x'.repeat(500) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...conTh, caption: 'x'.repeat(501) }, now)).toMatch(/500/)
  })

  it('un texto largo sin X ni Threads marcados sigue valiendo hasta 2200', () => {
    expect(validateScheduleDraft({ ...base, caption: 'x'.repeat(2200) }, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts`
Expected: FAIL — el texto puro se rechaza siempre y los límites 280/500 no existen.

- [ ] **Step 3: Implementación**

`src/lib/social/publish/validate.ts` completo pasa a:

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
export const X_CAPTION_LIMIT = 280
export const THREADS_CAPTION_LIMIT = 500

// Text-first networks publish with no file at all; these two never can.
const MEDIA_REQUIRED = new Set(['instagram', 'youtube'])

/**
 * The composer's whole rulebook, pure so it is testable and shared: the server action
 * runs it as the real gate. Returns a fixed sentence or null.
 */
export function validateScheduleDraft(draft: ScheduleDraft, now: Date): string | null {
  const files = draft.imageCount + draft.videoCount
  if (files === 0 && draft.networks.some((n) => MEDIA_REQUIRED.has(n))) {
    return 'Instagram y YouTube necesitan al menos un archivo.'
  }
  if (files > MAX_CAROUSEL_ITEMS) return 'Máximo diez archivos por publicación.'
  if (draft.networks.length === 0) return 'Elige al menos una plataforma.'
  if (!draft.scheduledAt) return 'La fecha no se entendió.'
  if (draft.scheduledAt.getTime() <= now.getTime()) return 'La hora debe estar en el futuro.'
  if (draft.networks.includes('x') && draft.caption.length > X_CAPTION_LIMIT) {
    return 'El texto excede los 280 caracteres de X.'
  }
  if (draft.networks.includes('threads') && draft.caption.length > THREADS_CAPTION_LIMIT) {
    return 'El texto excede los 500 caracteres de Threads.'
  }
  if (draft.caption.length > MAX_CAPTION_LENGTH) return 'El texto es demasiado largo para Instagram.'
  return null
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts && npm test`
Expected: PASS — los 9 tests viejos siguen verdes (el caso «rechaza no adjuntar nada» usa Instagram como destino y su mensaje aún contiene «archivo»).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/validate.ts src/lib/social/publish/validate.test.ts
git commit -m "Permite texto puro y valida los límites de X y Threads por destino"
```

---

### Task 3: OAuth de Threads

**Files:**
- Modify: `src/app/api/social/[network]/connect/route.ts`
- Modify: `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Produces: `GET /api/social/threads/connect|callback` funcionando; `threadsCredential` con token largo (~60 días), `refreshToken` null, `externalId` = id del perfil, `handle` = username.

Sin test unitario (rutas). Verificación por typecheck y lint.

- [ ] **Step 1: Connect**

En `SCOPES` (después de `youtube`):

```ts
  threads: 'threads_basic,threads_content_publish',
```

Y la rama (después de la de youtube):

```ts
  if (network === 'threads') {
    const appId = env('THREADS_APP_ID')
    if (!appId) return new NextResponse('Falta THREADS_APP_ID', { status: 400 })

    const url = new URL('https://threads.net/oauth/authorize')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return NextResponse.redirect(url)
  }
```

- [ ] **Step 2: Callback**

Debajo de `youtubeCredential`:

```ts
async function threadsCredential(code: string, redirectUri: string): Promise<Credential> {
  const appId = env('THREADS_APP_ID')
  const appSecret = env('THREADS_APP_SECRET')
  if (!appId || !appSecret) {
    throw new OAuthError('Faltan las credenciales de Threads (THREADS_APP_ID / THREADS_APP_SECRET).')
  }

  const short = await fetch('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!short.ok) {
    console.error('Threads rechazó el código:', short.status, (await short.text()).slice(0, 300))
    throw new OAuthError('Threads rechazó el código. Inténtalo de nuevo.')
  }
  const shortData = (await short.json()) as { access_token?: string }
  if (!shortData.access_token) throw new OAuthError('Threads no devolvió token.')

  // Same two-step dance as Instagram: the code buys an hour, th_exchange_token buys
  // the ~60 days worth storing.
  const long = await fetch(
    `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortData.access_token}`,
  )
  if (!long.ok) {
    console.error('Threads no canjeó el token largo:', long.status, (await long.text()).slice(0, 300))
    throw new OAuthError('Threads no canjeó el token largo. Inténtalo de nuevo.')
  }
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }
  if (!longData.access_token) throw new OAuthError('Threads no devolvió el token largo.')

  const me = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${longData.access_token}`,
  )
  if (!me.ok) {
    console.error('No se pudo leer el perfil de Threads:', me.status, (await me.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer el perfil de Threads.')
  }
  const profile = (await me.json()) as { id?: string; username?: string }
  if (!profile.id) throw new OAuthError('Threads no devolvió el perfil.')

  return {
    accessToken: longData.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
    externalId: profile.id,
    handle: profile.username ?? null,
  }
}
```

Y en `fetchCredential`, entre youtube y tiktok:

```ts
  if (network === 'threads') return threadsCredential(code, redirectUri)
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/social/[network]/connect/route.ts" "src/app/api/social/[network]/callback/route.ts"
git commit -m "Conecta Threads con el molde de canje corto a largo de Meta"
```

---

### Task 4: OAuth de X con PKCE

**Files:**
- Modify: `src/app/api/social/[network]/connect/route.ts`
- Modify: `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Produces: `GET /api/social/x/connect|callback`; el `code_verifier` viaja en cookie `x_pkce_verifier` (httpOnly, Secure, SameSite=Lax, 10 min, path `/api/social/x`); `fetchCredential` gana un cuarto parámetro opcional `pkceVerifier`.

Sin test unitario (rutas). Verificación por typecheck y lint.

- [ ] **Step 1: Connect**

Imports nuevos arriba del archivo: `import { createHash, randomBytes } from 'node:crypto'`.

En `SCOPES`:

```ts
  x: 'tweet.read tweet.write users.read offline.access',
```

Y la rama (después de threads):

```ts
  if (network === 'x') {
    const clientId = env('X_CLIENT_ID')
    if (!clientId) return new NextResponse('Falta X_CLIENT_ID', { status: 400 })

    // PKCE: the verifier must come back at the callback but never travel through X's
    // servers — a short-lived httpOnly cookie is the only channel that satisfies both.
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')

    const url = new URL('https://x.com/i/oauth2/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')

    const response = NextResponse.redirect(url)
    response.cookies.set('x_pkce_verifier', verifier, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/api/social/x',
    })
    return response
  }
```

- [ ] **Step 2: Callback**

Debajo de `threadsCredential`:

```ts
async function xCredential(
  code: string,
  redirectUri: string,
  pkceVerifier: string | undefined,
): Promise<Credential> {
  const clientId = env('X_CLIENT_ID')
  const clientSecret = env('X_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new OAuthError('Faltan las credenciales de X (X_CLIENT_ID / X_CLIENT_SECRET).')
  }
  if (!pkceVerifier) {
    throw new OAuthError('La conexión con X expiró. Inténtalo de nuevo.')
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const exchange = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: pkceVerifier,
    }),
  })
  if (!exchange.ok) {
    console.error('X rechazó el código:', exchange.status, (await exchange.text()).slice(0, 300))
    throw new OAuthError('X rechazó el código. Inténtalo de nuevo.')
  }
  const tokens = (await exchange.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!tokens.access_token) throw new OAuthError('X no devolvió token.')
  // The two-hour token is useless without its refresh companion.
  if (!tokens.refresh_token) throw new OAuthError('X no entregó el token de refresco. Inténtalo de nuevo.')

  const me = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!me.ok) {
    console.error('No se pudo leer la cuenta de X:', me.status, (await me.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer la cuenta de X.')
  }
  const user = (await me.json()) as { data?: { id?: string; username?: string } }
  if (!user.data?.id) throw new OAuthError('X no devolvió la cuenta.')

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000),
    externalId: user.data.id,
    handle: user.data.username ?? null,
  }
}
```

`fetchCredential` gana el parámetro y la rama:

```ts
async function fetchCredential(
  network: string,
  code: string,
  redirectUri: string,
  pkceVerifier?: string,
): Promise<Credential> {
  if (network === 'instagram') return instagramCredential(code, redirectUri)
  if (network === 'facebook') return facebookCredential(code, redirectUri)
  if (network === 'youtube') return youtubeCredential(code, redirectUri)
  if (network === 'threads') return threadsCredential(code, redirectUri)
  if (network === 'x') return xCredential(code, redirectUri, pkceVerifier)
  if (network === 'tiktok') return tiktokCredential(code, redirectUri)
  throw new OAuthError('Esa red no usa OAuth.')
}
```

Y en el `GET`, la llamada a `fetchCredential` pasa el verifier leído de la cookie
(la cookie se auto-expira a los 10 minutos; no hace falta borrarla a mano):

```ts
    const pkceVerifier = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)x_pkce_verifier=([^;]+)/)?.[1]
    const credential = await fetchCredential(network, code, redirectUri, pkceVerifier)
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/social/[network]/connect/route.ts" "src/app/api/social/[network]/callback/route.ts"
git commit -m "Conecta X con PKCE y el verificador en una cookie de diez minutos"
```

---

### Task 5: Publisher de Threads

**Files:**
- Create: `src/lib/social/publish/threads.ts`
- Test: `src/lib/social/publish/threads.test.ts`
- Modify: `src/lib/social/publish/index.ts`

**Interfaces:**
- Consumes: `type PublishMedia`, `type PublishInput/Outcome/Publisher`, `PUBLISH_NETWORK_ERROR` de `./publisher`; `decryptToken/encryptToken`, `getDb/socialAccounts/eq`, `env` (como el publisher de YouTube).
- Produces: `threadsPublisher` en `PUBLISHERS`; frases `THREADS_REJECTED = 'Threads rechazó la publicación.'`, `THREADS_SINGLE_FILE = 'Threads recibe un solo archivo por post.'`; helpers `threadsContainerParams(caption, media: PublishMedia | null)`, `classifyThreadsStatus(payload)`.

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/social/publish/threads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  THREADS_REJECTED,
  THREADS_SINGLE_FILE,
  classifyThreadsStatus,
  threadsContainerParams,
} from './threads'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('threadsContainerParams', () => {
  it('sin archivo es un post de texto', () => {
    expect(threadsContainerParams('Hola', null)).toEqual({ media_type: 'TEXT', text: 'Hola' })
  })

  it('imagen y video llevan su url y el texto', () => {
    expect(threadsContainerParams('Hola', image)).toEqual({
      media_type: 'IMAGE',
      image_url: 'https://blob.test/a.jpg',
      text: 'Hola',
    })
    expect(threadsContainerParams('Hola', video)).toEqual({
      media_type: 'VIDEO',
      video_url: 'https://blob.test/b.mp4',
      text: 'Hola',
    })
  })
})

describe('classifyThreadsStatus', () => {
  it('FINISHED publica; ERROR y EXPIRED son veredictos', () => {
    expect(classifyThreadsStatus({ status: 'FINISHED' })).toBe('finished')
    expect(classifyThreadsStatus({ status: 'ERROR' })).toBe('error')
    expect(classifyThreadsStatus({ status: 'EXPIRED' })).toBe('error')
  })

  it('IN_PROGRESS, ausente o desconocido siguen esperando', () => {
    expect(classifyThreadsStatus({ status: 'IN_PROGRESS' })).toBe('in_progress')
    expect(classifyThreadsStatus({})).toBe('in_progress')
  })
})

describe('frases fijas', () => {
  it('nombran a Threads, no a otra red', () => {
    expect(THREADS_REJECTED).toBe('Threads rechazó la publicación.')
    expect(THREADS_SINGLE_FILE).toBe('Threads recibe un solo archivo por post.')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/threads.test.ts`
Expected: FAIL — `./threads` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/threads.ts`:

```ts
import { eq } from 'drizzle-orm'
import { getDb, socialAccounts, type SocialAccount } from '@/db'
import { decryptToken, encryptToken } from '../crypto'
import {
  PUBLISH_NETWORK_ERROR,
  type PublishInput,
  type PublishMedia,
  type PublishOutcome,
  type Publisher,
} from './publisher'

export const THREADS_REJECTED = 'Threads rechazó la publicación.'
export const THREADS_SINGLE_FILE = 'Threads recibe un solo archivo por post.'

export function threadsContainerParams(
  caption: string,
  media: PublishMedia | null,
): Record<string, string> {
  if (!media) return { media_type: 'TEXT', text: caption }
  if (media.mediaType === 'video') {
    return { media_type: 'VIDEO', video_url: media.url, text: caption }
  }
  return { media_type: 'IMAGE', image_url: media.url, text: caption }
}

/** Same anti-guessing rule as every container on this codebase. */
export function classifyThreadsStatus(
  payload: Record<string, unknown>,
): 'finished' | 'in_progress' | 'error' {
  const status = payload.status
  if (status === 'FINISHED') return 'finished'
  if (status === 'ERROR' || status === 'EXPIRED') return 'error'
  return 'in_progress'
}

const GRAPH = 'https://graph.threads.net/v1.0'
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Threads' long-lived token refreshes itself (th_refresh_token, no refresh token
 * involved) — but only while it is still alive and older than a day, so the window
 * is a generous week before expiry.
 */
async function ensureThreadsCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const response = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`,
  )
  if (!response.ok) {
    console.error('Threads refresh:', response.status, (await response.text()).slice(0, 300))
    return token
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return token

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 5184000) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

async function postForm(
  url: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) })
  if (!response.ok) {
    console.error('Threads publish:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  return response.json()
}

async function publishContainer(input: PublishInput, containerId: string): Promise<PublishOutcome> {
  const data = await postForm(`${GRAPH}/${input.accountExternalId}/threads_publish`, {
    creation_id: containerId,
    access_token: input.token,
  })
  const id = data?.id
  if (typeof id !== 'string') return { kind: 'failed', reason: THREADS_REJECTED }
  return { kind: 'published', externalId: id }
}

export const threadsPublisher: Publisher = {
  network: 'threads',
  ensureCredential: ensureThreadsCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    if (input.containerId) {
      const response = await fetch(
        `${GRAPH}/${input.containerId}?fields=status&access_token=${input.token}`,
      )
      if (!response.ok) {
        console.error('Threads container status:', response.status, (await response.text()).slice(0, 300))
        // A poll that didn't answer says nothing about the video: stay parked — the
        // 24h stale cut still bounds the wait. Same lesson as YouTube and Facebook.
        return { kind: 'processing', containerId: input.containerId }
      }
      const verdict = classifyThreadsStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: THREADS_REJECTED }
      if (verdict === 'in_progress') return { kind: 'processing', containerId: input.containerId }
      return publishContainer(input, input.containerId)
    }

    const media = [...input.media].sort((a, b) => a.position - b.position)
    if (media.length > 1) return { kind: 'failed', reason: THREADS_SINGLE_FILE }
    const only = media[0] ?? null

    const container = await postForm(`${GRAPH}/${input.accountExternalId}/threads`, {
      ...threadsContainerParams(input.caption, only),
      access_token: input.token,
    })
    const containerId = container?.id
    if (typeof containerId !== 'string') return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }

    // Text and single images are ready at once; video processes asynchronously and
    // parks on the container like Instagram's reels.
    if (only?.mediaType === 'video') return { kind: 'processing', containerId }
    return publishContainer(input, containerId)
  },
}
```

En `src/lib/social/publish/index.ts`: import de `threadsPublisher` y sumarlo a `PUBLISHERS`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/social/publish/ && npm run typecheck && npm run lint`
Expected: PASS los tres.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/threads.ts src/lib/social/publish/threads.test.ts src/lib/social/publish/index.ts
git commit -m "Publica en Threads: texto e imagen directos, video por contenedor"
```

---

### Task 6: Publisher de X

**Files:**
- Create: `src/lib/social/publish/x.ts`
- Test: `src/lib/social/publish/x.test.ts`
- Modify: `src/lib/social/publish/index.ts`

**Interfaces:**
- Consumes: como Task 5.
- Produces: `xPublisher` en `PUBLISHERS`; frases `X_REJECTED = 'X rechazó la publicación.'`, `X_NO_VIDEO = 'X aún no recibe video desde el calendario.'`, `X_TOO_MANY_IMAGES = 'X recibe hasta cuatro imágenes.'`; helper `tweetBody(caption, mediaIds)`.

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/social/publish/x.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { X_NO_VIDEO, X_REJECTED, X_TOO_MANY_IMAGES, tweetBody } from './x'

describe('tweetBody', () => {
  it('texto puro no lleva bloque de media', () => {
    expect(tweetBody('Hola', [])).toEqual({ text: 'Hola' })
  })

  it('con imágenes adjunta los media_ids en orden', () => {
    expect(tweetBody('Hola', ['M1', 'M2'])).toEqual({
      text: 'Hola',
      media: { media_ids: ['M1', 'M2'] },
    })
  })
})

describe('frases fijas', () => {
  it('nombran a X, no a otra red', () => {
    expect(X_REJECTED).toBe('X rechazó la publicación.')
    expect(X_NO_VIDEO).toBe('X aún no recibe video desde el calendario.')
    expect(X_TOO_MANY_IMAGES).toBe('X recibe hasta cuatro imágenes.')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/x.test.ts`
Expected: FAIL — `./x` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/x.ts`:

```ts
import { eq } from 'drizzle-orm'
import { getDb, socialAccounts, type SocialAccount } from '@/db'
import { env } from '@/lib/env'
import { decryptToken, encryptToken } from '../crypto'
import {
  PUBLISH_NETWORK_ERROR,
  type PublishInput,
  type PublishOutcome,
  type Publisher,
} from './publisher'

export const X_REJECTED = 'X rechazó la publicación.'
export const X_NO_VIDEO = 'X aún no recibe video desde el calendario.'
export const X_TOO_MANY_IMAGES = 'X recibe hasta cuatro imágenes.'

export function tweetBody(
  caption: string,
  mediaIds: string[],
): { text: string; media?: { media_ids: string[] } } {
  if (mediaIds.length === 0) return { text: caption }
  return { text: caption, media: { media_ids: mediaIds } }
}

const API = 'https://api.x.com/2'
const REFRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * X tokens live two hours and the refresh token ROTATES on every use: saving only the
 * access token would strand the next refresh, so both go back encrypted every time.
 */
async function ensureXCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken || !account.refreshToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const clientId = env('X_CLIENT_ID')
  const clientSecret = env('X_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptToken(account.refreshToken),
    }),
  })
  if (!response.ok) {
    console.error('X refresh:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : account.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

/** INIT → one APPEND → FINALIZE: images fit in a single segment. Returns the media id. */
async function uploadImage(token: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const init = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      command: 'INIT',
      media_type: mime,
      total_bytes: String(bytes.length),
      media_category: 'tweet_image',
    }),
  })
  if (!init.ok) {
    console.error('X media INIT:', init.status, (await init.text()).slice(0, 300))
    return null
  }
  const initData = (await init.json()) as { data?: { id?: string } }
  const mediaId = initData.data?.id
  if (typeof mediaId !== 'string') return null

  const form = new FormData()
  form.set('command', 'APPEND')
  form.set('media_id', mediaId)
  form.set('segment_index', '0')
  form.set('media', new Blob([bytes as BlobPart], { type: mime }))
  const append = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!append.ok) {
    console.error('X media APPEND:', append.status, (await append.text()).slice(0, 300))
    return null
  }

  const finalize = await fetch(`${API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ command: 'FINALIZE', media_id: mediaId }),
  })
  if (!finalize.ok) {
    console.error('X media FINALIZE:', finalize.status, (await finalize.text()).slice(0, 300))
    return null
  }
  return mediaId
}

export const xPublisher: Publisher = {
  network: 'x',
  ensureCredential: ensureXCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    const media = [...input.media].sort((a, b) => a.position - b.position)
    if (media.some((m) => m.mediaType === 'video')) return { kind: 'failed', reason: X_NO_VIDEO }
    if (media.length > 4) return { kind: 'failed', reason: X_TOO_MANY_IMAGES }

    const mediaIds: string[] = []
    for (const item of media) {
      const blob = await fetch(item.url)
      if (!blob.ok) {
        console.error('No se pudo leer la imagen del Blob:', blob.status)
        return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      }
      const mime = blob.headers.get('content-type') ?? 'image/jpeg'
      const id = await uploadImage(input.token, new Uint8Array(await blob.arrayBuffer()), mime)
      if (!id) return { kind: 'failed', reason: X_REJECTED }
      mediaIds.push(id)
    }

    const response = await fetch(`${API}/tweets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(tweetBody(input.caption, mediaIds)),
    })
    if (!response.ok) {
      console.error('X tweets:', response.status, (await response.text()).slice(0, 300))
      return { kind: 'failed', reason: X_REJECTED }
    }
    const data = (await response.json()) as { data?: { id?: string } }
    const id = data.data?.id
    if (typeof id !== 'string') return { kind: 'failed', reason: X_REJECTED }
    return { kind: 'published', externalId: id }
  },
}
```

En `src/lib/social/publish/index.ts`: import y `PUBLISHERS` con los seis.

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/social/publish/ && npm run typecheck && npm run lint`
Expected: PASS los tres.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/x.ts src/lib/social/publish/x.test.ts src/lib/social/publish/index.ts
git commit -m "Publica en X: texto y hasta cuatro imágenes con subida propia"
```

---

### Task 7: Facebook texto puro, UI y verificación final

**Files:**
- Modify: `src/lib/social/publish/facebook.ts` (rama de solo-texto)
- Modify: `src/app/admin/(dash)/schedule/composer.tsx` (ENABLED)
- Modify: `src/lib/posts.ts` (OAUTH_NETWORKS)
- Modify: `README.md` (cuatro filas de env)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: las seis redes publicables desde el compositor.

- [ ] **Step 1: Facebook aprende texto puro**

En `facebook.ts`, dentro de `publish()`, justo después del ordenamiento de `media` y
ANTES del chequeo de mezcla, agregar:

```ts
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
```

- [ ] **Step 2: UI y README**

- `composer.tsx`: `ENABLED` pasa a
  `new Set(['instagram', 'facebook', 'youtube', 'threads', 'x'])` y su comentario a
  `// Every network but TikTok publishes; its checkbox waits for a publisher.`
- `src/lib/posts.ts`: `OAUTH_NETWORKS` gana `'threads'` y `'x'`.
- `README.md`, tabla de env, cuatro filas junto a las de Google:

```markdown
| `THREADS_APP_ID` | Conectar Threads para publicar | El Threads App ID del caso de uso «API de Threads» de la app de Meta |
| `THREADS_APP_SECRET` | El secreto de ese caso de uso | Junto con el anterior |
| `X_CLIENT_ID` | Conectar X para publicar (OAuth 2.0 + PKCE) | El Client ID de la app en developer.x.com |
| `X_CLIENT_SECRET` | El secreto de esa app | Junto con el anterior |
```

- [ ] **Step 3: Verificación final completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS los cuatro (los tests nuevos de Tasks 1–6 sumados a los 183).

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/publish/facebook.ts "src/app/admin/(dash)/schedule/composer.tsx" src/lib/posts.ts README.md
git commit -m "Habilita Threads y X en el compositor y el texto puro en Facebook"
```

---

## Notas para el ejecutor

- **Orden**: 1→7. Tasks 3 y 4 tocan los mismos archivos de rutas — jamás en paralelo.
- **Cards de Threads/X**: mostrarán «Sincronizado nunca» para siempre — esperado, sin
  connector de lectura (spec, No objetivos).
- **`attempt()` sin connector**: la preferencia de credencial de fase 3
  (`publisher.ensureCredential ?? connector?.ensureCredential`) hace que la ausencia
  de connector para threads/x sea legal; ambos publishers traen la suya.
- **Cast de `Uint8Array` a `BlobPart`** en x.ts: mismo acomodo de tipos que el
  `BodyInit` de YouTube (TS 5.7+); sin efecto de runtime.
- **AGENTS.md**: si el build re-agrega su bloque, commitearlo junto está bien.
