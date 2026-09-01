# Publisher de YouTube — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar YouTube en el compositor y que el cron suba el video a la hora programada, con OAuth de Google (refresh incluido) y los mismos estados que las demás redes.

**Architecture:** Rama `youtube` en las rutas OAuth genéricas (primer proveedor Google del repo); `Publisher.ensureCredential` opcional que el orquestador prefiere al del connector (primera red donde leer ≠ escribir); publisher que descarga el video del Blob y lo sube con `videos.insert` multipart, estacionándose en `processing` hasta que `uploadStatus` sea `processed`. El sync por API key no se toca.

**Tech Stack:** Next.js App Router, Drizzle + Neon, Vitest, Google OAuth 2.0 + YouTube Data API v3, Vercel Blob.

**Spec:** `docs/superpowers/specs/2026-09-01-publisher-youtube-design.md`

## Global Constraints

- Mensajes que ve el dueño: frases fijas en español; el detalle de Google solo a `console.error`, truncado.
- Tokens siempre cifrados con `encryptToken`/`decryptToken` de `src/lib/social/crypto.ts`; `expiresAt` real desde `expires_in`.
- Comentarios solo para restricciones que el código no puede mostrar, densidad y tono de los archivos vecinos.
- Commits en español, presente, estilo del repo, con footer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01GfKG533gmtPXZ8ku9QpK12`
- Disciplina git del ejecutor: verificar HEAD antes de empezar, jamás checkout/reset/rebase/stash, `git add` solo los archivos de la task (nunca `-A`), y verificar el padre del commit después.
- Verificación: `npx vitest run <archivo>` por task; al final `npm test && npm run typecheck && npm run lint && npm run build`.

---

### Task 1: OAuth de Google — connect y callback

**Files:**
- Modify: `src/app/api/social/[network]/connect/route.ts`
- Modify: `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Consumes: `env`, `signOAuthState`, `OAuthError`, `type Credential` — todos ya presentes en esos archivos.
- Produces: `GET /api/social/youtube/connect` redirige al diálogo de Google; `youtubeCredential(code, redirectUri): Promise<Credential>` registrado en `fetchCredential`.

Sin test unitario (el repo no testea route handlers). Verificación por typecheck y lint.

- [ ] **Step 1: La entrada en SCOPES y la rama de connect**

En `connect/route.ts`, agregar a `SCOPES` (después de `facebook`):

```ts
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
```

Y después de la rama de Meta (`instagram`/`facebook`), antes de la de TikTok:

```ts
  if (network === 'youtube') {
    const clientId = env('GOOGLE_CLIENT_ID')
    if (!clientId) return new NextResponse('Falta GOOGLE_CLIENT_ID', { status: 400 })

    // access_type=offline + prompt=consent is the pair that makes Google hand over a
    // refresh token even on re-consent; without it the second connect gets none and
    // the hourly access token dies with no way back.
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', state)
    return NextResponse.redirect(url)
  }
```

- [ ] **Step 2: `youtubeCredential` en el callback**

En `callback/route.ts`, debajo de `facebookCredential`:

```ts
async function youtubeCredential(code: string, redirectUri: string): Promise<Credential> {
  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new OAuthError('Faltan las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const exchange = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!exchange.ok) {
    console.error('Google rechazó el código:', exchange.status, (await exchange.text()).slice(0, 300))
    throw new OAuthError('Google rechazó el código. Inténtalo de nuevo.')
  }
  const tokens = (await exchange.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!tokens.access_token) throw new OAuthError('Google no devolvió token.')
  // Without a refresh token the hourly access token is a dead end: better to fail the
  // connect now than to strand the cron in an hour. prompt=consent should prevent this.
  if (!tokens.refresh_token) {
    throw new OAuthError('Google no entregó el token de refresco. Reintenta la conexión.')
  }

  const channels = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  )
  if (!channels.ok) {
    console.error('No se pudo leer el canal:', channels.status, (await channels.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer el canal de YouTube.')
  }
  const data = (await channels.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>
  }
  const channel = data.items?.[0]
  if (!channel?.id) throw new OAuthError('Esta cuenta de Google no tiene canal de YouTube.')

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    externalId: channel.id,
    handle: channel.snippet?.title ?? null,
  }
}
```

`fetchCredential` gana la rama (entre facebook y tiktok):

```ts
  if (network === 'youtube') return youtubeCredential(code, redirectUri)
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/social/[network]/connect/route.ts" "src/app/api/social/[network]/callback/route.ts"
git commit -m "Conecta YouTube por OAuth de Google con token de refresco"
```
(con el footer de Global Constraints)

---

### Task 2: Helpers puros del publisher

**Files:**
- Create: `src/lib/social/publish/youtube.ts`
- Test: `src/lib/social/publish/youtube.test.ts`

**Interfaces:**
- Consumes: `type PublishMedia` de `./publisher`.
- Produces (usados por Task 3):
  - `YOUTUBE_ONLY_VIDEO = 'YouTube solo recibe video.'`
  - `youtubeTitle(caption: string): string` (primera línea, recorte a 100, fallback `'Video'`)
  - `youtubeMetadata(caption: string): { snippet: { title: string; description: string }; status: { privacyStatus: 'public'; selfDeclaredMadeForKids: false } }`
  - `singleVideo(media: PublishMedia[]): PublishMedia | null` (exactamente un video; cualquier otra cosa → null)
  - `classifyUploadStatus(payload: Record<string, unknown>): 'ready' | 'processing' | 'error'`
  - `youtubeUploadBody(metadataJson: string, video: Uint8Array, boundary: string): Uint8Array`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/social/publish/youtube.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  classifyUploadStatus,
  singleVideo,
  youtubeMetadata,
  youtubeTitle,
  youtubeUploadBody,
} from './youtube'

const image = { url: 'https://blob.test/a.jpg', mediaType: 'image' as const, position: 0 }
const video = { url: 'https://blob.test/b.mp4', mediaType: 'video' as const, position: 0 }

describe('youtubeTitle', () => {
  it('la primera línea es el título; el resto queda para la descripción', () => {
    expect(youtubeTitle('¿VALE LA PENA LA U?\nSi tenís 17, tómate un año.')).toBe('¿VALE LA PENA LA U?')
  })

  it('recorta a los 100 caracteres que YouTube admite', () => {
    expect(youtubeTitle('x'.repeat(150))).toHaveLength(100)
  })

  it('un caption vacío no deja el título vacío: YouTube lo exige', () => {
    expect(youtubeTitle('')).toBe('Video')
    expect(youtubeTitle('   \n resto')).toBe('resto')
  })
})

describe('youtubeMetadata', () => {
  it('público y declarado no-infantil, con el caption completo de descripción', () => {
    expect(youtubeMetadata('Título\ncuerpo')).toEqual({
      snippet: { title: 'Título', description: 'Título\ncuerpo' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    })
  })
})

describe('singleVideo', () => {
  it('exactamente un video pasa; fotos, mezcla o varios videos no', () => {
    expect(singleVideo([video])).toBe(video)
    expect(singleVideo([image])).toBeNull()
    expect(singleVideo([video, image])).toBeNull()
    expect(singleVideo([video, { ...video, position: 1 }])).toBeNull()
    expect(singleVideo([])).toBeNull()
  })
})

describe('classifyUploadStatus', () => {
  const listWith = (uploadStatus: string) => ({
    items: [{ status: { uploadStatus } }],
  })

  it('processed está listo', () => {
    expect(classifyUploadStatus(listWith('processed'))).toBe('ready')
  })

  it('failed, rejected y deleted son veredictos', () => {
    expect(classifyUploadStatus(listWith('failed'))).toBe('error')
    expect(classifyUploadStatus(listWith('rejected'))).toBe('error')
    expect(classifyUploadStatus(listWith('deleted'))).toBe('error')
  })

  it('uploaded, desconocido o sin status siguen esperando', () => {
    expect(classifyUploadStatus(listWith('uploaded'))).toBe('processing')
    expect(classifyUploadStatus({ items: [{}] })).toBe('processing')
  })

  it('un video que ya no aparece en la lista es un veredicto, no una espera', () => {
    expect(classifyUploadStatus({ items: [] })).toBe('error')
    expect(classifyUploadStatus({})).toBe('error')
  })
})

describe('youtubeUploadBody', () => {
  it('arma el multipart/related: metadata JSON, luego el video, con el boundary', () => {
    const body = youtubeUploadBody('{"a":1}', new Uint8Array([7, 8]), 'FRONTERA')
    const text = new TextDecoder().decode(body)
    expect(text).toContain('--FRONTERA\r\nContent-Type: application/json')
    expect(text).toContain('{"a":1}')
    expect(text).toContain('Content-Type: video/*')
    expect(text.endsWith('--FRONTERA--\r\n')).toBe(true)
    // Los bytes del video viajan intactos entre las cabeceras y el cierre.
    expect([...body].includes(7) && [...body].includes(8)).toBe(true)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/youtube.test.ts`
Expected: FAIL — `./youtube` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/youtube.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/youtube.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/youtube.ts src/lib/social/publish/youtube.test.ts
git commit -m "Arma título, metadata y cuerpo de subida para YouTube"
```

---

### Task 3: El publisher con refresh propio, y su registro

**Files:**
- Modify: `src/lib/social/publish/publisher.ts` (una línea en el tipo — debe ir primero o el typecheck de esta task falla)
- Modify: `src/lib/social/publish/youtube.ts` (agregar al final)
- Modify: `src/lib/social/publish/index.ts`

**Interfaces:**
- Consumes: helpers de Task 2; `PUBLISH_NETWORK_ERROR`, `PUBLISH_REJECTED`, tipos de `./publisher`; `decryptToken`, `encryptToken` de `../crypto`; `getDb, socialAccounts` de `@/db`; `eq` de `drizzle-orm`; `env` de `@/lib/env`; `randomUUID` de `node:crypto`; `type SocialAccount` de `@/db`.
- Produces (usado por Task 4): `youtubePublisher: Publisher` con `network: 'youtube'` y `ensureCredential` propio; registrado en `PUBLISHERS`.

Sin test unitario nuevo: orquestación HTTP y refresh siguen el trato de los connectors; las ramas viven en los helpers de Task 2. Verificación por typecheck, lint y suite.

- [ ] **Step 1: El contrato gana la credencial opcional**

En `src/lib/social/publish/publisher.ts`, el tipo `Publisher` pasa a (agregando
`import type { SocialAccount } from '@/db'` junto al import existente):

```ts
export type Publisher = {
  network: string
  /** Write credential, when it differs from the connector's read credential. */
  ensureCredential?(account: SocialAccount): Promise<string | null>
  publish(input: PublishInput): Promise<PublishOutcome>
}
```

- [ ] **Step 2: Implementación del publisher**

Agregar a `src/lib/social/publish/youtube.ts` (con los imports de Interfaces arriba del archivo):

```ts
const REFRESH_WINDOW_MS = 5 * 60 * 1000

/**
 * The write credential: OAuth, not the read-side API key. Refreshes itself when the
 * hourly token is about to die — Google's refresh answer carries no new refresh token,
 * so the stored one survives — and re-encrypts what it saves, like every credential
 * in this repo.
 */
async function ensureYoutubeCredential(account: SocialAccount): Promise<string | null> {
  if (!account.accessToken || !account.refreshToken) return null
  const token = decryptToken(account.accessToken)

  const stillValid =
    account.expiresAt && account.expiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS
  if (stillValid) return token

  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return token

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decryptToken(account.refreshToken),
    }),
  })
  if (!response.ok) {
    console.error('Google refresh:', response.status, (await response.text()).slice(0, 300))
    return null
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  await getDb()
    .update(socialAccounts)
    .set({
      accessToken: encryptToken(data.access_token),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    })
    .where(eq(socialAccounts.id, account.id))

  return data.access_token
}

const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart'

export const youtubePublisher: Publisher = {
  network: 'youtube',
  ensureCredential: ensureYoutubeCredential,

  async publish(input: PublishInput): Promise<PublishOutcome> {
    // Resuming: the video is uploaded and YouTube is still processing it.
    if (input.containerId) {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=status&id=${input.containerId}`,
        { headers: { Authorization: `Bearer ${input.token}` } },
      )
      if (!response.ok) {
        console.error('YouTube video status:', response.status, (await response.text()).slice(0, 300))
        return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
      }
      const verdict = classifyUploadStatus(await response.json())
      if (verdict === 'error') return { kind: 'failed', reason: PUBLISH_REJECTED }
      if (verdict === 'processing') return { kind: 'processing', containerId: input.containerId }
      return { kind: 'published', externalId: input.containerId }
    }

    const video = singleVideo(input.media)
    if (!video) return { kind: 'failed', reason: YOUTUBE_ONLY_VIDEO }

    const blob = await fetch(video.url)
    if (!blob.ok) {
      console.error('No se pudo leer el video del Blob:', blob.status)
      return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const boundary = `frontera-${randomUUID()}`
    const response = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: youtubeUploadBody(JSON.stringify(youtubeMetadata(input.caption)), bytes, boundary),
    })
    if (!response.ok) {
      console.error('YouTube upload:', response.status, (await response.text()).slice(0, 300))
      return { kind: 'failed', reason: PUBLISH_REJECTED }
    }
    const data = (await response.json()) as { id?: string }
    if (typeof data.id !== 'string') return { kind: 'failed', reason: PUBLISH_REJECTED }
    return { kind: 'processing', containerId: data.id }
  },
}
```

- [ ] **Step 3: El registro**

En `src/lib/social/publish/index.ts`:

```ts
import { youtubePublisher } from './youtube'
```

y `PUBLISHERS` pasa a `[instagramPublisher, facebookPublisher, youtubePublisher]`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/lib/social/publish/ && npm run typecheck && npm run lint`
Expected: PASS los tres.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/publisher.ts src/lib/social/publish/youtube.ts src/lib/social/publish/index.ts
git commit -m "Sube el video a YouTube con refresh propio del token de Google"
```

---

### Task 4: Contrato, orquestador, UI y verificación final

**Files:**
- Modify: `src/lib/social/publish/run.ts` (la resolución de credencial)
- Modify: `src/app/admin/(dash)/schedule/composer.tsx` (ENABLED)
- Modify: `src/lib/posts.ts:261` (OAUTH_NETWORKS)
- Modify: `README.md` (dos filas de env)

**Interfaces:**
- Consumes: `youtubePublisher.ensureCredential` (Task 3); `type SocialAccount` de `@/db`.
- Produces: el orquestador usa la credencial del publisher cuando existe; la card y el checkbox de YouTube activos.

Sin test unitario nuevo (la preferencia es una expresión; las ramas reales ya están testeadas). Verificación final completa.

- [ ] **Step 1: El orquestador**

En `run.ts`, `attempt()` reemplaza:

```ts
  const connector = CONNECTORS.find((c) => c.network === network)
  if (!publisher || !connector) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }
```
y
```ts
  const token = account ? await connector.ensureCredential(account) : null
```

por:

```ts
  if (!publisher) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }
  // The publisher's own credential wins: YouTube reads with an API key but writes
  // with OAuth, and the read connector must not learn about writing.
  const connector = CONNECTORS.find((c) => c.network === network)
  const ensure = publisher.ensureCredential ?? connector?.ensureCredential
  if (!ensure) return { kind: 'failed', reason: NO_PUBLISH_TOKEN }
```
y
```ts
  const token = account ? await ensure(account) : null
```

- [ ] **Step 2: UI y README**

- `composer.tsx`: `ENABLED` pasa a `new Set(['instagram', 'facebook', 'youtube'])` y su
  comentario a `// Phases 1–3 publish; the rest of the checkboxes exist but wait.`
- `src/lib/posts.ts:261`: `OAUTH_NETWORKS` gana `'youtube'` y el comentario de la línea
  260 (que dice que YouTube es la red configurada por entorno) se reemplaza por:
  `// TikTok is the one network left without a publisher; YouTube reads by env but writes by OAuth.`
- `README.md`, tabla de env, dos filas nuevas junto a las de Meta:

```markdown
| `GOOGLE_CLIENT_ID` | Conectar YouTube para publicar (OAuth de Google) | El OAuth Client tipo Web del mismo proyecto de la API key |
| `GOOGLE_CLIENT_SECRET` | El secreto de ese OAuth Client | Junto con el anterior; el sync de solo lectura sigue usando `YOUTUBE_API_KEY` |
```

- [ ] **Step 3: Verificación final completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS los cuatro (181 tests: 171 + 10 nuevos).

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/publish/run.ts "src/app/admin/(dash)/schedule/composer.tsx" src/lib/posts.ts README.md
git commit -m "Prefiere la credencial del publisher y habilita YouTube en el compositor"
```

---

## Notas para el ejecutor

- **Orden**: 1→4 es dependencia real. La Task 1 no depende de las otras pero comparte
  la fase; secuencial.
- **`Credential` y `OAuthError`** ya existen en `callback/route.ts` — mirar los
  credentials vecinos (`facebookCredential`) para el estilo.
- **`randomUUID`**: importarlo de `node:crypto` en `youtube.ts` (Task 3).
- **El sync de YouTube no se toca**: `src/lib/social/youtube.ts` (connector) queda
  intacto; el publisher vive en `src/lib/social/publish/youtube.ts`.
- **Probar en Testing**: mientras Google no apruebe la verificación, el consentimiento
  solo funciona para el dueño (test user) y el refresh token muere a los 7 días — es
  el estado esperado, no un bug.
- **AGENTS.md**: si `next dev`/`build` re-agrega su bloque, commitearlo junto está bien.
