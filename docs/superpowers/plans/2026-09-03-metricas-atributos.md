# Métricas por API y atributos de contenido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `atributos` (JSON plano libre) en el contrato de programación y `GET /api/metrics/posts` que devuelve cada publicación del rango con sus métricas y sus atributos — el loop de aprendizaje del editor-LLM.

**Architecture:** Columna JSONB en `scheduled_posts`, validador puro compartido (batch/route/editor), extensión aditiva de `PostRow` (`externalId`, `publishedAt`), helpers puros de rango/ISO/armado de respuesta, y una ruta GET que reusa `getPostRows` y resuelve atributos con un join en memoria por (network, externalId).

**Tech Stack:** Next.js App Router, Drizzle + Neon (`npm run db:push`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-metricas-atributos-design.md`

## Global Constraints

- Frases fijas EXACTAS: `'Los atributos deben ser un objeto plano de valores simples.'`, `'El rango de fechas no se entendió (usa YYYY-MM-DD).'`, `'Red desconocida: …'` (con la red interpolada). Detalle upstream solo a `console.error` truncado.
- Los módulos puros nuevos JAMÁS importan `@/lib/analytics` (server-only): la zona llega por parámetro.
- Los `null` de métricas se preservan en la respuesta (jamás se vuelven 0).
- El CSV NO gana columna de atributos.
- Cero dependencias nuevas; `npx vitest run` antes de cada commit; rutas con paréntesis/corchetes entre comillas en shell.

---

### Task 1: Columna y validador de atributos

**Files:**
- Modify: `src/db/schema.ts` (tabla `scheduledPosts`, agregar tras `coverUrl`; sumar `jsonb` al import de `drizzle-orm/pg-core` si no está)
- Create: `src/lib/social/publish/atributos.ts`
- Test: `src/lib/social/publish/atributos.test.ts`

**Interfaces:**
- Produces: `scheduledPosts.atributos` (jsonb nullable); `type Atributos = Record<string, string | number | boolean>`; `ATRIBUTOS_ERROR`; `validateAtributos(value: unknown): { atributos: Atributos | null } | { error: string }`.

- [ ] **Step 1: Tests que fallan**

```ts
// src/lib/social/publish/atributos.test.ts
import { describe, expect, it } from 'vitest'
import { ATRIBUTOS_ERROR, validateAtributos } from './atributos'

describe('validateAtributos', () => {
  it('acepta un objeto plano de escalares y lo devuelve tal cual', () => {
    const atributos = { hook: 'pregunta-polemica', tema: 'negocios', serie: 'mut', episodio: 4, activo: true }
    expect(validateAtributos(atributos)).toEqual({ atributos })
  })

  it('ausente o null es sin atributos, no un error', () => {
    expect(validateAtributos(undefined)).toEqual({ atributos: null })
    expect(validateAtributos(null)).toEqual({ atributos: null })
  })

  it('rechaza lo que no es objeto plano: arrays, strings, anidados', () => {
    expect(validateAtributos(['hook'])).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos('hook: pregunta')).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ hook: { tipo: 'pregunta' } })).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ lista: ['a'] })).toEqual({ error: ATRIBUTOS_ERROR })
  })

  it('rechaza los excesos: más de 20 claves o más de 2000 caracteres', () => {
    const muchas = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']))
    expect(validateAtributos(muchas)).toEqual({ error: ATRIBUTOS_ERROR })
    expect(validateAtributos({ nota: 'x'.repeat(2000) })).toEqual({ error: ATRIBUTOS_ERROR })
  })

  it('el objeto vacío vale como sin atributos', () => {
    expect(validateAtributos({})).toEqual({ atributos: null })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/atributos.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/publish/atributos.ts
// The LLM editor's free-form content taxonomy. The system only transports it:
// flat object, scalar values, sane size — no opinion on what a "hook" is.

export type Atributos = Record<string, string | number | boolean>

export const ATRIBUTOS_ERROR = 'Los atributos deben ser un objeto plano de valores simples.'

const MAX_KEYS = 20
const MAX_SERIALIZED = 2000

export function validateAtributos(
  value: unknown,
): { atributos: Atributos | null } | { error: string } {
  if (value === undefined || value === null) return { atributos: null }
  if (typeof value !== 'object' || Array.isArray(value)) return { error: ATRIBUTOS_ERROR }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return { atributos: null }
  if (entries.length > MAX_KEYS) return { error: ATRIBUTOS_ERROR }
  for (const [, v] of entries) {
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      return { error: ATRIBUTOS_ERROR }
    }
  }
  if (JSON.stringify(value).length > MAX_SERIALIZED) return { error: ATRIBUTOS_ERROR }
  return { atributos: value as Atributos }
}
```

En `src/db/schema.ts`, tras `coverUrl` en `scheduledPosts` (y `jsonb` sumado al
import de `drizzle-orm/pg-core`):

```ts
  // La taxonomía libre del editor-LLM ({"hook": "...", "tema": "..."}); el
  // endpoint de métricas la devuelve junto a los números para cerrar su loop.
  atributos: jsonb('atributos'),
```

- [ ] **Step 4: Migrar y verificar**

Run: `npm run db:push` — Expected: `[✓] Changes applied` (columna nullable, sin prompt).
Run: `npx vitest run && npx tsc --noEmit` — Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/lib/social/publish/atributos.ts src/lib/social/publish/atributos.test.ts
git commit -m "Agrega la columna y el validador de atributos de contenido"
```

---

### Task 2: Atributos en el contrato del lote

**Files:**
- Modify: `src/lib/social/publish/batch.ts`
- Modify: `src/app/api/schedule/batch/route.ts`
- Test: `src/lib/social/publish/batch.test.ts`

**Interfaces:**
- Consumes (Task 1): `validateAtributos`, `ATRIBUTOS_ERROR`, `scheduledPosts.atributos`.
- Produces: `BatchItem.atributos?: unknown` (se valida adentro; el route lo pasa crudo).

- [ ] **Step 1: Tests que fallan**

En `src/lib/social/publish/batch.test.ts` (sumar `ATRIBUTOS_ERROR` al import desde `./atributos`):

```ts
describe('atributos en validateBatchItem', () => {
  it('un objeto plano pasa; uno inválido es la frase fija', () => {
    expect(validateBatchItem({ ...base, atributos: { hook: 'dato-duro' } }, now)).toBeNull()
    expect(validateBatchItem({ ...base, atributos: ['hook'] }, now)).toBe(ATRIBUTOS_ERROR)
    expect(validateBatchItem({ ...base, atributos: { a: { b: 1 } } }, now)).toBe(ATRIBUTOS_ERROR)
  })

  it('sin atributos no exige nada', () => {
    expect(validateBatchItem(base, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/batch.test.ts`
Expected: FAIL — `atributos` no existe en `BatchItem`.

- [ ] **Step 3: Implementar**

En `batch.ts`:
- `import { validateAtributos } from './atributos'` (arriba).
- `BatchItem` gana `atributos?: unknown` con comentario `/** JSON plano libre del editor-LLM; se valida con validateAtributos. */`.
- En `validateBatchItem`, después del bloque de portada y antes del
  `return validateScheduleDraft(...)`:

```ts
  const atributosCheck = validateAtributos(item.atributos)
  if ('error' in atributosCheck) return atributosCheck.error
```

- En `scheduleBatch`, el insert del post incorpora los atributos validados
  (re-derivados del item, mismo camino puro):

```ts
      const atributosCheck = validateAtributos(item.atributos)
      const atributos = 'error' in atributosCheck ? null : atributosCheck.atributos
```

  y `.values({ caption: item.texto, scheduledAt, coverUrl, atributos })`.

En `route.ts`, la normalización gana (tras `portada`):

```ts
        // Crudo a propósito: la validación con frase fija vive en validateBatchItem.
        atributos: p.atributos,
```

- [ ] **Step 4: Suite completa**

Run: `npx vitest run && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/batch.ts src/lib/social/publish/batch.test.ts src/app/api/schedule/batch/route.ts
git commit -m "Acepta atributos de contenido en el lote"
```

---

### Task 3: Helpers puros del endpoint y extensión de PostRow

**Files:**
- Create: `src/lib/metrics-api.ts`
- Modify: `src/lib/posts-kpis.ts` (tipo `PostRow`), `src/lib/posts.ts` (mapeo), `src/lib/posts-kpis.test.ts` (builder `row()`)
- Test: `src/lib/metrics-api.test.ts`

**Interfaces:**
- Consumes: `fromZonedInput` de `@/lib/utils`, `addDays` de `@/lib/schedule-week`, `type PostRow` y `type Atributos`.
- Produces (para el Task 4): `PostRow` gana `externalId: string` y `publishedAt: Date`; `RANGO_ERROR`; `parseRango(desde, hasta, now, zone)`; `isoInZone(date, zone)`; `buildMetricPost(row, atributos, zone)`.

- [ ] **Step 1: Extender PostRow**

En `src/lib/posts-kpis.ts`, `PostRow` gana (junto a `network`):

```ts
  /** El id del post en la red — la llave que une métricas con lo programado. */
  externalId: string
  /** Crudo para la API de métricas; la tabla humana usa publishedLabel. */
  publishedAt: Date
```

En `src/lib/posts.ts`, el objeto devuelto por `getPostRows` (~línea 133) suma
`externalId: post.externalId,` y `publishedAt: post.publishedAt,`.

En `src/lib/posts-kpis.test.ts`, el builder `row()` suma a sus defaults:
`externalId: 'ext-1',` y `publishedAt: new Date('2026-08-01T12:00:00Z'),`.

- [ ] **Step 2: Tests que fallan**

```ts
// src/lib/metrics-api.test.ts
import { describe, expect, it } from 'vitest'
import { buildMetricPost, isoInZone, parseRango, RANGO_ERROR } from './metrics-api'
import type { PostRow } from './posts-kpis'

const ZONE = 'America/Santiago'
const now = new Date('2026-06-20T15:00:00Z')

describe('parseRango', () => {
  it('sin parámetros son los últimos 30 días', () => {
    const r = parseRango(null, null, now, ZONE)
    if ('error' in r) throw new Error(r.error)
    expect(r.to).toEqual(now)
    expect(r.from).toEqual(new Date(now.getTime() - 30 * 864e5))
  })

  it('desde y hasta en zona, con el día final completo', () => {
    const r = parseRango('2026-06-01', '2026-06-02', now, ZONE)
    if ('error' in r) throw new Error(r.error)
    // Junio: invierno chileno, UTC-4 sin ambigüedad de DST. 00:00 Chile = 04:00Z.
    expect(r.from.toISOString()).toBe('2026-06-01T04:00:00.000Z')
    // hasta inclusive: el corte es el inicio del día siguiente
    expect(r.to.toISOString()).toBe('2026-06-03T04:00:00.000Z')
  })

  it('ilegible o invertido es la frase fija', () => {
    expect(parseRango('mañana', null, now, ZONE)).toEqual({ error: RANGO_ERROR })
    expect(parseRango('2026-06-05', '2026-06-01', now, ZONE)).toEqual({ error: RANGO_ERROR })
    expect(parseRango('2026-02-31', null, now, ZONE)).toEqual({ error: RANGO_ERROR })
  })
})

describe('isoInZone', () => {
  it('formatea el instante con el offset de la zona (meses sin ambigüedad de DST)', () => {
    expect(isoInZone(new Date('2026-01-15T14:15:00Z'), ZONE)).toBe('2026-01-15T11:15:00-03:00')
    expect(isoInZone(new Date('2026-06-15T14:15:00Z'), ZONE)).toBe('2026-06-15T10:15:00-04:00')
  })
})

describe('buildMetricPost', () => {
  const row: PostRow = {
    id: 'uuid-1', network: 'instagram', externalId: 'ext-9',
    permalink: 'https://instagram.com/p/x', caption: 'Hola', thumbnailUrl: null,
    mediaType: 'video', publishedLabel: '3 sep', publishedAt: new Date('2026-01-15T14:15:00Z'),
    campaign: 'reel-42', archived: false,
    views: 5210, viewsChange: 1200, likesChange: 30, commentsChange: 2, sharesChange: 1,
    isNew: false, likes: 310, comments: 12, shares: 8, saves: null, reach: 4100,
    visits: 85, uniques: 60, clicks: 40, ctr: 3.3, pull: 7.1,
  }

  it('mapea al shape en español preservando nulls', () => {
    expect(buildMetricPost(row, { hook: 'pregunta' }, ZONE)).toEqual({
      red: 'instagram', externalId: 'ext-9',
      permalink: 'https://instagram.com/p/x', texto: 'Hola',
      publicadoEl: '2026-01-15T11:15:00-03:00',
      etiqueta: 'reel-42', atributos: { hook: 'pregunta' }, archivado: false,
      metricas: {
        views: 5210, viewsGanadas: 1200, likes: 310, comentarios: 12,
        compartidos: 8, alcance: 4100, visitasAlSitio: 85, clicks: 40,
        ctr: 3.3, arrastre: 7.1,
      },
    })
  })

  it('el post orgánico va con atributos null y los nulls de métricas quedan nulls', () => {
    const organico = { ...row, views: null, visits: null, ctr: null, pull: null }
    const built = buildMetricPost(organico, null, ZONE)
    expect(built.atributos).toBeNull()
    expect(built.metricas.views).toBeNull()
    expect(built.metricas.visitasAlSitio).toBeNull()
    expect(built.metricas.arrastre).toBeNull()
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Run: `npx vitest run src/lib/metrics-api.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 4: Implementar**

```ts
// src/lib/metrics-api.ts
// Pure pieces of GET /api/metrics/posts. The zone arrives as a parameter — this
// module must stay importable by vitest (no server-only imports).
import { addDays } from '@/lib/schedule-week'
import { fromZonedInput } from '@/lib/utils'
import type { Atributos } from '@/lib/social/publish/atributos'
import type { PostRow } from '@/lib/posts-kpis'

export const RANGO_ERROR = 'El rango de fechas no se entendió (usa YYYY-MM-DD).'

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** `hasta` cubre el día completo: el corte es el inicio del día siguiente en la zona. */
export function parseRango(
  desde: string | null,
  hasta: string | null,
  now: Date,
  zone: string,
): { from: Date; to: Date } | { error: string } {
  let to = now
  if (hasta !== null) {
    if (!DAY_KEY.test(hasta) || addDays(hasta, 0) !== hasta) return { error: RANGO_ERROR }
    const parsed = fromZonedInput(`${addDays(hasta, 1)}T00:00`, zone)
    if (!parsed) return { error: RANGO_ERROR }
    to = parsed
  }

  let from = new Date(to.getTime() - 30 * 864e5)
  if (desde !== null) {
    if (!DAY_KEY.test(desde) || addDays(desde, 0) !== desde) return { error: RANGO_ERROR }
    const parsed = fromZonedInput(`${desde}T00:00`, zone)
    if (!parsed) return { error: RANGO_ERROR }
    from = parsed
  }

  if (from.getTime() > to.getTime()) return { error: RANGO_ERROR }
  return { from, to }
}

/** ISO con el offset de la zona: 2026-09-03T11:15:00-03:00. */
export function isoInZone(date: Date, zone: string): string {
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
    .format(date)
    .replace(' ', 'T')
  const offsetMin = Math.round((new Date(`${wall}Z`).getTime() - date.getTime()) / 60000)
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${wall}${sign}${hh}:${mm}`
}

export type MetricPost = {
  red: string
  externalId: string
  permalink: string | null
  texto: string | null
  publicadoEl: string
  etiqueta: string
  atributos: Atributos | null
  archivado: boolean
  metricas: {
    views: number | null
    viewsGanadas: number | null
    likes: number | null
    comentarios: number | null
    compartidos: number | null
    alcance: number | null
    visitasAlSitio: number | null
    clicks: number | null
    ctr: number | null
    arrastre: number | null
  }
}

/** Nombres en español para el consumidor; los nulls viajan intactos (nunca 0). */
export function buildMetricPost(
  row: PostRow,
  atributos: Atributos | null,
  zone: string,
): MetricPost {
  return {
    red: row.network,
    externalId: row.externalId,
    permalink: row.permalink,
    texto: row.caption,
    publicadoEl: isoInZone(row.publishedAt, zone),
    etiqueta: row.campaign,
    atributos,
    archivado: row.archived,
    metricas: {
      views: row.views,
      viewsGanadas: row.viewsChange,
      likes: row.likes,
      comentarios: row.comments,
      compartidos: row.shares,
      alcance: row.reach,
      visitasAlSitio: row.visits,
      clicks: row.clicks,
      ctr: row.ctr,
      arrastre: row.pull,
    },
  }
}
```

- [ ] **Step 5: Suite completa + commit**

Run: `npx vitest run && npx tsc --noEmit` — Expected: verde (los tests de
posts-kpis siguen pasando con el builder extendido).

```bash
git add src/lib/metrics-api.ts src/lib/metrics-api.test.ts src/lib/posts-kpis.ts src/lib/posts.ts src/lib/posts-kpis.test.ts
git commit -m "Agrega los helpers puros del endpoint de métricas"
```

---

### Task 4: La ruta `GET /api/metrics/posts`

**Files:**
- Create: `src/app/api/metrics/posts/route.ts`

**Interfaces:**
- Consumes (Task 3): `parseRango`, `buildMetricPost`, `RANGO_ERROR`; `getPostRows` de `@/lib/posts`; `SITE_TIMEZONE` de `@/lib/analytics`; `SOCIAL_NETWORKS` de `@/db/schema`; tablas `scheduledPosts`/`scheduledPostTargets`; `env` de `@/lib/env`; `Atributos` de atributos.ts.

- [ ] **Step 1: Crear la ruta**

```ts
// src/app/api/metrics/posts/route.ts
import { NextResponse } from 'next/server'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { env } from '@/lib/env'
import { buildMetricPost, parseRango } from '@/lib/metrics-api'
import { getPostRows } from '@/lib/posts'
import type { Atributos } from '@/lib/social/publish/atributos'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const key = env('SCHEDULE_API_KEY')
  // Sin llave configurada el endpoint queda cerrado — molde del batch.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const url = new URL(request.url)
  const rango = parseRango(
    url.searchParams.get('desde'),
    url.searchParams.get('hasta'),
    new Date(),
    SITE_TIMEZONE,
  )
  if ('error' in rango) return NextResponse.json({ error: rango.error }, { status: 400 })

  const red = url.searchParams.get('red')
  if (red !== null && !(SOCIAL_NETWORKS as readonly string[]).includes(red)) {
    return NextResponse.json({ error: `Red desconocida: ${red}.` }, { status: 400 })
  }

  // Mismo motor que el panel: acumulado + ganado en la ventana, visitas por ?s=.
  const rows = (
    await getPostRows({ from: rango.from, to: rango.to, profileId: null, includeBots: false })
  ).filter(
    (row) =>
      (red === null || row.network === red) &&
      row.publishedAt.getTime() >= rango.from.getTime() &&
      row.publishedAt.getTime() <= rango.to.getTime(),
  )

  // Los atributos del calendario, unidos por (red, externalId) en memoria: un post
  // orgánico simplemente no aparece aquí y sale con atributos null.
  const externalIds = rows.map((row) => row.externalId)
  const atributosByKey = new Map<string, Atributos | null>()
  if (externalIds.length > 0) {
    const scheduled = await getDb()
      .select({
        network: scheduledPostTargets.network,
        externalId: scheduledPostTargets.externalId,
        atributos: scheduledPosts.atributos,
      })
      .from(scheduledPostTargets)
      .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
      .where(
        and(
          isNotNull(scheduledPostTargets.externalId),
          inArray(scheduledPostTargets.externalId, externalIds),
        ),
      )
    for (const s of scheduled) {
      atributosByKey.set(`${s.network}:${s.externalId}`, (s.atributos as Atributos | null) ?? null)
    }
  }

  return NextResponse.json({
    posts: rows.map((row) =>
      buildMetricPost(row, atributosByKey.get(`${row.network}:${row.externalId}`) ?? null, SITE_TIMEZONE),
    ),
  })
}
```

NOTA para el implementador: `getPostRows` limita a 200 posts recientes y no filtra
por fecha de publicación (filtra métricas por ventana) — el `.filter` de arriba es
lo que acota la lista a lo PUBLICADO dentro del rango, que es el contrato del
endpoint. Verifica que `SOCIAL_NETWORKS` se exporte de `@/db/schema` (existe).

- [ ] **Step 2: Verificar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit && npx next build`
Expected: todo verde y el build compila la ruta nueva.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/metrics/posts/route.ts
git commit -m "Agrega GET /api/metrics/posts para el editor-LLM"
```

---

### Task 5: Atributos en el editor del panel

**Files:**
- Modify: `src/app/admin/(dash)/schedule/[id]/page.tsx`
- Modify: `src/app/admin/(dash)/schedule/[id]/editor.tsx`
- Modify: `src/app/admin/actions.ts` (`updateScheduledPost`)

**Interfaces:**
- Consumes (Task 1): `validateAtributos`, `ATRIBUTOS_ERROR` de `@/lib/social/publish/atributos`. Campo nuevo del form: `atributos` (textarea con JSON o vacío).

- [ ] **Step 1: page.tsx pasa los atributos**

El `<Editor …>` gana `atributos={post.atributos ? JSON.stringify(post.atributos, null, 2) : ''}`.

- [ ] **Step 2: editor.tsx — el textarea**

Props: `atributos: string`. Tras la sección de Portada, dentro del `<fieldset>`:

```tsx
          <label className="block">
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Atributos (JSON del editor de contenido)
            </span>
            <textarea
              name="atributos"
              defaultValue={atributos}
              rows={3}
              placeholder='{"hook": "pregunta-polemica", "tema": "negocios"}'
              className="w-full rounded-xl bg-white/[0.05] px-3 py-2 font-mono text-xs text-fg outline-none"
            />
          </label>
```

- [ ] **Step 3: updateScheduledPost los procesa**

Imports: sumar `import { validateAtributos, ATRIBUTOS_ERROR } from '@/lib/social/publish/atributos'`.

Tras leer los campos existentes del form:

```ts
  const atributosRaw = String(formData.get('atributos') ?? '').trim()
  let atributos: Atributos | null = null
  if (atributosRaw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(atributosRaw)
    } catch {
      return { error: ATRIBUTOS_ERROR }
    }
    const check = validateAtributos(parsed)
    if ('error' in check) return { error: check.error }
    atributos = check.atributos
  }
```

(Con `import type { Atributos } from '@/lib/social/publish/atributos'` sumado a los imports.)

Y el `.set()` del update del post suma `atributos`.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run && npm run lint && npx tsc --noEmit && npx next build`
Expected: todo verde.

```bash
git add "src/app/admin/(dash)/schedule/[id]/page.tsx" "src/app/admin/(dash)/schedule/[id]/editor.tsx" src/app/admin/actions.ts
git commit -m "Muestra y edita los atributos en el editor de posts"
```
