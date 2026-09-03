# Métricas de cuenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seguidores, visitas al perfil y alcance por cuenta y por día, sincronizados a diario desde Instagram, Facebook y YouTube, y mostrados en una sección «Tus cuentas» en Analytics.

**Architecture:** Tabla `account_metrics` (una fila por red y día, contadores acumulados separados de valores del día), un método opcional `fetchAccountMetrics` en el contrato de conector que cada red implementa como su API permita, un paso con fallo suave dentro de `syncNetwork`, y una lectura que reusa `periodChange` para la variación.

**Tech Stack:** Next.js App Router, Drizzle + Neon (`npm run db:push`), Graph API v23, YouTube Data API v3, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-metricas-de-cuenta-design.md`

## Global Constraints

- Las métricas de cuenta son un extra: **su fallo nunca tumba la sincronización de publicaciones** ni deja `lastSyncError` en la cuenta. Todo error va a `console.error` truncado (`.slice(0, 300)`).
- Un `null` significa «esta red no entrega esto», jamás cero.
- Los módulos puros no importan `@/lib/analytics` (server-only); la zona llega por parámetro.
- Cero dependencias nuevas; `npx vitest run` antes de cada commit.
- Rutas con paréntesis entre comillas en shell.

---

### Task 1: Tabla y contrato

**Files:**
- Modify: `src/db/schema.ts` (tabla nueva tras `postMetrics`), `src/db/index.ts` (re-export si el archivo re-exporta tablas — verifícalo)
- Modify: `src/lib/social/connector.ts`

**Interfaces:**
- Produces: tabla `accountMetrics`; `type AccountMetricValues`; `NO_ACCOUNT_METRICS`; `Connector.fetchAccountMetrics?`.

- [ ] **Step 1: La tabla**

En `src/db/schema.ts`, después de `postMetrics`:

```ts
/**
 * Cómo va la cuenta, no cada publicación. Dos clases de columna conviven acá y no
 * deben mezclarse: los contadores acumulados (seguidores, views totales) se leen
 * enteros cada día y su crecimiento sale por diferencia, mientras que los valores del
 * día vienen ya calculados por la red. Sumar los primeros como si fueran los segundos
 * daría un total de seguidores que crece cada 24 horas.
 */
export const accountMetrics = pgTable(
  'account_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    network: text('network').notNull(),
    day: date('day').notNull(),
    // Acumulados
    followers: integer('followers'),
    totalViews: integer('total_views'),
    videoCount: integer('video_count'),
    // Valores del día
    profileViews: integer('profile_views'),
    reach: integer('reach'),
    views: integer('views'),
    accountsEngaged: integer('accounts_engaged'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('account_metrics_network_day_key').on(t.network, t.day),
    index('account_metrics_day_idx').on(t.day),
  ],
)
```

Verifica que `src/db/index.ts` re-exporte las tablas (mira cómo aparece `postMetrics`) y suma `accountMetrics` de la misma forma.

- [ ] **Step 2: Migrar**

Run: `npm run db:push`
Expected: `[✓] Changes applied` — tabla nueva, sin prompts. Si pide confirmación interactiva, DETENTE y reporta BLOCKED.

- [ ] **Step 3: El contrato**

En `src/lib/social/connector.ts`, junto a `PostMetricValues`:

```ts
export type AccountMetricValues = {
  followers: number | null
  totalViews: number | null
  videoCount: number | null
  profileViews: number | null
  reach: number | null
  views: number | null
  accountsEngaged: number | null
}

export const NO_ACCOUNT_METRICS: AccountMetricValues = {
  followers: null,
  totalViews: null,
  videoCount: null,
  profileViews: null,
  reach: null,
  views: null,
  accountsEngaged: null,
}
```

y `Connector` gana:

```ts
  /**
   * Cómo va la cuenta hoy. Opcional: una red que no lo implemente simplemente no
   * aporta fila, y ninguna implementación debe lanzar por una métrica ausente.
   */
  fetchAccountMetrics?(account: SocialAccount, token: string): Promise<AccountMetricValues>
```

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/db/schema.ts src/db/index.ts src/lib/social/connector.ts
git commit -m "Agrega la tabla y el contrato de métricas de cuenta"
```

---

### Task 2: Normalizadores puros de las tres redes

**Files:**
- Create: `src/lib/social/account-metrics.ts`
- Test: `src/lib/social/account-metrics.test.ts`

**Interfaces:**
- Consumes (Task 1): `AccountMetricValues`, `NO_ACCOUNT_METRICS`.
- Produces (para el Task 3): `normalizeInstagramAccount(insights, profile)`, `normalizeFacebookAccount(profile)`, `normalizeYoutubeAccount(statistics)`.

- [ ] **Step 1: Tests que fallan**

```ts
// src/lib/social/account-metrics.test.ts
import { describe, expect, it } from 'vitest'
import {
  normalizeFacebookAccount,
  normalizeInstagramAccount,
  normalizeYoutubeAccount,
} from './account-metrics'

describe('normalizeInstagramAccount', () => {
  // Forma real de la respuesta: `total_value` para las métricas nuevas y `values`
  // para las clásicas, en el mismo array `data`.
  const insights = {
    data: [
      { name: 'profile_views', total_value: { value: 122 } },
      { name: 'views', total_value: { value: 6845 } },
      { name: 'accounts_engaged', total_value: { value: 88 } },
      { name: 'reach', values: [{ value: 130 }, { value: 3206 }] },
    ],
  }

  it('lee ambos formatos y toma la última lectura de las series', () => {
    expect(normalizeInstagramAccount(insights, { followers_count: 1520 })).toEqual({
      followers: 1520,
      totalViews: null,
      videoCount: null,
      profileViews: 122,
      reach: 3206,
      views: 6845,
      accountsEngaged: 88,
    })
  })

  it('lo ausente queda null, nunca cero', () => {
    expect(normalizeInstagramAccount({ data: [] }, {})).toEqual({
      followers: null,
      totalViews: null,
      videoCount: null,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })

  it('una respuesta sin `data` no revienta', () => {
    expect(normalizeInstagramAccount({}, { followers_count: 7 }).followers).toBe(7)
  })
})

describe('normalizeFacebookAccount', () => {
  it('prefiere followers_count y cae a fan_count', () => {
    expect(normalizeFacebookAccount({ followers_count: 1, fan_count: 3 }).followers).toBe(1)
    expect(normalizeFacebookAccount({ fan_count: 3 }).followers).toBe(3)
    expect(normalizeFacebookAccount({}).followers).toBeNull()
  })

  it('no inventa las métricas que la página no da', () => {
    expect(normalizeFacebookAccount({ followers_count: 1 })).toEqual({
      followers: 1,
      totalViews: null,
      videoCount: null,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })
})

describe('normalizeYoutubeAccount', () => {
  it('convierte las cadenas de la API a números', () => {
    expect(
      normalizeYoutubeAccount({ subscriberCount: '1240', viewCount: '58210', videoCount: '96' }),
    ).toEqual({
      followers: 1240,
      totalViews: 58210,
      videoCount: 96,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })

  it('un canal que oculta sus suscriptores deja null', () => {
    expect(normalizeYoutubeAccount({ viewCount: '10' }).followers).toBeNull()
    expect(normalizeYoutubeAccount({}).totalViews).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/account-metrics.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/account-metrics.ts
// Normalización pura de lo que cada red dice sobre la cuenta. Sin fetch acá: los
// conectores traen el payload y esto lo traduce, que es lo testeable.
import { NO_ACCOUNT_METRICS, type AccountMetricValues } from './connector'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type InstagramEntry = {
  name?: string
  total_value?: { value?: unknown }
  values?: Array<{ value?: unknown }>
}

/**
 * Graph mezcla dos formas en el mismo array: las métricas nuevas responden
 * `total_value` y las clásicas una serie `values`, de la que interesa la última
 * lectura — la del día que se está sincronizando.
 */
function instagramValue(entries: InstagramEntry[], name: string): number | null {
  const entry = entries.find((e) => e.name === name)
  if (!entry) return null
  if (entry.total_value) return toNumber(entry.total_value.value)
  const last = entry.values?.at(-1)
  return last ? toNumber(last.value) : null
}

export function normalizeInstagramAccount(
  insights: { data?: InstagramEntry[] },
  profile: { followers_count?: unknown },
): AccountMetricValues {
  const entries = insights.data ?? []
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(profile.followers_count),
    profileViews: instagramValue(entries, 'profile_views'),
    reach: instagramValue(entries, 'reach'),
    views: instagramValue(entries, 'views'),
    accountsEngaged: instagramValue(entries, 'accounts_engaged'),
  }
}

/**
 * Las page insights están muertas para esta página (todas responden «metric inválida»
 * o vacío), así que Facebook aporta lo único que su nodo sí entrega: seguidores.
 * `fan_count` es el nombre viejo del mismo número y sirve de respaldo.
 */
export function normalizeFacebookAccount(profile: {
  followers_count?: unknown
  fan_count?: unknown
}): AccountMetricValues {
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(profile.followers_count) ?? toNumber(profile.fan_count),
  }
}

/** `channels.list` devuelve todo como cadenas. Son acumulados de por vida. */
export function normalizeYoutubeAccount(statistics: {
  subscriberCount?: unknown
  viewCount?: unknown
  videoCount?: unknown
}): AccountMetricValues {
  return {
    ...NO_ACCOUNT_METRICS,
    followers: toNumber(statistics.subscriberCount),
    totalViews: toNumber(statistics.viewCount),
    videoCount: toNumber(statistics.videoCount),
  }
}
```

- [ ] **Step 4: Verde y commit**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/lib/social/account-metrics.ts src/lib/social/account-metrics.test.ts
git commit -m "Agrega los normalizadores de métricas de cuenta"
```

---

### Task 3: Los tres conectores traen sus métricas

**Files:**
- Modify: `src/lib/social/instagram.ts`, `src/lib/social/facebook.ts`, `src/lib/social/youtube.ts`

**Interfaces:**
- Consumes (Tasks 1-2): `AccountMetricValues`, `NO_ACCOUNT_METRICS`, los tres normalizadores.
- Produces (para el Task 4): `fetchAccountMetrics` implementado en los tres objetos conectores.

Lee cada archivo antes de editar: reusa su helper de HTTP (`getJson` en Instagram, el equivalente en los otros) y su constante `GRAPH` / URL base. No dupliques clientes.

- [ ] **Step 1: Instagram**

En el objeto `instagramConnector`, junto a `fetchPosts`:

```ts
  async fetchAccountMetrics(account, token): Promise<AccountMetricValues> {
    const id = account.externalId
    if (!id) return NO_ACCOUNT_METRICS

    // Dos llamadas porque son dos formas distintas: las métricas nuevas exigen
    // metric_type=total_value y las clásicas lo rechazan.
    const nuevas = `${GRAPH}/${id}/insights?metric=profile_views,views,accounts_engaged&metric_type=total_value&period=day&access_token=${token}`
    const clasicas = `${GRAPH}/${id}/insights?metric=reach&period=day&access_token=${token}`
    const perfil = `${GRAPH}/${id}?fields=followers_count&access_token=${token}`

    // Cada pieza por su cuenta: que Instagram deje de dar una no debe borrar las otras.
    const [a, b, c] = await Promise.all([
      getJson(nuevas).catch(() => ({})),
      getJson(clasicas).catch(() => ({})),
      getJson(perfil).catch(() => ({})),
    ])
    const data = [
      ...((a as { data?: unknown[] }).data ?? []),
      ...((b as { data?: unknown[] }).data ?? []),
    ]
    return normalizeInstagramAccount({ data } as never, c as never)
  },
```

- [ ] **Step 2: Facebook**

En `facebookConnector`:

```ts
  async fetchAccountMetrics(account, token): Promise<AccountMetricValues> {
    const id = account.externalId
    if (!id) return NO_ACCOUNT_METRICS
    // Solo el nodo de la página: sus insights están deprecadas y responden vacío.
    const profile = await getJson(
      `${GRAPH}/${id}?fields=followers_count,fan_count&access_token=${token}`,
    ).catch(() => ({}))
    return normalizeFacebookAccount(profile as never)
  },
```

(Si el archivo no tiene un `getJson` propio, usa su helper de fetch existente; si no
hay ninguno, un `fetch` con `response.ok` verificado y `console.error` truncado.)

- [ ] **Step 3: YouTube**

En `youtubeConnector`:

```ts
  async fetchAccountMetrics(account, token): Promise<AccountMetricValues> {
    const id = account.externalId
    if (!id) return NO_ACCOUNT_METRICS
    const payload = await getJson(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${id}`,
      token,
    ).catch(() => ({}))
    const stats = (payload as { items?: Array<{ statistics?: unknown }> }).items?.[0]?.statistics
    return normalizeYoutubeAccount((stats ?? {}) as never)
  },
```

NOTA: el conector de YouTube autentica distinto según el camino (API key para
lectura pública, OAuth para lo del dueño). Lee cómo llama hoy a `channels.list` en
ese archivo y **usa exactamente el mismo mecanismo**; el snippet de arriba asume un
helper que recibe el token, adapta la llamada a lo que exista.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`

```bash
git add src/lib/social/instagram.ts src/lib/social/facebook.ts src/lib/social/youtube.ts
git commit -m "Los conectores traen las métricas de su cuenta"
```

---

### Task 4: La sincronización las guarda

**Files:**
- Modify: `src/lib/social/sync.ts`

**Interfaces:**
- Consumes (Tasks 1-3): `accountMetrics`, `connector.fetchAccountMetrics`.
- Produces: nada aguas abajo.

- [ ] **Step 1: El paso nuevo**

En `syncNetwork`, dentro del `try`, **después** del bucle que guarda las
publicaciones (`for (const post of fetched) { … }`) y antes de lo que siga:

```ts
    // Extra deliberado: las métricas de cuenta nunca deben tumbar la sincronización
    // de publicaciones que sí funcionó, así que su fallo muere acá mismo.
    if (connector.fetchAccountMetrics) {
      try {
        const values = await connector.fetchAccountMetrics(account as SocialAccount, token)
        await db
          .insert(accountMetrics)
          .values({ network, day, ...values })
          .onConflictDoUpdate({
            target: [accountMetrics.network, accountMetrics.day],
            set: { ...values, capturedAt: new Date() },
          })
      } catch (error) {
        console.error(`[sync] métricas de cuenta de ${network}:`, String(error).slice(0, 300))
      }
    }
```

Suma `accountMetrics` al import de `@/db` en ese archivo.

- [ ] **Step 2: Verificar y commitear**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: verde. (Sin tests nuevos: es orquestación HTTP+DB, como el resto de `sync.ts`.)

```bash
git add src/lib/social/sync.ts
git commit -m "Guarda las métricas de cuenta en la sincronización diaria"
```

---

### Task 5: La sección «Tus cuentas» en Analytics

**Files:**
- Create: `src/lib/account-stats.ts`, `src/lib/account-stats.test.ts`
- Create: `src/app/admin/(dash)/analytics/accounts.tsx`
- Modify: `src/app/admin/(dash)/analytics/page.tsx`

**Interfaces:**
- Consumes: `accountMetrics`, `periodChange` de `@/lib/social/delta`, `localDay` de `@/lib/analytics`, `networkLabel` de `@/lib/networks`, los componentes `Panel`/`StatTile` de `@/components/charts/*` (lee cómo los usa `analytics/page.tsx` y sigue ese molde).
- Produces: `type AccountCard`, `buildAccountCards(rows, from, to)`.

- [ ] **Step 1: Tests que fallan**

```ts
// src/lib/account-stats.test.ts
import { describe, expect, it } from 'vitest'
import { buildAccountCards, type AccountMetricRow } from './account-stats'

const rows: AccountMetricRow[] = [
  { network: 'instagram', day: '2026-09-01', followers: 1500, profileViews: 100, reach: 2000 },
  { network: 'instagram', day: '2026-09-03', followers: 1540, profileViews: 122, reach: 3206 },
  { network: 'youtube', day: '2026-09-03', followers: 240, profileViews: null, reach: null },
]

describe('buildAccountCards', () => {
  it('una tarjeta por red, con seguidores actuales y lo ganado en el período', () => {
    expect(buildAccountCards(rows, '2026-09-02', '2026-09-03')).toEqual([
      { network: 'instagram', followers: 1540, followersChange: 40, profileViews: 122, reach: 3206 },
      { network: 'youtube', followers: 240, followersChange: null, profileViews: null, reach: null },
    ])
  })

  it('sin lectura previa el crecimiento es desconocido, no el total', () => {
    const cards = buildAccountCards(rows, '2026-08-01', '2026-09-03')
    expect(cards[0]!.followersChange).toBeNull()
  })

  it('sin filas no hay tarjetas', () => {
    expect(buildAccountCards([], '2026-09-01', '2026-09-03')).toEqual([])
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/account-stats.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el módulo puro**

```ts
// src/lib/account-stats.ts
// Puro: recibe las filas ya leídas y arma lo que la sección dibuja. La zona no entra
// acá — los `day` ya vienen como fecha local desde la sincronización.
import { periodChange } from './social/delta'

export type AccountMetricRow = {
  network: string
  day: string
  followers: number | null
  profileViews: number | null
  reach: number | null
}

/**
 * Una cuenta no «nace» dentro de una ventana como sí lo hace un post, así que su
 * contador sin lectura previa siempre significa «no lo puedo saber». Esta fecha
 * imposible es lo que le dice eso a `periodChange`, cuyo cuarto argumento existe
 * justamente para distinguir los dos casos.
 */
const LA_CUENTA_YA_EXISTIA = '0000-01-01'

export type AccountCard = {
  network: string
  followers: number | null
  /** Seguidores ganados dentro del período; null cuando no hay lectura previa. */
  followersChange: number | null
  profileViews: number | null
  reach: number | null
}

export function buildAccountCards(
  rows: AccountMetricRow[],
  from: string,
  to: string,
): AccountCard[] {
  const byNetwork = new Map<string, AccountMetricRow[]>()
  for (const row of rows) {
    const list = byNetwork.get(row.network) ?? []
    list.push(row)
    byNetwork.set(row.network, list)
  }

  return [...byNetwork.entries()].map(([network, list]) => {
    const ordered = [...list].sort((a, b) => a.day.localeCompare(b.day))
    const inside = ordered.filter((r) => r.day >= from && r.day <= to)
    const last = inside.at(-1) ?? null

    // El mismo motor que los posts: distingue «creció esto» de «no lo puedo saber».
    const followers = periodChange(
      ordered.map((r) => ({ day: r.day, value: r.followers })),
      from,
      to,
      LA_CUENTA_YA_EXISTIA,
    )

    return {
      network,
      followers: followers.current,
      followersChange: followers.change,
      profileViews: last?.profileViews ?? null,
      reach: last?.reach ?? null,
    }
  })
}
```

- [ ] **Step 4: La sección**

`src/app/admin/(dash)/analytics/accounts.tsx`:

```tsx
import { networkLabel } from '@/lib/networks'
import { formatNumber } from '@/lib/utils'
import type { AccountCard } from '@/lib/account-stats'

/** `—` y nunca `0`: una red que no entrega el dato no reportó cero. */
function num(value: number | null): string {
  return value === null ? '—' : formatNumber(value)
}

export function AccountCards({ cards }: { cards: AccountCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-fg-faint">
        Todavía no hay lecturas de cuenta. La primera llega con la sincronización de esta noche.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={card.network} className="rounded-2xl bg-white/[0.04] p-4">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
            {networkLabel(card.network)}
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{num(card.followers)}</p>
          <p className="text-[0.75rem] text-fg-muted">
            seguidores
            {card.followersChange !== null && card.followersChange > 0
              ? ` · +${formatNumber(card.followersChange)} en el período`
              : ''}
          </p>
          <div className="mt-3 flex gap-4 text-[0.75rem] text-fg-faint">
            <span>Visitas al perfil: {num(card.profileViews)}</span>
            <span>Alcance: {num(card.reach)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Enchufarla en la página**

En `src/app/admin/(dash)/analytics/page.tsx`: lee las filas del rango y dibuja la
sección dentro de un `Panel` (imita exactamente cómo la página arma sus otros
paneles y cómo obtiene `filters`):

```tsx
  const accountRows = await getDb()
    .select({
      network: accountMetrics.network,
      day: accountMetrics.day,
      followers: accountMetrics.followers,
      profileViews: accountMetrics.profileViews,
      reach: accountMetrics.reach,
    })
    .from(accountMetrics)
    .orderBy(asc(accountMetrics.day))
  // Sin filtro de fecha a propósito: la variación necesita la lectura anterior a la
  // ventana, y la tabla crece una fila por red y día — nada que paginar.

  const cards = buildAccountCards(accountRows, localDay(filters.from), localDay(filters.to))
```

y en el JSX, antes de los paneles existentes:

```tsx
        <Panel
          title="Tus cuentas"
          hint="Seguidores por red, con lo ganado en el período. Visitas al perfil y alcance son del último día leído — Instagram es la única que los entrega hoy."
        >
          <AccountCards cards={cards} />
        </Panel>
```

Suma los imports que falten (`accountMetrics` de `@/db`, `asc` de drizzle-orm,
`buildAccountCards` de `@/lib/account-stats`, `localDay` de `@/lib/analytics`,
`AccountCards` de `./accounts`).

- [ ] **Step 6: Verificar y commitear**

Run: `npx vitest run && npm run lint && npx tsc --noEmit && npx next build`

```bash
git add src/lib/account-stats.ts src/lib/account-stats.test.ts "src/app/admin/(dash)/analytics/accounts.tsx" "src/app/admin/(dash)/analytics/page.tsx"
git commit -m "Muestra la sección Tus cuentas en Analytics"
```
