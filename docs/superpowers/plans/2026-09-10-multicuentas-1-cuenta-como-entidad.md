# Multicuentas 1: la cuenta como entidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que posts, métricas de cuenta y destinos programados apunten a una fila de `social_accounts` por `account_id`, que la sincronización y el archivado corran por cuenta, y que el tag de campaña distinga cuentas. Nada visible cambia: sigue habiendo una cuenta por red.

**Architecture:** Tres columnas `account_id` nuevas con sus claves únicas, un backfill determinista (hoy hay exactamente una cuenta por red), y un helper `cuentasPrimarias` que resuelve red → cuenta para los escritores mientras el resto del sistema sigue hablando en redes. La sincronización pasa de «una corrida por conector» a «una corrida por cuenta». Los conectores y publishers no cambian.

**Tech Stack:** Next.js App Router, Drizzle + Neon (`db:push`, sin archivos de migración), Vitest, tsx para el script.

**Spec:** `docs/superpowers/specs/2026-09-10-multicuentas-design.md` (secciones 1, 2 y 5, y la tabla de entregas). Mapa: `docs/superpowers/specs/2026-09-10-multicuentas-mapa.md`.

Rama: `multicuentas`, nacida de `main` con el spec ya commiteado.

## Global Constraints

- Frases fijas en español en lo visible; detalle técnico solo a `console.error` truncado a 300.
- Los tags de campaña ya guardados **no se recalculan nunca**. La primera cuenta de cada red (menor `created_at`) sigue produciendo el tag de hoy (`fb-<id>`); cualquier otra produce `fb-<handle corto>-<id>` con handle corto = primeros ocho caracteres de `normalizeCampaignTag(handle sin @)`, o del id externo de la cuenta si no hay handle.
- `network` se conserva en `social_posts`, `account_metrics` y `scheduled_post_targets` como dato derivado; toda escritura nueva llena **ambos** `network` y `account_id`.
- Claves únicas nuevas, con estos nombres exactos: `social_accounts_network_external_key (network, external_id)`, `social_posts_account_external_key (account_id, external_id)`, `account_metrics_account_day_key (account_id, day)`, `scheduled_post_targets_post_account_key (post_id, account_id)`.
- Migración en dos fases de esquema (Task 1 nullable, Task 7 NOT NULL) con el backfill entre medio. El código de las Tasks 2-6 corre correcto con la fase 1 aplicada, para que el orden «push fase 1 → backfill → deploy → push fase 2» sea seguro.
- Un destino sin cuenta conectada para su red ya no se inserta: los escritores rechazan con `No hay una cuenta de <red> conectada.` (misma frase que usará la entrega 3).
- `server-only` no se importa desde nada que un script de `scripts/` vaya a cargar (tsx lo rompe): lo puro va en `src/lib/social/cuenta.ts` sin ese import; lo de base en `src/lib/social/cuentas.ts` tampoco lo lleva (`src/db` no lo lleva).
- Comentarios solo para restricciones que el código no puede mostrar, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la ejecución**: el runbook del final lo hace el controlador con el dueño, contra producción.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | `account_id` en tres tablas; claves únicas nuevas (Task 1) y retiro de las viejas (Task 7) |
| `src/lib/social/cuenta.ts` | lo puro: `primariaDe`, `planBackfill`, `SIN_CUENTA` |
| `scripts/backfill-cuentas.ts` | el backfill, con `npm run cuentas:backfill` |
| `src/lib/social/campaign.ts` | `campaignTagFor(network, externalId, cuenta?)` |
| `src/lib/social/cuentas.ts` | `cuentasPrimarias(networks)` contra la base |
| `src/lib/social/sync.ts` | `syncAccount`, `syncAll` por cuenta, archivado por cuenta |
| `src/lib/social/publish/crear.ts`, `batch.ts`, `src/app/admin/actions.ts` | destinos con `accountId` |
| `src/lib/social/publish/run.ts` | token por `target.accountId` |
| `src/app/api/social/[network]/callback/route.ts`, `sync.ts` (`ensureYouTubeAccount`) | upsert por `(network, external_id)` |
| `src/app/api/mobile/schedule/route.ts` | frase `No hay una cuenta…` como 400 |

---

### Task 1: Esquema fase 1 y el plan puro del backfill

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/social/cuenta.ts`, `scripts/backfill-cuentas.ts`
- Modify: `package.json` (script `cuentas:backfill`)
- Test: `src/lib/social/cuenta.test.ts`

**Interfaces:**
- Produces: en `schema.ts`, `accountId: uuid('account_id')` (nullable, FK a `socialAccounts.id`) en `socialPosts`, `accountMetrics`, `scheduledPostTargets`; las cuatro claves únicas nuevas de las constraints globales; `socialAccounts.network` **conserva** su `unique()` hasta Task 7.
- Produces: de `cuenta.ts`, `primariaDe(cuentas: Array<{ id: string; createdAt: Date }>): string | null` (el id de la de menor `createdAt`), `planBackfill(cuentas: Array<{ id: string; network: string }>): Map<string, string> | { error: string }`, `SIN_CUENTA(network: string): string`.

- [ ] **Step 1: Test que falla**

```ts
// src/lib/social/cuenta.test.ts
import { describe, expect, it } from 'vitest'
import { SIN_CUENTA, planBackfill, primariaDe } from './cuenta'

describe('primariaDe', () => {
  it('la primaria es la más antigua, no la primera de la lista', () => {
    expect(
      primariaDe([
        { id: 'b', createdAt: new Date('2026-09-01') },
        { id: 'a', createdAt: new Date('2026-08-01') },
      ]),
    ).toBe('a')
  })

  it('sin cuentas no hay primaria', () => {
    expect(primariaDe([])).toBeNull()
  })
})

describe('planBackfill', () => {
  it('con una cuenta por red, mapea red → id', () => {
    expect(
      planBackfill([
        { id: 'ig1', network: 'instagram' },
        { id: 'fb1', network: 'facebook' },
      ]),
    ).toEqual(new Map([['instagram', 'ig1'], ['facebook', 'fb1']]))
  })

  it('se niega si una red tiene más de una cuenta: el backfill no adivina', () => {
    expect(
      planBackfill([
        { id: 'fb1', network: 'facebook' },
        { id: 'fb2', network: 'facebook' },
      ]),
    ).toEqual({ error: 'La red facebook tiene 2 cuentas; el backfill necesita exactamente una.' })
  })
})

describe('SIN_CUENTA', () => {
  it('nombra la red', () => {
    expect(SIN_CUENTA('youtube')).toBe('No hay una cuenta de youtube conectada.')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/social/cuenta.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Lo puro**

```ts
// src/lib/social/cuenta.ts
// Lo puro de «qué cuenta es cuál». Sin `server-only`: lo carga también el script de
// backfill, que corre con tsx fuera de Next.

/** La cuenta primaria de una red es la más antigua: la que ya acuñó tags antes de que hubiera otra. */
export function primariaDe(cuentas: Array<{ id: string; createdAt: Date }>): string | null {
  let primaria: { id: string; createdAt: Date } | null = null
  for (const cuenta of cuentas) {
    if (!primaria || cuenta.createdAt.getTime() < primaria.createdAt.getTime()) primaria = cuenta
  }
  return primaria?.id ?? null
}

/**
 * Red → id de cuenta, solo cuando la respuesta es inequívoca. El backfill asigna filas
 * históricas que no dicen de qué cuenta son; con dos cuentas en una red no hay forma
 * de saberlo, y adivinar mezclaría catálogos.
 */
export function planBackfill(
  cuentas: Array<{ id: string; network: string }>,
): Map<string, string> | { error: string } {
  const porRed = new Map<string, string[]>()
  for (const cuenta of cuentas) {
    porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta.id])
  }
  const plan = new Map<string, string>()
  for (const [network, ids] of porRed) {
    if (ids.length > 1) {
      return { error: `La red ${network} tiene ${ids.length} cuentas; el backfill necesita exactamente una.` }
    }
    plan.set(network, ids[0]!)
  }
  return plan
}

export function SIN_CUENTA(network: string): string {
  return `No hay una cuenta de ${network} conectada.`
}
```

- [ ] **Step 4: Esquema fase 1**

En `src/db/schema.ts`:

1. `socialAccounts`: agrega `unique` al import de drizzle si falta, y convierte la tabla
   a la forma con callback de constraints, **conservando** `.unique()` en `network`:

```ts
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // El unique por red se retira en la fase 2 de la migración (multicuentas 1, Task 7).
    network: text('network').notNull().unique(),
    handle: text('handle'),
    externalId: text('external_id'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('social_accounts_network_external_key').on(t.network, t.externalId)],
)
```

2. `socialPosts`: después de `network`, agrega
   `accountId: uuid('account_id').references(() => socialAccounts.id),` y en el callback
   de constraints agrega `unique('social_posts_account_external_key').on(t.accountId, t.externalId),`
   antes de la unique vieja.
3. `accountMetrics`: igual, `accountId` después de `network` y
   `unique('account_metrics_account_day_key').on(t.accountId, t.day),`.
4. `scheduledPostTargets`: igual, `accountId` después de `network` y
   `unique('scheduled_post_targets_post_account_key').on(t.postId, t.accountId),`.

Actualiza el comentario de `socialAccounts` («One connected network…») a «One connected
account. Several rows can share a network; `(network, external_id)` is the identity.»

- [ ] **Step 5: El script**

```ts
// scripts/backfill-cuentas.ts
/**
 * Fase 2 de la migración a multicuentas: pone `account_id` en cada fila histórica de
 * posts, métricas de cuenta y destinos, apuntando a la única cuenta que hoy existe en
 * su red. Idempotente: solo toca filas con `account_id` nulo. Se niega si una red
 * tiene más de una cuenta.
 *
 * Uso:
 *   npm run cuentas:backfill
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { accountMetrics, getDb, scheduledPostTargets, socialAccounts, socialPosts } from '../src/db'
import { planBackfill } from '../src/lib/social/cuenta'

async function main() {
  const db = getDb()
  const cuentas = await db.select({ id: socialAccounts.id, network: socialAccounts.network }).from(socialAccounts)
  const plan = planBackfill(cuentas)
  if ('error' in plan) {
    console.error(plan.error)
    process.exit(1)
  }

  for (const [network, accountId] of plan) {
    const [posts, metricas, destinos] = await Promise.all([
      db.update(socialPosts).set({ accountId }).where(and(eq(socialPosts.network, network), isNull(socialPosts.accountId))).returning({ id: socialPosts.id }),
      db.update(accountMetrics).set({ accountId }).where(and(eq(accountMetrics.network, network), isNull(accountMetrics.accountId))).returning({ id: accountMetrics.id }),
      db.update(scheduledPostTargets).set({ accountId }).where(and(eq(scheduledPostTargets.network, network), isNull(scheduledPostTargets.accountId))).returning({ id: scheduledPostTargets.id }),
    ])
    console.log(`${network.padEnd(10)} posts ${posts.length}  métricas ${metricas.length}  destinos ${destinos.length}`)
  }

  const conteo = await db.execute(
    sql`select (select count(*) from social_posts where account_id is null)
      + (select count(*) from account_metrics where account_id is null)
      + (select count(*) from scheduled_post_targets where account_id is null) as n`,
  )
  const sinCuenta = Number((conteo.rows[0] as { n?: string | number } | undefined)?.n ?? 0)
  console.log(`\nFilas sin cuenta: ${sinCuenta} (debe ser 0 antes de la fase 2 del esquema)`)
  if (sinCuenta > 0) process.exit(2)
}

main().catch((error) => {
  console.error(String(error).slice(0, 300))
  process.exit(1)
})
```

En `package.json`, junto a `blobs:auditar`:
`"cuentas:backfill": "dotenv -e .env.local -- tsx scripts/backfill-cuentas.ts",`

- [ ] **Step 6: Verde y commit**

Run: `npx vitest run src/lib/social/cuenta.test.ts && npm run typecheck`
Expected: PASS; el typecheck pasa porque `accountId` es opcional y nadie lo escribe todavía.

```bash
git add src/db/schema.ts src/lib/social/cuenta.ts src/lib/social/cuenta.test.ts scripts/backfill-cuentas.ts package.json
git commit -m "Agrega account_id a posts, métricas y destinos, con su backfill"
```

---

### Task 2: El tag de campaña distingue cuentas

**Files:**
- Modify: `src/lib/social/campaign.ts`
- Test: `src/lib/social/campaign.test.ts`

**Interfaces:**
- Produces (Task 3): `type CuentaTag = { primaria: boolean; handle: string | null; externalId: string | null }`; `campaignTagFor(network: string, externalId: string, cuenta?: CuentaTag): string`. Sin `cuenta`, o con `cuenta.primaria === true`, el resultado es idéntico al de hoy.

- [ ] **Step 1: Tests que fallan**

Agrega al final de `src/lib/social/campaign.test.ts`:

```ts
describe('campaignTagFor con cuenta', () => {
  it('la cuenta primaria acuña el tag de siempre', () => {
    expect(
      campaignTagFor('facebook', '123_456', { primaria: true, handle: 'Gimnasio', externalId: '99' }),
    ).toBe('fb-123_456')
  })

  it('una cuenta secundaria mete su handle corto entre el prefijo y el id', () => {
    expect(
      campaignTagFor('facebook', '123_456', { primaria: false, handle: 'Gimnasio Ribs', externalId: '99' }),
    ).toBe('fb-Gimnasio-123_456')
    expect(
      campaignTagFor('instagram', 'C8xK2Lp', { primaria: false, handle: '@vicente_pareja_j', externalId: '17' }),
    ).toBe('ig-vicente_-C8xK2Lp')
  })

  it('sin handle usa el id externo de la cuenta, también recortado a ocho', () => {
    expect(
      campaignTagFor('youtube', 'dQw4w9WgXcQ', { primaria: false, handle: null, externalId: 'UCugxL4FqqBbYHxGmgedfB3w' }),
    ).toBe('yt-UCugxL4F-dQw4w9WgXcQ')
  })

  it('sigue acotado a 48 caracteres', () => {
    expect(
      campaignTagFor('youtube', 'x'.repeat(200), { primaria: false, handle: 'canal', externalId: null }).length,
    ).toBeLessThanOrEqual(48)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/social/campaign.test.ts`
Expected: FAIL — el tercer argumento se ignora.

- [ ] **Step 3: Implementar**

En `src/lib/social/campaign.ts`, reemplaza `campaignTagFor` por:

```ts
export type CuentaTag = { primaria: boolean; handle: string | null; externalId: string | null }

// Ocho caracteres: suficientes para reconocer «gimnasio» de «personal» a ojo, y pocos
// para no comerse el presupuesto de 48 del tag entero.
const HANDLE_CORTO = 8

/**
 * The `?s=` tag a post is born with. Kept short and readable because it ends up
 * pasted by hand into a bio link, and stable because changing it would orphan the
 * traffic already attributed to the old one.
 *
 * Una red puede tener varias cuentas. La primaria (la más antigua) conserva el tag de
 * siempre, porque ya acuñó los suyos; cualquier otra lleva su handle corto para que dos
 * cuentas jamás compartan tag — el tag es la única llave entre un post y sus visitas.
 */
export function campaignTagFor(network: string, externalId: string, cuenta?: CuentaTag): string {
  const prefix = PREFIXES[network] ?? network
  if (!cuenta || cuenta.primaria) return normalizeCampaignTag(`${prefix}-${externalId}`)
  const crudo = cuenta.handle?.replace(/^@/, '') || cuenta.externalId || ''
  const corto = normalizeCampaignTag(crudo).slice(0, HANDLE_CORTO)
  return normalizeCampaignTag(`${prefix}-${corto}-${externalId}`)
}
```

- [ ] **Step 4: Verde y commit**

Run: `npx vitest run src/lib/social/campaign.test.ts src/lib/social/sync.test.ts 2>/dev/null; npx vitest run src/lib/social`
Expected: PASS, todos.

```bash
git add src/lib/social/campaign.ts src/lib/social/campaign.test.ts
git commit -m "Distingue cuentas en el tag de campaña sin tocar los ya acuñados"
```

---

### Task 3: La sincronización corre por cuenta

**Files:**
- Modify: `src/lib/social/sync.ts`
- Modify: `src/app/admin/actions.ts:319-347` (`syncSocialNow`), `src/app/api/cron/sync-social/route.ts` (solo si el tipo del reporte les rompe el typecheck)

**Interfaces:**
- Consumes: `campaignTagFor(network, externalId, cuenta)` (Task 2), `primariaDe` (Task 1), `accountId` en el esquema (Task 1).
- Produces: `syncAccount(account: SocialAccount, primaria: boolean): Promise<number>` reemplaza a `syncNetwork`; `syncAll(): Promise<SyncReport>` con `SyncReport = Array<{ network: string; handle: string | null; ok: boolean; posts: number; error?: string }>`.

- [ ] **Step 1: `insertOrUpdatePost` y `upsertPost` por cuenta**

En `src/lib/social/sync.ts`:

1. Amplía imports: `import { and, asc, eq, inArray, isNull } from 'drizzle-orm'`,
   `import { campaignTagFor, type CuentaTag } from './campaign'`,
   `import { primariaDe } from './cuenta'`.
2. `SyncReport` pasa a `Array<{ network: string; handle: string | null; ok: boolean; posts: number; error?: string }>`.
3. `disambiguatedCampaignTag(network, externalId, cuenta?: CuentaTag)`: llama
   `campaignTagFor(network, externalId, cuenta)` y el hash sigue sobre `${network}:${externalId}`.
4. `insertOrUpdatePost(post, account: SocialAccount, campaign)`: en `values` agrega
   `accountId: account.id` y usa `network: account.network`; el conflict target pasa a
   `[socialPosts.accountId, socialPosts.externalId]`; en `set` agrega `accountId: account.id`
   (una fila vieja que el backfill no alcanzó queda con cuenta al primer sync).
5. `upsertPost(post, account: SocialAccount, cuenta: CuentaTag)`: pasa `cuenta` a ambos
   acuñadores y `account` a `insertOrUpdatePost`.

- [ ] **Step 2: `syncAccount`**

Reemplaza `syncNetwork` entero por:

```ts
export async function syncAccount(account: SocialAccount, primaria: boolean): Promise<number> {
  const db = getDb()
  const connector = connectorFor(account.network)
  if (!connector) throw new Error(`Unknown network ${account.network}`)
  const cuenta: CuentaTag = { primaria, handle: account.handle, externalId: account.externalId }

  try {
    const token = await connector.ensureCredential(account)

    // No credential is not a failure, it is an account the owner disconnected: the row
    // outlives the token on purpose, so a disconnected account still has one to find.
    // Leaving before the writes below is what keeps its card from reading
    // "Sincronizado recién" under a Conectar button.
    if (token === null) return 0

    const { posts: fetched, windowWasCapped } = await connector.fetchPosts(account, token)

    const day = localDay(new Date())
    for (const post of fetched) {
      const id = await upsertPost(post, account, cuenta)
      await writeSnapshot(id, post, day)
    }

    // Extra deliberado: las métricas de cuenta nunca deben tumbar la sincronización
    // de publicaciones que sí funcionó, así que su fallo muere acá mismo.
    if (connector.fetchAccountMetrics) {
      try {
        const values = await connector.fetchAccountMetrics(account, token)
        await db
          .insert(accountMetrics)
          .values({ network: account.network, accountId: account.id, day, ...values })
          .onConflictDoUpdate({
            target: [accountMetrics.accountId, accountMetrics.day],
            set: { ...values, capturedAt: new Date() },
          })
      } catch (error) {
        console.error(`[sync] métricas de cuenta de ${account.network}:`, String(error).slice(0, 300))
      }
    }

    // Solo los posts de ESTA cuenta: con dos cuentas en la misma red, comparar contra
    // toda la red archivaría el catálogo de la otra, que nunca aparece en este fetch.
    const known = await db
      .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(and(eq(socialPosts.accountId, account.id), isNull(socialPosts.archivedAt)))

    // A truncated window is the connector's own answer, not something counted from here:
    // a known post that didn't come back can only be judged deleted once it falls inside
    // the window, and only the connector knows where that edge really is.
    const gone = postsToArchive(known, fetched, windowWasCapped)
    if (gone.length > 0) {
      await db
        .update(socialPosts)
        .set({ archivedAt: new Date() })
        .where(and(eq(socialPosts.accountId, account.id), inArray(socialPosts.externalId, gone)))
    }

    await db
      .update(socialAccounts)
      .set({ lastSyncedAt: new Date(), lastSyncError: null })
      .where(eq(socialAccounts.id, account.id))

    return fetched.length
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // `lastSyncedAt` deliberately untouched: this run fetched nothing, and stamping it
    // would leave the card reading "Sincronizado recién" over an empty day.
    await db
      .update(socialAccounts)
      .set({ lastSyncError: message.slice(0, 500) })
      .where(eq(socialAccounts.id, account.id))
    throw error
  }
}
```

- [ ] **Step 3: `syncAll` itera cuentas**

Reemplaza `syncAll` por:

```ts
/**
 * Every account runs on its own. One that throws leaves its error on its own row and
 * the others still finish and store their snapshot — which is the whole reason it was
 * defensible to take on several integrations at once.
 */
export async function syncAll(): Promise<SyncReport> {
  // Antes del resto y por su cuenta: una base inalcanzable acá no debe costarle el
  // snapshot del día a las demás, así que su fallo se registra y se sigue.
  try {
    await ensureYouTubeAccount()
  } catch (error) {
    console.error('[sync] no se pudo asegurar la cuenta de YouTube:', String(error).slice(0, 300))
  }

  const cuentas = (await getDb()
    .select()
    .from(socialAccounts)
    .orderBy(asc(socialAccounts.createdAt))) as SocialAccount[]
  // Solo las redes con conector: una fila de threads o x se sincroniza el día que
  // exista su conector, no antes.
  const conConector = cuentas.filter((c) => connectorFor(c.network))
  const porRed = new Map<string, SocialAccount[]>()
  for (const cuenta of conConector) porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta])

  const results = await Promise.allSettled(
    conConector.map((cuenta) => syncAccount(cuenta, primariaDe(porRed.get(cuenta.network)!) === cuenta.id)),
  )

  return conConector.map((cuenta, i) => {
    const result = results[i]!
    return result.status === 'fulfilled'
      ? { network: cuenta.network, handle: cuenta.handle, ok: true, posts: result.value }
      : {
          network: cuenta.network,
          handle: cuenta.handle,
          ok: false,
          posts: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }
  })
}
```

`ensureYouTubeAccount` cambia su conflict target a
`[socialAccounts.network, socialAccounts.externalId]` (la unique de Task 1) y mantiene
`set: { externalId: channelId }`. Quita el import de `CONNECTORS` si queda sin uso.

- [ ] **Step 4: Los consumidores del reporte**

`syncSocialNow` en `actions.ts` y el cron solo leen `ok`; con `handle` agregado no
deberían romper. Corre `npm run typecheck`; si algo reclama, ajusta el tipo en el
consumidor sin cambiar su comportamiento. Nada más usa `syncNetwork` (verifícalo con
`grep -rn syncNetwork src`).

- [ ] **Step 5: Verificar y commitear**

Run: `npm run typecheck && npx vitest run src/lib/social && npm run lint`
Expected: verde.

```bash
git add src/lib/social/sync.ts src/app/admin/actions.ts src/app/api/cron/sync-social/route.ts
git commit -m "Sincroniza y archiva por cuenta, no por red"
```

(Incluye `actions.ts` y el cron solo si los tocaste.)

---

### Task 4: Los destinos nacen con cuenta

**Files:**
- Create: `src/lib/social/cuentas.ts`
- Modify: `src/lib/social/publish/crear.ts`, `src/lib/social/publish/batch.ts:295-313`, `src/app/admin/actions.ts:624-628` (creación de destinos en `updateScheduledPost`) y la rama de error de `createScheduledPost`, `src/app/api/mobile/schedule/route.ts` (el `POST`)

**Interfaces:**
- Consumes: `primariaDe`, `SIN_CUENTA` (Task 1).
- Produces: `cuentasPrimarias(networks: string[]): Promise<Map<string, string>>` (red → id de la cuenta primaria; una red sin cuenta no aparece en el mapa); `class SinCuenta extends Error` con `network`.

- [ ] **Step 1: El helper**

```ts
// src/lib/social/cuentas.ts
// La consulta que resuelve red → cuenta mientras el resto del sistema sigue hablando
// en redes. Sin `server-only`: `crear.ts` lo importa y `actions.ts` ya es server.
import { asc, inArray } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { SIN_CUENTA, primariaDe } from './cuenta'

export class SinCuenta extends Error {
  constructor(public readonly network: string) {
    super(SIN_CUENTA(network))
  }
}

/**
 * Red → id de su cuenta primaria (la más antigua), para las redes pedidas. Una red sin
 * fila no aparece: quien escribe decide qué frase dar. Hasta que la entrega 3 traiga
 * `destinos`, «la cuenta de facebook» es esta.
 */
export async function cuentasPrimarias(networks: string[]): Promise<Map<string, string>> {
  if (networks.length === 0) return new Map()
  const filas = await getDb()
    .select({ id: socialAccounts.id, network: socialAccounts.network, createdAt: socialAccounts.createdAt })
    .from(socialAccounts)
    .where(inArray(socialAccounts.network, networks))
    .orderBy(asc(socialAccounts.createdAt))
  const porRed = new Map<string, Array<{ id: string; createdAt: Date }>>()
  for (const fila of filas) porRed.set(fila.network, [...(porRed.get(fila.network) ?? []), fila])
  const resultado = new Map<string, string>()
  for (const [network, cuentas] of porRed) {
    const id = primariaDe(cuentas)
    if (id) resultado.set(network, id)
  }
  return resultado
}

/** Como `cuentasPrimarias`, pero lanza `SinCuenta` a la primera red sin cuenta. */
export async function exigirCuentas(networks: string[]): Promise<Map<string, string>> {
  const cuentas = await cuentasPrimarias(networks)
  for (const network of networks) {
    if (!cuentas.has(network)) throw new SinCuenta(network)
  }
  return cuentas
}
```

- [ ] **Step 2: `crearPostProgramado`**

En `src/lib/social/publish/crear.ts`, importa `exigirCuentas` de `../cuentas` y cambia la
inserción de targets por:

```ts
  // Antes de escribir nada: un post sin cuenta a la que salir no debe quedar a medias.
  const cuentas = await exigirCuentas(input.networks)
  ...
  await db
    .insert(scheduledPostTargets)
    .values(input.networks.map((network) => ({ postId: post!.id, network, accountId: cuentas.get(network)! })))
```

Mueve la llamada a `exigirCuentas` **antes** del insert de `scheduledPosts`, para que un
`SinCuenta` no deje un post sin destinos. Actualiza el doc del helper: «Lanza `SinCuenta`
si una red no tiene cuenta conectada; el llamador la traduce a su frase.»

- [ ] **Step 3: Los llamadores de `crearPostProgramado`**

1. `src/app/admin/actions.ts`, `createScheduledPost`: envuelve la llamada:
```ts
  try {
    await crearPostProgramado({ caption, scheduledAt: scheduledAt!, media: uploaded, networks })
  } catch (error) {
    if (error instanceof SinCuenta) return { error: error.message }
    throw error
  }
```
   (importa `SinCuenta` de `@/lib/social/cuentas`).
2. `src/app/api/mobile/schedule/route.ts`, `POST`: dentro del `try` que ya rodea a
   `crearPostProgramado`, antes del `console.error` genérico:
```ts
    if (dbError instanceof SinCuenta) return NextResponse.json({ error: dbError.message }, { status: 400 })
```

- [ ] **Step 4: El lote**

En `src/lib/social/publish/batch.ts`, en el bucle por item, antes del insert de
`scheduledPosts` (dentro del mismo `try`): `const cuentas = await exigirCuentas(item.redes)`,
y el insert de targets pasa a
`item.redes.map((network) => ({ postId: post!.id, network, accountId: cuentas.get(network)! }))`.
En el `catch` del item, antes del `console.error`:
```ts
      if (error instanceof SinCuenta) {
        results.push({ index, ok: false, error: error.message })
        continue
      }
```

- [ ] **Step 5: El editor**

En `src/app/admin/actions.ts`, `updateScheduledPost`, el bloque `if (targetsPlan.create.length > 0)`:

```ts
  if (targetsPlan.create.length > 0) {
    let cuentas: Map<string, string>
    try {
      cuentas = await exigirCuentas(targetsPlan.create)
    } catch (error) {
      if (error instanceof SinCuenta) return { error: error.message }
      throw error
    }
    await db
      .insert(scheduledPostTargets)
      .values(targetsPlan.create.map((network) => ({ postId, network, accountId: cuentas.get(network)! })))
  }
```

Este bloque corre **después** de las escrituras de post y media, igual que hoy; el
perfil de fallo parcial es el que el comentario de arriba ya acepta.

- [ ] **Step 6: Verificar y commitear**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde (los tests de `batch.test.ts` que insertan no existen; los puros siguen).

```bash
git add src/lib/social/cuentas.ts src/lib/social/publish/crear.ts src/lib/social/publish/batch.ts src/app/admin/actions.ts src/app/api/mobile/schedule/route.ts
git commit -m "Los destinos programados nacen apuntando a una cuenta"
```

---

### Task 5: El publicador toma el token de la cuenta del destino

**Files:**
- Modify: `src/lib/social/publish/run.ts:71-74,126-147`

**Interfaces:**
- Consumes: `scheduledPostTargets.accountId` (Task 1).

- [ ] **Step 1: `attempt` recibe la cuenta**

1. Cambia la firma a `attempt(target: { network: string; accountId: string | null }, targetId, postId, containerId, content)`
   y el llamador en `publishDue` a `attempt(target, target.id, post.id, target.containerId, {...})`.
2. Dentro, `const network = target.network` donde se usaba, y la lectura de la cuenta:

```ts
  // Por la cuenta del destino, no por la red: con dos páginas de Facebook, «la cuenta
  // de facebook» no dice cuál. La rama por red existe solo para filas de antes del
  // backfill y muere con la fase 2 de la migración.
  const [account] = target.accountId
    ? await db.select().from(socialAccounts).where(eq(socialAccounts.id, target.accountId))
    : await db.select().from(socialAccounts).where(eq(socialAccounts.network, target.network))
```

- [ ] **Step 2: Verificar y commitear**

Run: `npm run typecheck && npx vitest run src/lib/social/publish && npm run lint`
Expected: verde.

```bash
git add src/lib/social/publish/run.ts
git commit -m "Publica con el token de la cuenta del destino, no de la red"
```

---

### Task 6: Conectar identifica la cuenta por red e id externo

**Files:**
- Modify: `src/app/api/social/[network]/callback/route.ts:449-468`

- [ ] **Step 1: El upsert**

El `onConflictDoUpdate` del insert en `socialAccounts` pasa de `target: socialAccounts.network`
a `target: [socialAccounts.network, socialAccounts.externalId]`. El guard
`mayConnectAccount` **se queda** en esta entrega (sigue habiendo una cuenta por red; la
entrega 2 lo retira). Agrega encima del insert:

```ts
    // La identidad de una cuenta es (red, id externo), no la red: es lo que permitirá
    // sumar cuentas en la entrega 2. Hoy el guard de arriba sigue dejando pasar una sola.
```

- [ ] **Step 2: Verificar y commitear**

Run: `npm run typecheck && npm run lint`

```bash
git add "src/app/api/social/[network]/callback/route.ts"
git commit -m "Identifica la cuenta conectada por red e id externo"
```

---

### Task 7: Esquema fase 2 y el runbook

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `README.md` (sección de actualización), este plan (marcar pasos)

- [ ] **Step 1: Esquema final**

En `src/db/schema.ts`:
1. `socialAccounts.network`: quita `.unique()` y el comentario de Task 1 sobre la fase 2.
2. En las tres tablas, `accountId` pasa a `.notNull()`.
3. Quita las tres uniques viejas: `social_posts_network_external_key`,
   `account_metrics_network_day_key`, `scheduled_post_targets_post_network_key`.
4. En `run.ts`, quita la rama por red de Task 5 (con `accountId` NOT NULL ya no hay
   filas sin cuenta) y su comentario; `target.accountId` pasa a `string`.

- [ ] **Step 2: El runbook en el README**

En `README.md`, bajo «Conectar y sincronizar» (la sección que dice `npm run db:push`),
agrega:

```markdown
#### Migrar a multicuentas (una vez, 2026-09)

El esquema pasa a identificar posts, métricas y destinos por cuenta. Con datos ya
cargados, el orden importa:

1. Con el código de **antes** del cambio corriendo en producción, aplica solo la fase 1
   del esquema: desde el commit «Agrega account_id a posts, métricas y destinos», `npm run db:push`.
2. `npm run cuentas:backfill`: asigna cada fila a la única cuenta de su red. Debe
   terminar en «Filas sin cuenta: 0».
3. Despliega el código nuevo (merge y promoción a `main`).
4. Vuelve a correr `npm run cuentas:backfill` (por si una sincronización corrió entre
   los pasos 2 y 3) y, desde `main`, `npm run db:push` para la fase 2: columnas
   obligatorias y claves únicas viejas retiradas.
```

- [ ] **Step 3: Verificación final y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde.

Marca `[x]` cada step cumplido en este plan.

```bash
git add src/db/schema.ts src/lib/social/publish/run.ts README.md docs/superpowers/plans/2026-09-10-multicuentas-1-cuenta-como-entidad.md
git commit -m "Cierra la migración a cuentas: account_id obligatorio y claves por cuenta"
```

**El runbook lo ejecuta el controlador con el dueño**, contra producción, en el orden del
README: push fase 1 desde el commit de Task 1, backfill, merge y promoción, backfill de
nuevo, push fase 2 desde `main`. El PR de esta rama apunta a `contenido-presentacion`.
