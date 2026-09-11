# Multicuentas 2: conectar varias cuentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que conectar una red sume cuentas en vez de reemplazarlas: cuando Meta o Google devuelven varias candidatas, el panel deja elegir cuáles; la pestaña nueva **Cuentas** agrupa por red, con «Agregar cuenta», Reconectar y Desconectar por cuenta.

**Architecture:** El callback de OAuth deja de elegir una cuenta y pasa a devolver **candidatas**. Una candidata se guarda directo; varias viajan en una cookie cifrada de diez minutos hasta `/admin/accounts/elegir`, donde una server action crea una fila por elegida. Un helper `guardarCuenta` (upsert por red e id externo) lo comparte todo. La sincronización pasa a correr las redes en paralelo y las cuentas de una misma red en serie.

**Tech Stack:** Next.js App Router (server components, server actions, `cookies()`), Drizzle + Neon, Vitest, la capa de cifrado ya existente (`src/lib/social/crypto.ts`).

**Spec:** `docs/superpowers/specs/2026-09-10-multicuentas-design.md` (secciones 3, 4 y 5, y la tabla de entregas). Entrega 1 ya en producción (PR #70/#71, esquema final aplicado el 2026-09-10).

Rama: `multicuentas-2`, nacida de `main`.

## Global Constraints

- Frases fijas en español en lo visible; upstream solo a `console.error` truncado a 300. Nuevas: `El login venció. Vuelve a conectar.`, `Elige al menos una cuenta.`, `N cuentas conectadas.` (con N ≥ 2) y `<red> conectado.` (una).
- La identidad de una cuenta es `(network, external_id)`. Reconectar la misma cuenta renueva su token; un id nuevo crea una fila. `mayConnectAccount` y las variables `INSTAGRAM_IG_USER_ID` y `FACEBOOK_PAGE_ID` desaparecen.
- La cookie `conexion-pendiente`: httpOnly, secure, sameSite lax, `maxAge` 600, `path` `/admin/accounts`, contenido cifrado con `encryptToken` de `crypto.ts`. **Nunca lleva tokens de página de Facebook**: los vuelve a pedir la selección con el token de usuario, para que la cookie quepa (4 KB) aunque haya diez páginas.
- Un login con cero candidatas falla con la frase fija de esa red (`NO_INSTAGRAM_ACCOUNT`, `NO_FACEBOOK_PAGE`, `Esta cuenta de Google no tiene canal de YouTube.`).
- La sincronización: redes en paralelo, cuentas de la misma red **en serie** (la casa nunca ha pegado concurrente contra Meta: `run.ts` lo dice).
- `cuentasPrimarias` solo cuenta filas **con credencial** (`access_token` no nulo): una cuenta desconectada no recibe destinos.
- El respaldo por red de `run.ts` se retira (el backfill de producción ya corrió).
- Comentarios solo para lo que el código no muestra, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado, jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/social/instagram.ts`, `facebook.ts` | `listInstagramAccounts`, `listFacebookPages` (todas las candidatas) en vez de `pick*` |
| `src/lib/social/pendiente.ts` | lo puro de la cookie: serializar, leer, `elegidas` |
| `src/lib/social/conectar.ts` | `guardarCuenta` (upsert) y `tokensDePaginas` (Graph) |
| `src/lib/social/connector.ts` | sale `mayConnectAccount` |
| `src/app/api/social/[network]/callback/route.ts` | candidatas → guardar o cookie + redirect |
| `src/app/admin/(dash)/accounts/elegir/page.tsx` | la pantalla «¿Cuáles conectar?» |
| `src/app/admin/actions.ts` | `conectarElegidas`, `disconnectAccount`; sale `disconnectNetwork` |
| `src/lib/posts.ts`, `src/lib/posts-kpis.ts` | `getCuentas` / `CuentaRow` en vez de `getConnections` / `ConnectionRow` |
| `src/app/admin/(dash)/accounts/page.tsx`, `cuentas.tsx` | la pestaña Cuentas |
| `src/app/admin/(dash)/content/page.tsx`, `nav.tsx` | Contenido sin conexiones; pestaña nueva |
| `src/lib/social/cuenta.ts`, `cuentas.ts`, `sync.ts`, `publish/run.ts` | `agruparPorRed`, credencial obligatoria, serie por red, sin respaldo |
| `README.md`, `.env.example` | conectar varias; variables retiradas |

---

### Task 1: Todas las candidatas, y lo puro de la conexión pendiente

**Files:**
- Modify: `src/lib/social/instagram.ts`, `src/lib/social/facebook.ts`, `src/lib/social/connector.ts`
- Create: `src/lib/social/pendiente.ts`
- Test: `src/lib/social/instagram.test.ts`, `src/lib/social/facebook.test.ts`, `src/lib/social/connector.test.ts`, `src/lib/social/pendiente.test.ts`

**Interfaces:**
- Produces (Task 2): `listInstagramAccounts(pages: FacebookPages): InstagramAccount[]`; `listFacebookPages(pages: FacebookPagesList): FacebookPage[]`; `NO_INSTAGRAM_ACCOUNT`, `NO_FACEBOOK_PAGE` siguen. Desaparecen `pickInstagramAccount`, `pickFacebookPage`, `InstagramAccountError`, `FacebookPageError`, `AMBIGUOUS_*`, `PINNED_*`, `pinnedAccountMissingMessage`, `pinnedPageMissingMessage`, `mayConnectAccount`.
- Produces (Tasks 2-3), de `pendiente.ts`: `type Candidata = { externalId: string; handle: string | null }`; `type ConexionPendiente = { network: string; accessToken: string; refreshToken: string | null; expiresAt: string | null; candidatas: Candidata[] }`; `COOKIE_PENDIENTE = 'conexion-pendiente'`; `PENDIENTE_MAX_AGE = 600`; `LOGIN_VENCIDO`; `serializarPendiente(p): string`; `leerPendiente(raw: string | undefined): ConexionPendiente | null`; `elegidas(candidatas, ids: string[]): Candidata[]`.

- [x] **Step 1: Tests que fallan**

En `src/lib/social/instagram.test.ts` reemplaza el `describe('pickInstagramAccount', …)` entero por:

```ts
describe('listInstagramAccounts', () => {
  it('devuelve todas las cuentas ligadas a alguna página, en el orden de Meta', () => {
    const pages: FacebookPages = {
      data: [
        { id: '1', name: 'Personal', instagram_business_account: { id: '17841400000000101', username: 'vicente' } },
        { id: '2', name: 'Sin IG' },
        { id: '3', name: 'Gimnasio', instagram_business_account: { id: '17841400000000102' } },
      ],
    }
    expect(listInstagramAccounts(pages)).toEqual([
      { id: '17841400000000101', username: 'vicente' },
      { id: '17841400000000102', username: null },
    ])
  })

  it('sin páginas con Instagram devuelve la lista vacía: el llamador decide la frase', () => {
    expect(listInstagramAccounts({ data: [{ id: '1' }] })).toEqual([])
    expect(listInstagramAccounts({})).toEqual([])
  })
})
```

(Ajusta el import: entra `listInstagramAccounts`, salen `pickInstagramAccount`, `InstagramAccountError`, `AMBIGUOUS_INSTAGRAM_ACCOUNT`, `PINNED_INSTAGRAM_ACCOUNT_MISSING`. Conserva `NO_INSTAGRAM_ACCOUNT` si algún test lo usa.)

En `src/lib/social/facebook.test.ts` reemplaza el `describe('pickFacebookPage', …)` entero por:

```ts
describe('listFacebookPages', () => {
  it('devuelve todas las páginas con id, con nombre y token cuando vienen', () => {
    const pages: FacebookPagesList = {
      data: [
        { id: '61550000000001', name: 'Ribs', access_token: 'T1' },
        { id: '61550000000002' },
        { name: 'sin id' },
      ],
    }
    expect(listFacebookPages(pages)).toEqual([
      { id: '61550000000001', name: 'Ribs', accessToken: 'T1' },
      { id: '61550000000002', name: null, accessToken: null },
    ])
  })

  it('sin páginas devuelve la lista vacía', () => {
    expect(listFacebookPages({ data: [] })).toEqual([])
    expect(listFacebookPages({})).toEqual([])
  })
})
```

(Import: entra `listFacebookPages`; salen `pickFacebookPage`, `FacebookPageError`, `AMBIGUOUS_FACEBOOK_PAGE`, `PINNED_FACEBOOK_PAGE_MISSING`.)

Borra `src/lib/social/connector.test.ts` entero si solo prueba `mayConnectAccount` (verifícalo); si tiene más, quita solo ese `describe`.

Crea `src/lib/social/pendiente.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { COOKIE_PENDIENTE, PENDIENTE_MAX_AGE, elegidas, leerPendiente, serializarPendiente } from './pendiente'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
})

const pendiente = {
  network: 'facebook',
  accessToken: 'USER-TOKEN',
  refreshToken: null,
  expiresAt: '2026-11-09T00:00:00.000Z',
  candidatas: [
    { externalId: '61550000000001', handle: 'Ribs' },
    { externalId: '61550000000002', handle: null },
  ],
}

describe('serializarPendiente / leerPendiente', () => {
  it('ida y vuelta cifrada', () => {
    const raw = serializarPendiente(pendiente)
    expect(raw).not.toContain('USER-TOKEN')
    expect(leerPendiente(raw)).toEqual(pendiente)
  })

  it('basura, vacío, ausente o manipulado dan null, nunca lanzan', () => {
    expect(leerPendiente(undefined)).toBeNull()
    expect(leerPendiente('')).toBeNull()
    expect(leerPendiente('no-es-una-cookie')).toBeNull()
    const raw = serializarPendiente(pendiente)
    expect(leerPendiente(raw.slice(0, -4) + 'AAAA')).toBeNull()
  })

  it('un payload cifrado con otra forma también da null', () => {
    const { encryptToken } = require('./crypto') as typeof import('./crypto')
    expect(leerPendiente(encryptToken(JSON.stringify({ network: 'x' })))).toBeNull()
    expect(leerPendiente(encryptToken(JSON.stringify({ ...pendiente, candidatas: [{ handle: 'sin id' }] })))).toBeNull()
  })

  it('la cookie tiene nombre y vida fijos', () => {
    expect(COOKIE_PENDIENTE).toBe('conexion-pendiente')
    expect(PENDIENTE_MAX_AGE).toBe(600)
  })
})

describe('elegidas', () => {
  it('filtra por id conservando el orden de las candidatas y sin repetir', () => {
    expect(elegidas(pendiente.candidatas, ['61550000000002', '61550000000001', '61550000000002'])).toEqual([
      { externalId: '61550000000001', handle: 'Ribs' },
      { externalId: '61550000000002', handle: null },
    ])
  })

  it('un id que no es candidata se ignora: no se conecta lo que Meta no listó', () => {
    expect(elegidas(pendiente.candidatas, ['999'])).toEqual([])
  })
})
```

- [x] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/instagram.test.ts src/lib/social/facebook.test.ts src/lib/social/pendiente.test.ts`
Expected: FAIL — las funciones nuevas no existen.

- [x] **Step 3: Implementar**

`src/lib/social/instagram.ts`: quita `InstagramAccountError`, `AMBIGUOUS_INSTAGRAM_ACCOUNT`, `PINNED_INSTAGRAM_ACCOUNT_MISSING`, `pinnedAccountMissingMessage` y `pickInstagramAccount`; conserva `FacebookPages`, `InstagramAccount`, `NO_INSTAGRAM_ACCOUNT`; agrega:

```ts
/**
 * Todas las cuentas de Instagram ligadas a alguna página del login, en el orden de
 * Meta. Ya no se elige acá: el panel muestra la lista y el dueño marca cuáles conectar.
 * Vacía cuando ninguna página trae cuenta; el llamador pone la frase.
 */
export function listInstagramAccounts(pages: FacebookPages): InstagramAccount[] {
  const cuentas: InstagramAccount[] = []
  for (const page of pages.data ?? []) {
    const linked = page.instagram_business_account
    if (linked?.id) cuentas.push({ id: linked.id, username: linked.username ?? null })
  }
  return cuentas
}
```

`src/lib/social/facebook.ts`: quita `FacebookPageError`, `AMBIGUOUS_FACEBOOK_PAGE`, `PINNED_FACEBOOK_PAGE_MISSING`, `pinnedPageMissingMessage` y `pickFacebookPage`; conserva `FacebookPageEntry`, `FacebookPagesList`, `FacebookPage`, `NO_FACEBOOK_PAGE`; agrega:

```ts
/** Todas las páginas administrables, con el token de cada una cuando Meta lo entrega. */
export function listFacebookPages(pages: FacebookPagesList): FacebookPage[] {
  const candidatas: FacebookPage[] = []
  for (const page of pages.data ?? []) {
    if (page.id) candidatas.push({ id: page.id, name: page.name ?? null, accessToken: page.access_token ?? null })
  }
  return candidatas
}
```

`src/lib/social/connector.ts`: quita `mayConnectAccount` y su doc.

`src/lib/social/pendiente.ts`:

```ts
// Lo puro de una conexión a medias: el login ya pasó, el dueño todavía no eligió qué
// cuentas conectar. Viaja en una cookie cifrada de diez minutos y muere sola.
import { decryptToken, encryptToken } from './crypto'

export type Candidata = { externalId: string; handle: string | null }

export type ConexionPendiente = {
  network: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  candidatas: Candidata[]
}

export const COOKIE_PENDIENTE = 'conexion-pendiente'
/** Lo que dura un login a medias: el tiempo de leer una lista y marcar casillas. */
export const PENDIENTE_MAX_AGE = 600
export const LOGIN_VENCIDO = 'El login venció. Vuelve a conectar.'

export function serializarPendiente(pendiente: ConexionPendiente): string {
  return encryptToken(JSON.stringify(pendiente))
}

function esCandidata(value: unknown): value is Candidata {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return typeof c.externalId === 'string' && c.externalId !== '' && (c.handle === null || typeof c.handle === 'string')
}

/** Null ante cualquier duda: cookie ausente, vencida, manipulada o con otra forma. */
export function leerPendiente(raw: string | undefined): ConexionPendiente | null {
  if (!raw) return null
  try {
    const p = JSON.parse(decryptToken(raw)) as Record<string, unknown>
    if (typeof p.network !== 'string' || typeof p.accessToken !== 'string') return null
    if (p.refreshToken !== null && typeof p.refreshToken !== 'string') return null
    if (p.expiresAt !== null && typeof p.expiresAt !== 'string') return null
    if (!Array.isArray(p.candidatas) || !p.candidatas.every(esCandidata)) return null
    return {
      network: p.network,
      accessToken: p.accessToken,
      refreshToken: p.refreshToken,
      expiresAt: p.expiresAt,
      candidatas: p.candidatas,
    }
  } catch {
    return null
  }
}

/** Las candidatas marcadas, en el orden de la lista y sin repetir: nada que Meta no listó. */
export function elegidas(candidatas: Candidata[], ids: string[]): Candidata[] {
  const marcadas = new Set(ids)
  return candidatas.filter((c) => marcadas.has(c.externalId))
}
```

- [x] **Step 4: Verde y commit**

Run: `npx vitest run src/lib/social && npm run typecheck`
Expected: los tests de social pasan; **el typecheck falla** en `callback/route.ts` porque todavía importa lo retirado. Es lo esperado: Task 2 lo arregla. Commitea igual esta tarea (el repo queda verde al cerrar Task 2).

```bash
git add src/lib/social/instagram.ts src/lib/social/instagram.test.ts src/lib/social/facebook.ts src/lib/social/facebook.test.ts src/lib/social/connector.ts src/lib/social/pendiente.ts src/lib/social/pendiente.test.ts
git rm -q src/lib/social/connector.test.ts   # solo si quedó vacío
git commit -m "Lista todas las candidatas de Meta y define la conexión pendiente"
```

---

### Task 2: El callback devuelve candidatas

**Files:**
- Create: `src/lib/social/conectar.ts`
- Modify: `src/app/api/social/[network]/callback/route.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (Task 3): de `conectar.ts`, `type CuentaAConectar = { externalId: string; handle: string | null; accessToken: string; refreshToken: string | null; expiresAt: Date | null }`; `guardarCuenta(network: string, cuenta: CuentaAConectar): Promise<void>`; `tokensDePaginas(userToken: string): Promise<Map<string, string>>`.

- [x] **Step 1: `conectar.ts`**

```ts
// src/lib/social/conectar.ts
// Guardar una cuenta conectada, compartido por el callback (una candidata) y la
// selección (varias). Sin `server-only`: lo importa una server action.
import { getDb, socialAccounts } from '@/db'
import { encryptToken } from './crypto'

export type CuentaAConectar = {
  externalId: string
  handle: string | null
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

/** Upsert por (red, id externo): la misma cuenta renueva su token; un id nuevo es una fila nueva. */
export async function guardarCuenta(network: string, cuenta: CuentaAConectar): Promise<void> {
  const valores = {
    handle: cuenta.handle,
    accessToken: encryptToken(cuenta.accessToken),
    refreshToken: cuenta.refreshToken ? encryptToken(cuenta.refreshToken) : null,
    expiresAt: cuenta.expiresAt,
    lastSyncError: null,
  }
  await getDb()
    .insert(socialAccounts)
    .values({ network, externalId: cuenta.externalId, ...valores })
    .onConflictDoUpdate({ target: [socialAccounts.network, socialAccounts.externalId], set: valores })
}

const GRAPH = 'https://graph.facebook.com/v23.0'

/**
 * Página → token de página, pedido con el token de usuario. La cookie de conexión
 * pendiente no lleva estos tokens (no cabrían con diez páginas), así que la selección
 * los vuelve a pedir; Meta los entrega en cada llamada.
 */
export async function tokensDePaginas(userToken: string): Promise<Map<string, string>> {
  const response = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&access_token=${userToken}`)
  if (!response.ok) throw new Error(`me/accounts ${response.status}`)
  const body = (await response.json()) as { data?: Array<{ id?: string; access_token?: string }> }
  const tokens = new Map<string, string>()
  for (const page of body.data ?? []) {
    if (page.id && page.access_token) tokens.set(page.id, page.access_token)
  }
  return tokens
}
```

- [x] **Step 2: El callback**

En `src/app/api/social/[network]/callback/route.ts`:

1. Imports: quita `mayConnectAccount`, `encryptToken`, `FacebookPageError`, `pickFacebookPage`, `InstagramAccountError`, `pickInstagramAccount`, `eq`, `getDb`, `socialAccounts`. Agrega:
```ts
import { NO_FACEBOOK_PAGE, listFacebookPages, type FacebookPagesList } from '@/lib/social/facebook'
import { NO_INSTAGRAM_ACCOUNT, instagramTokenExpiry, listInstagramAccounts, type FacebookPages } from '@/lib/social/instagram'
import { guardarCuenta } from '@/lib/social/conectar'
import { COOKIE_PENDIENTE, PENDIENTE_MAX_AGE, serializarPendiente } from '@/lib/social/pendiente'
```
2. `Credential` pasa a:
```ts
type Candidata = { externalId: string; handle: string | null; accessToken?: string }
type Credential = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  /** Lo que el login dejó elegir: una para la mayoría de redes, varias en Meta y Google. */
  candidatas: Candidata[]
}
```
3. `instagramCredential`: tras leer `pages`, reemplaza el bloque `let igAccount … throw new OAuthError(error.message)` y el `return` por:
```ts
  const cuentas = listInstagramAccounts((await pages.json()) as FacebookPages)
  if (cuentas.length === 0) throw new OAuthError(NO_INSTAGRAM_ACCOUNT)
  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: instagramTokenExpiry(exchanged.expiresIn),
    candidatas: cuentas.map((c) => ({ externalId: c.id, handle: c.username ? `@${c.username}` : null })),
  }
```
4. `facebookCredential`: reemplaza desde `let page` hasta el `return` por:
```ts
  const paginas = listFacebookPages((await pages.json()) as FacebookPagesList)
  if (paginas.length === 0) throw new OAuthError(NO_FACEBOOK_PAGE)
  return {
    // El token de usuario queda como base; el de cada página viaja en su candidata (una
    // sola) o se vuelve a pedir en la selección (varias). Derivados de un token largo,
    // los de página no expiran: por eso expiresAt null y no una fecha inventada.
    accessToken: exchanged.accessToken,
    refreshToken: null,
    expiresAt: null,
    candidatas: paginas.map((p) => ({ externalId: p.id, handle: p.name, accessToken: p.accessToken ?? undefined })),
  }
```
5. `youtubeCredential`: reemplaza `const channel = data.items?.[0] … return {…}` por:
```ts
  const canales = (data.items ?? []).filter((c): c is { id: string; snippet?: { title?: string } } => Boolean(c.id))
  if (canales.length === 0) throw new OAuthError('Esta cuenta de Google no tiene canal de YouTube.')
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    candidatas: canales.map((c) => ({ externalId: c.id, handle: c.snippet?.title ?? null })),
  }
```
6. `threadsCredential`, `xCredential`, `tiktokCredential`: el `return` pasa a `candidatas: [{ externalId: <id>, handle: <handle> }]` en vez de `externalId`/`handle` sueltos. En TikTok, `open_id` ausente lanza `OAuthError('TikTok no devolvió el id de la cuenta. Vuelve a conectar.')` en vez de guardar null.
7. En `GET`: `back` redirige a `/admin/accounts?mensaje=…` (ya no a `/admin/content`). Reemplaza todo el bloque desde `// La identidad de una cuenta es (red, id externo)` hasta el `return back(\`${network} conectado.\`)` por:
```ts
    if (credential.candidatas.length === 1) {
      const [unica] = credential.candidatas
      await guardarCuenta(network, {
        externalId: unica!.externalId,
        handle: unica!.handle,
        // Facebook publica y lee con el token de la página, no con el del usuario.
        accessToken: unica!.accessToken ?? credential.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: credential.expiresAt,
      })
      return back(`${network} conectado.`)
    }

    // Varias candidatas: el dueño elige en el panel. El token de usuario y la lista
    // viajan cifrados en una cookie corta; los tokens de página no (no cabrían).
    const response = NextResponse.redirect(`${url.origin}/admin/accounts/elegir?red=${network}`)
    response.cookies.set(
      COOKIE_PENDIENTE,
      serializarPendiente({
        network,
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
        candidatas: credential.candidatas.map(({ externalId, handle }) => ({ externalId, handle })),
      }),
      { httpOnly: true, secure: true, sameSite: 'lax', maxAge: PENDIENTE_MAX_AGE, path: '/admin/accounts' },
    )
    return response
```
   El guard de id externo nulo desaparece: cada rama ya garantiza `externalId` string.

- [x] **Step 3: Verificar y commitear**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/social`
Expected: verde (el typecheck vuelve a pasar).

```bash
git add src/lib/social/conectar.ts "src/app/api/social/[network]/callback/route.ts"
git commit -m "El callback guarda la única candidata o deja elegir entre varias"
```

---

### Task 3: La pantalla de selección y su acción

**Files:**
- Create: `src/app/admin/(dash)/accounts/elegir/page.tsx`
- Modify: `src/app/admin/actions.ts` (nueva `conectarElegidas`)

**Interfaces:**
- Consumes: Task 1 (`leerPendiente`, `elegidas`, `COOKIE_PENDIENTE`, `LOGIN_VENCIDO`), Task 2 (`guardarCuenta`, `tokensDePaginas`).
- Produces: `conectarElegidas(formData: FormData): Promise<void>` (server action que redirige).

- [x] **Step 1: La acción**

En `src/app/admin/actions.ts`, imports: `cookies` de `next/headers` (ya importa `headers`), `guardarCuenta`, `tokensDePaginas` de `@/lib/social/conectar`, `COOKIE_PENDIENTE`, `LOGIN_VENCIDO`, `elegidas`, `leerPendiente` de `@/lib/social/pendiente`, `networkLabel` de `@/lib/networks`. Agrega bajo `disconnectNetwork` (que Task 4 reemplaza):

```ts
/**
 * El final de un login con varias candidatas: crea una fila por cuenta marcada. Lee la
 * cookie de nuevo en vez de confiar en el formulario, así lo único que el navegador
 * decide es qué casillas marcó.
 */
export async function conectarElegidas(formData: FormData): Promise<void> {
  await requireAuth()
  const jar = await cookies()
  const pendiente = leerPendiente(jar.get(COOKIE_PENDIENTE)?.value)
  if (!pendiente) redirect(`/admin/accounts?mensaje=${encodeURIComponent(LOGIN_VENCIDO)}`)

  const marcadas = elegidas(pendiente.candidatas, formData.getAll('ids').map(String))
  if (marcadas.length === 0) {
    redirect(`/admin/accounts/elegir?red=${pendiente.network}&mensaje=${encodeURIComponent('Elige al menos una cuenta.')}`)
  }

  // Facebook: el token de cada página no viajó en la cookie; se pide ahora con el de usuario.
  let tokens = new Map<string, string>()
  if (pendiente.network === 'facebook') {
    try {
      tokens = await tokensDePaginas(pendiente.accessToken)
    } catch (error) {
      console.error('tokensDePaginas:', String(error).slice(0, 300))
      redirect(`/admin/accounts?mensaje=${encodeURIComponent('Facebook no entregó el token de la página. Inténtalo de nuevo.')}`)
    }
  }

  for (const cuenta of marcadas) {
    const token = pendiente.network === 'facebook' ? tokens.get(cuenta.externalId) : pendiente.accessToken
    if (!token) {
      redirect(`/admin/accounts?mensaje=${encodeURIComponent('Facebook no entregó el token de la página. Inténtalo de nuevo.')}`)
    }
    await guardarCuenta(pendiente.network, {
      externalId: cuenta.externalId,
      handle: cuenta.handle,
      accessToken: token,
      refreshToken: pendiente.refreshToken,
      expiresAt: pendiente.expiresAt ? new Date(pendiente.expiresAt) : null,
    })
  }

  jar.delete(COOKIE_PENDIENTE)
  revalidatePath('/admin/accounts')
  const mensaje =
    marcadas.length === 1 ? `${networkLabel(pendiente.network)} conectado.` : `${marcadas.length} cuentas conectadas.`
  redirect(`/admin/accounts?mensaje=${encodeURIComponent(mensaje)}`)
}
```

`redirect` lanza, así que los `if` sin `return` son correctos; si el typecheck reclama por `pendiente` posiblemente nulo después del `redirect`, agrega `return` tras cada `redirect` (Next lo trata igual).

- [x] **Step 2: La página**

```tsx
// src/app/admin/(dash)/accounts/elegir/page.tsx
import Link from 'next/link'
import { cookies } from 'next/headers'
import { conectarElegidas } from '@/app/admin/actions'
import { getDb, socialAccounts } from '@/db'
import { networkLabel } from '@/lib/networks'
import { COOKIE_PENDIENTE, LOGIN_VENCIDO, leerPendiente } from '@/lib/social/pendiente'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

/**
 * «¿Cuáles conectar?»: la lista que Meta o Google devolvieron, con casillas. Vive de la
 * cookie de conexión pendiente; sin ella no hay nada que elegir y se vuelve a Cuentas.
 */
export default async function Elegir({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null
  const pendiente = leerPendiente((await cookies()).get(COOKIE_PENDIENTE)?.value)

  if (!pendiente) {
    return (
      <section className="surface rounded-2xl p-6">
        <p className="text-sm">{LOGIN_VENCIDO}</p>
        <Link href="/admin/accounts" className="mt-3 inline-block text-sm text-fg-muted hover:text-fg">
          ← Volver a Cuentas
        </Link>
      </section>
    )
  }

  // «Ya conectada» se decide acá y no en la cookie: la lista de Meta no sabe qué filas tenemos.
  const existentes = new Set(
    (
      await getDb()
        .select({ externalId: socialAccounts.externalId })
        .from(socialAccounts)
        .where(eq(socialAccounts.network, pendiente.network))
    ).map((r) => r.externalId),
  )

  return (
    <section className="surface rounded-2xl p-6">
      <h1 className="font-display text-lg font-semibold">
        ¿Qué cuentas de {networkLabel(pendiente.network)} conectar?
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        Marca las que quieres ver en el panel. Las ya conectadas solo renuevan su acceso.
      </p>
      {mensaje ? <p className="mt-3 text-sm text-red-400">{mensaje}</p> : null}

      <form action={conectarElegidas} className="mt-4 space-y-2">
        {pendiente.candidatas.map((c) => (
          <label key={c.externalId} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
            <input type="checkbox" name="ids" value={c.externalId} defaultChecked={existentes.has(c.externalId)} />
            <span className="flex-1 truncate">{c.handle ?? c.externalId}</span>
            {existentes.has(c.externalId) ? (
              <span className="font-mono text-[0.68rem] text-fg-faint">ya conectada</span>
            ) : null}
          </label>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15]">
            Conectar
          </button>
          <Link href="/admin/accounts" className="text-sm text-fg-faint hover:text-fg">
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  )
}
```

- [x] **Step 3: Verificar y commitear**

Run: `npm run typecheck && npm run lint`
Expected: verde (la ruta `/admin/accounts` de Task 4 aún no existe, pero un `Link` a ella compila).

```bash
git add "src/app/admin/(dash)/accounts/elegir/page.tsx" src/app/admin/actions.ts
git commit -m "Agrega la pantalla para elegir qué cuentas conectar"
```

---

### Task 4: La pestaña Cuentas

**Files:**
- Modify: `src/lib/posts-kpis.ts` (`CuentaRow`), `src/lib/posts.ts` (`getCuentas`), `src/app/admin/actions.ts` (`disconnectAccount`, `syncSocialNow`), `src/app/admin/(dash)/nav.tsx`, `src/app/admin/(dash)/content/page.tsx`
- Create: `src/app/admin/(dash)/accounts/page.tsx`, `src/app/admin/(dash)/accounts/cuentas.tsx`
- Delete: `src/app/admin/(dash)/content/connections.tsx`

**Interfaces:**
- Produces: `type CuentaRow = { id: string; network: string; handle: string | null; externalId: string | null; connected: boolean; lastSyncedAt: string | null; lastSyncError: string | null }`; `getCuentas(): Promise<CuentaRow[]>`; `disconnectAccount(accountId: string): Promise<void>`.

- [x] **Step 1: Tipo y consulta**

En `src/lib/posts-kpis.ts`, reemplaza `ConnectionRow` por:

```ts
export type CuentaRow = {
  id: string
  network: string
  handle: string | null
  /** El id con el que la sincronización pide los posts; a la vista, porque el handle puede engañar. */
  externalId: string | null
  /** Con credencial guardada. La fila sobrevive a un desconectar a propósito. */
  connected: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
}
```

(Si `ConnectionRow` tenía `usesOAuth`, desaparece: hoy las seis redes son OAuth.)

En `src/lib/posts.ts`, reemplaza `getConnections` (y la constante `OAUTH_NETWORKS`) por:

```ts
/** Todas las cuentas, en el orden en que se conectaron; la pestaña Cuentas las agrupa por red. */
export async function getCuentas(): Promise<CuentaRow[]> {
  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .orderBy(asc(socialAccounts.network), asc(socialAccounts.createdAt))
  return cuentas.map((a) => ({
    id: a.id,
    network: a.network,
    handle: a.handle,
    externalId: a.externalId,
    connected: Boolean(a.accessToken),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: a.lastSyncError,
  }))
}
```

(Ajusta imports: `asc` de drizzle si falta; `CuentaRow` en vez de `ConnectionRow`.)

- [x] **Step 2: Acciones**

En `src/app/admin/actions.ts`: reemplaza `disconnectNetwork` por

```ts
export async function disconnectAccount(accountId: string): Promise<void> {
  await requireAuth()
  // Revoca credenciales, no identidad: la fila, sus posts y sus métricas se quedan.
  await getDb()
    .update(socialAccounts)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, lastSyncError: null })
    .where(eq(socialAccounts.id, accountId))
  revalidatePath('/admin/accounts')
}
```

y en `syncSocialNow` cambia `revalidatePath('/admin/content')` por `revalidatePath('/admin/accounts')`.

- [x] **Step 3: La pestaña**

```tsx
// src/app/admin/(dash)/accounts/page.tsx
import { getCuentas } from '@/lib/posts'
import { Cuentas } from './cuentas'

export const dynamic = 'force-dynamic'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // El resultado del último login: una frase, una vez.
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null
  const cuentas = await getCuentas()
  return (
    <>
      {mensaje ? (
        <p className="mb-4 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-muted">{mensaje}</p>
      ) : null}
      <Cuentas rows={cuentas} />
    </>
  )
}
```

```tsx
// src/app/admin/(dash)/accounts/cuentas.tsx
'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { disconnectAccount, syncSocialNow } from '@/app/admin/actions'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { SOCIAL_NETWORKS } from '@/db/schema'
import type { CuentaRow } from '@/lib/posts-kpis'
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

/** Un bloque por red, una tarjeta por cuenta. Conectar suma; la misma cuenta solo renueva. */
export function Cuentas({ rows }: { rows: CuentaRow[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function sync() {
    startTransition(async () => {
      const result = await syncSocialNow()
      setMessage(result.error ?? 'Listo.')
    })
  }

  return (
    <section className="space-y-6">
      {SOCIAL_NETWORKS.map((network) => {
        const cuentas = rows.filter((r) => r.network === network)
        return (
          <div key={network}>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="font-display text-sm font-semibold">{networkLabel(network)}</h2>
              <a
                href={`/api/social/${network}/connect`}
                className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
              >
                {cuentas.length === 0 ? 'Conectar →' : 'Agregar cuenta →'}
              </a>
            </div>
            {cuentas.length === 0 ? (
              <p className="text-[0.78rem] text-fg-faint">Sin cuentas.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cuentas.map((row) => (
                  <div key={row.id} className="surface rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">{row.handle ?? row.externalId ?? 'Sin nombre'}</span>
                      {row.lastSyncError ? (
                        <AlertTriangle className="h-3.5 w-3.5" style={{ color: NEGATIVE }} aria-hidden />
                      ) : row.connected ? (
                        <Check className="h-3.5 w-3.5" style={{ color: POSITIVE }} aria-hidden />
                      ) : null}
                    </div>
                    {row.externalId ? (
                      <p className="mt-0.5 truncate font-mono text-[0.68rem] text-fg-faint">{row.externalId}</p>
                    ) : null}
                    <p className="mt-0.5 font-mono text-[0.68rem] text-fg-faint">
                      {row.connected ? `Sincronizado ${syncedAgo(row.lastSyncedAt)}` : 'Desconectada'}
                    </p>
                    {row.lastSyncError ? (
                      <p className="mt-2 line-clamp-2 text-[0.72rem]" style={{ color: NEGATIVE }}>
                        {row.lastSyncError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3">
                      <a
                        href={`/api/social/${network}/connect`}
                        className="text-[0.75rem] text-fg-muted transition-colors hover:text-fg"
                      >
                        {row.connected ? 'Reconectar' : 'Conectar →'}
                      </a>
                      {row.connected ? (
                        <button
                          type="button"
                          onClick={() => startTransition(() => disconnectAccount(row.id))}
                          className="text-[0.75rem] text-fg-faint transition-colors hover:text-fg"
                        >
                          Desconectar
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-3">
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

- [x] **Step 4: Nav y Contenido**

`nav.tsx`: agrega `{ href: '/admin/accounts', label: 'Cuentas' }` entre Contenido y Calendario.

`content/page.tsx`: quita el import de `Connections` y de `getConnections`, la llamada a `getConnections()` en el `Promise.all` (y su variable), el bloque `{mensaje ? … }` y la línea `<Connections rows={connections} />`, y la lectura de `mensaje` de `params`. Deja el comentario y la exclusión de `mensaje` en `contentHref` (no hacen daño y un link viejo puede traerlo). Borra `content/connections.tsx`.

- [x] **Step 5: Verificar y commitear**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde.

```bash
git add src/lib/posts-kpis.ts src/lib/posts.ts src/app/admin/actions.ts "src/app/admin/(dash)/nav.tsx" "src/app/admin/(dash)/content/page.tsx" "src/app/admin/(dash)/accounts/page.tsx" "src/app/admin/(dash)/accounts/cuentas.tsx"
git rm -q "src/app/admin/(dash)/content/connections.tsx"
git commit -m "Agrega la pestaña Cuentas: por red, con agregar, reconectar y desconectar por cuenta"
```

---

### Task 5: Sincronización en serie por red, cuentas con credencial, sin respaldo

**Files:**
- Modify: `src/lib/social/cuenta.ts`, `src/lib/social/sync.ts`, `src/lib/social/cuentas.ts`, `src/lib/social/publish/run.ts`
- Test: `src/lib/social/cuenta.test.ts`

- [x] **Step 1: Test que falla**

Agrega a `src/lib/social/cuenta.test.ts`:

```ts
import { agruparPorRed } from './cuenta'

describe('agruparPorRed', () => {
  it('agrupa conservando el orden de llegada dentro de cada red', () => {
    const grupos = agruparPorRed([
      { id: 'a', network: 'facebook' },
      { id: 'b', network: 'instagram' },
      { id: 'c', network: 'facebook' },
    ])
    expect([...grupos.keys()]).toEqual(['facebook', 'instagram'])
    expect(grupos.get('facebook')!.map((c) => c.id)).toEqual(['a', 'c'])
  })
})
```

(Fusiona el import con el existente.)

- [x] **Step 2: Implementar**

`cuenta.ts`:

```ts
/** Red → sus cuentas, en el orden de llegada. */
export function agruparPorRed<T extends { network: string }>(cuentas: T[]): Map<string, T[]> {
  const porRed = new Map<string, T[]>()
  for (const cuenta of cuentas) porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta])
  return porRed
}
```

`sync.ts`, `syncAll`: reemplaza el agrupado a mano y el `Promise.allSettled` sobre cuentas por redes en paralelo y cuentas en serie:

```ts
  const porRed = agruparPorRed(conConector)
  // Redes en paralelo, cuentas de la misma red en serie: la casa nunca pega concurrente
  // contra Meta (ver run.ts), y cinco páginas de Facebook a la vez sería justo eso.
  const porRedResuelto = await Promise.all(
    [...porRed.entries()].map(async ([, cuentas]) => {
      const primaria = primariaDe(cuentas)
      const filas: SyncReport = []
      for (const cuenta of cuentas) {
        try {
          filas.push({ network: cuenta.network, handle: cuenta.handle, ok: true, posts: await syncAccount(cuenta, primaria === cuenta.id) })
        } catch (error) {
          filas.push({ network: cuenta.network, handle: cuenta.handle, ok: false, posts: 0, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return filas
    }),
  )
  return porRedResuelto.flat()
```

(Importa `agruparPorRed`; quita lo que quede sin uso.)

`cuentas.ts`, `cuentasPrimarias`: agrega `isNotNull(socialAccounts.accessToken)` al `where` (con `and`), y en el doc: «Solo cuentas con credencial: una desconectada no puede recibir destinos.»

`run.ts`, `attempt`: quita la rama por red y su comentario; `target.accountId` pasa a `string`; la lectura queda `db.select().from(socialAccounts).where(eq(socialAccounts.id, target.accountId))` con un comentario de una línea: «Por la cuenta del destino: con dos páginas de Facebook, la red no dice cuál.»

- [x] **Step 3: Verificar y commitear**

Run: `npx vitest run src/lib/social && npm run typecheck && npm run lint`

```bash
git add src/lib/social/cuenta.ts src/lib/social/cuenta.test.ts src/lib/social/sync.ts src/lib/social/cuentas.ts src/lib/social/publish/run.ts
git commit -m "Sincroniza las cuentas de una red en serie y exige credencial para ser destino"
```

---

### Task 6: README, `.env.example` y cierre

**Files:**
- Modify: `README.md`, `.env.example`, este plan

- [x] **Step 1: `.env.example`**

Quita la línea `INSTAGRAM_IG_USER_ID=` (y `FACEBOOK_PAGE_ID=` si estuviera).

- [x] **Step 2: README**

1. Sección Instagram: reemplaza el párrafo «Si administras **más de una cuenta de Instagram**…» y su bloque `INSTAGRAM_IG_USER_ID=` por:

```markdown
Si administras **más de una cuenta de Instagram**, al conectar el panel te muestra la
lista y marcas cuáles quieres ver. Cada una queda como una cuenta aparte, con sus
posts y sus métricas. Volver a conectar una que ya está solo renueva su acceso.
```

2. El párrafo «Desconectar borra las credenciales, pero **no olvida qué cuenta era**…» pasa a:

```markdown
Desconectar borra las credenciales de esa cuenta y conserva su historial. Para volver,
**Reconectar** en su tarjeta; para sumar otra cuenta de la misma red, **Agregar
cuenta** en el bloque de la red.
```

3. En la tabla de variables, borra las filas de `INSTAGRAM_IG_USER_ID` y `FACEBOOK_PAGE_ID`.
4. En «Conectar y sincronizar», `/admin/content` pasa a `/admin/accounts` (la pestaña **Cuentas**), y «aprieta *Conectar* en cada tarjeta» a «aprieta *Conectar* en cada red; con varias páginas o cuentas, elige cuáles».
5. La nota junto a `YOUTUBE_CHANNEL_ID` de la entrega 1 («…hasta que la entrega 2 traiga el desconectar por cuenta») pasa a decir que la fila vieja se desconecta desde Cuentas.

- [x] **Step 3: Verificación final y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: verde. Marca `[x]` cada step de este plan.

```bash
git add README.md .env.example docs/superpowers/plans/2026-09-10-multicuentas-2-conectar-varias.md
git commit -m "Documenta cómo conectar varias cuentas y retira las variables que elegían una"
```

El PR apunta a `contenido-presentacion`; sin migración de datos esta vez. Tras la
promoción, el dueño retira `INSTAGRAM_IG_USER_ID` de Vercel si estaba cargada.
