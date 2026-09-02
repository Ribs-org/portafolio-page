# Calendario semanal y edición de posts programados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alternador «Lista | Calendario» en `/admin/schedule` (semana de 7 columnas) y página `/admin/schedule/<id>` para editar texto, fecha, redes y media de un post programado, re-armando los destinos fallidos al guardar.

**Architecture:** La vista vive en la URL (`?vista=calendario&semana=YYYY-MM-DD`), calendario y editor son páginas server-rendered con un client component solo para el formulario. La matemática de semana y los diffs de media/targets son módulos puros testeables; el server action `updateScheduledPost` los orquesta con guards de status en cada WHERE para no chocar con el cron.

**Tech Stack:** Next.js App Router (params/searchParams como Promise), Drizzle + Neon (neon-http, SIN transacciones interactivas), Vercel Blob, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-calendario-edicion-design.md`

## Global Constraints

- Frases de error fijas en español, EXACTAS como aparecen en cada task; detalle upstream solo a `console.error` truncado (`.slice(0, 200)`).
- Cero dependencias nuevas en package.json.
- Driver neon-http: NO usar `db.transaction` interactivo; los writes van secuenciales y el orden del task 4 es contractual.
- Todo cálculo de día/hora visible usa `SITE_TIMEZONE` (import desde `@/lib/analytics`, solo en código server); los módulos puros reciben la zona como parámetro y NUNCA importan `@/lib/analytics` (es server-only y rompe vitest).
- Destinos `published` jamás se borran ni se tocan; `publishing` bloquea la edición entera.
- Los archivos bajo `src/app/admin/(dash)/schedule/` usan comillas en rutas de shell (los paréntesis rompen bash sin ellas).
- Correr `npx vitest run` (suite completa) antes de cada commit.

---

### Task 1: Matemática de semana (`schedule-week.ts`)

**Files:**
- Create: `src/lib/schedule-week.ts`
- Test: `src/lib/schedule-week.test.ts`

**Interfaces:**
- Consumes: `toZonedInput(date: Date | null, timeZone: string): string` de `@/lib/utils` (ya existe; devuelve `YYYY-MM-DDTHH:MM` wall-clock en la zona).
- Produces (para el task 3): `dayKey(date, zone): string` (`YYYY-MM-DD`), `hourLabel(date, zone): string` (`HH:MM`), `mondayOf(date, zone): string`, `mondayOfKey(key): string`, `addDays(key, n): string`, `weekDays(monday): string[]` (7 keys), `normalizeWeekParam(param, now, zone): string`, `weekLabel(monday): string`, `dayLabel(key, index): string`, `groupByDay<T extends { scheduledAt: Date }>(items: T[], zone: string): Map<string, T[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/schedule-week.test.ts
import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKey,
  dayLabel,
  groupByDay,
  hourLabel,
  mondayOf,
  mondayOfKey,
  normalizeWeekParam,
  weekDays,
  weekLabel,
} from './schedule-week'

const ZONE = 'America/Santiago'

describe('dayKey y hourLabel', () => {
  it('convierte un instante UTC al día y la hora de la zona', () => {
    // 02:30 UTC del 8 sep = 22:30 del 7 sep en Chile (UTC-4).
    const d = new Date('2026-09-08T02:30:00Z')
    expect(dayKey(d, ZONE)).toBe('2026-09-07')
    expect(hourLabel(d, ZONE)).toBe('22:30')
  })
})

describe('mondayOf y mondayOfKey', () => {
  it('encuentra el lunes de la semana de cualquier día', () => {
    expect(mondayOfKey('2026-09-09')).toBe('2026-09-07') // miércoles
    expect(mondayOfKey('2026-09-07')).toBe('2026-09-07') // lunes
    expect(mondayOfKey('2026-09-13')).toBe('2026-09-07') // domingo
  })

  it('respeta la zona: un lunes temprano en Chile sigue siendo de esa semana', () => {
    // 03:00 UTC del lunes 7 = domingo 6 a las 23:00 en Chile.
    expect(mondayOf(new Date('2026-09-07T03:00:00Z'), ZONE)).toBe('2026-08-31')
  })
})

describe('addDays y weekDays', () => {
  it('suma días cruzando meses', () => {
    expect(addDays('2026-08-31', 7)).toBe('2026-09-07')
    expect(addDays('2026-09-07', -7)).toBe('2026-08-31')
  })

  it('la semana son 7 días desde el lunes', () => {
    expect(weekDays('2026-09-07')).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ])
  })
})

describe('normalizeWeekParam', () => {
  const now = new Date('2026-09-09T15:00:00Z')

  it('un lunes válido pasa tal cual; otro día se normaliza a su lunes', () => {
    expect(normalizeWeekParam('2026-09-07', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam('2026-09-10', now, ZONE)).toBe('2026-09-07')
  })

  it('ilegible o fecha imposible cae a la semana actual', () => {
    expect(normalizeWeekParam('mañana', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam('2026-02-31', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam(undefined, now, ZONE)).toBe('2026-09-07')
  })
})

describe('weekLabel y dayLabel', () => {
  it('misma quincena, mes distinto y cruce de año', () => {
    expect(weekLabel('2026-09-07')).toBe('7 – 13 sep')
    expect(weekLabel('2026-08-31')).toBe('31 ago – 6 sep')
    expect(weekLabel('2026-12-28')).toBe('28 dic 2026 – 3 ene 2027')
  })

  it('la columna dice el día de la semana y el número', () => {
    expect(dayLabel('2026-09-07', 0)).toBe('lun 7')
    expect(dayLabel('2026-09-13', 6)).toBe('dom 13')
  })
})

describe('groupByDay', () => {
  it('agrupa por día de la zona, no del servidor', () => {
    const items = [
      { id: 'a', scheduledAt: new Date('2026-09-08T02:30:00Z') }, // 7 sep en Chile
      { id: 'b', scheduledAt: new Date('2026-09-08T15:00:00Z') }, // 8 sep en Chile
    ]
    const grouped = groupByDay(items, ZONE)
    expect(grouped.get('2026-09-07')?.map((i) => i.id)).toEqual(['a'])
    expect(grouped.get('2026-09-08')?.map((i) => i.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/schedule-week.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/schedule-week.ts
// Pure week math for the schedule calendar. The zone always arrives as a parameter:
// importing SITE_TIMEZONE here would drag `server-only` into vitest and the client.
import { toZonedInput } from '@/lib/utils'

/** The wall-clock day (`YYYY-MM-DD`) this instant falls on in `zone`. */
export function dayKey(date: Date, zone: string): string {
  return toZonedInput(date, zone).slice(0, 10)
}

/** The wall-clock `HH:MM` this instant reads as in `zone`. */
export function hourLabel(date: Date, zone: string): string {
  return toZonedInput(date, zone).slice(11, 16)
}

/**
 * Day-key arithmetic rides UTC on purpose: a key is already a wall-clock date, so
 * shifting it is pure calendar math with no zone left in it.
 */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function mondayOfKey(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay() // 0 = domingo
  return addDays(key, -((dow + 6) % 7))
}

export function mondayOf(date: Date, zone: string): string {
  return mondayOfKey(dayKey(date, zone))
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/**
 * `?semana=` as typed by nobody: it comes from our own links, but a hand-edited URL
 * must land somewhere sane. Non-Mondays normalise to their Monday; anything
 * unparseable (including impossible dates like Feb 31, which UTC math would silently
 * roll over) falls back to the current week.
 */
export function normalizeWeekParam(
  param: string | undefined,
  now: Date,
  zone: string,
): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && addDays(param, 0) === param) {
    return mondayOfKey(param)
  }
  return mondayOf(now, zone)
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** «7 – 13 sep», «31 ago – 6 sep», y con años solo cuando la semana los cruza. */
export function weekLabel(monday: string): string {
  const end = addDays(monday, 6)
  const [y1, m1, d1] = monday.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  const crossesYear = y1 !== y2
  const left = crossesYear
    ? `${d1} ${MONTHS[m1! - 1]} ${y1}`
    : m1 !== m2
      ? `${d1} ${MONTHS[m1! - 1]}`
      : `${d1}`
  const right = `${d2} ${MONTHS[m2! - 1]}${crossesYear ? ` ${y2}` : ''}`
  return `${left} – ${right}`
}

/** `index` es la posición en `weekDays` (0 = lunes), no se deriva de la fecha. */
export function dayLabel(key: string, index: number): string {
  return `${DOW[index]} ${Number(key.slice(8))}`
}

export function groupByDay<T extends { scheduledAt: Date }>(
  items: T[],
  zone: string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const key = dayKey(item.scheduledAt, zone)
    const bucket = grouped.get(key) ?? []
    bucket.push(item)
    grouped.set(key, bucket)
  }
  return grouped
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/schedule-week.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run
git add src/lib/schedule-week.ts src/lib/schedule-week.test.ts
git commit -m "Agrega la matemática de semana del calendario"
```

---

### Task 2: Diffs de edición (`edit.ts`) y export de `mediaToBlob`

**Files:**
- Create: `src/lib/social/publish/edit.ts`
- Modify: `src/lib/social/publish/batch.ts` (solo: `async function mediaToBlob` → `export async function mediaToBlob`)
- Test: `src/lib/social/publish/edit.test.ts`

**Interfaces:**
- Consumes: nada de otros tasks.
- Produces (para el task 4):
  - `type TargetLite = { id: string; network: string; status: string }`
  - `type TargetsPlan = { create: string[]; deleteIds: string[]; rearmIds: string[] }`
  - `PUBLISHED_LOCKED = 'No se puede quitar una red ya publicada.'`
  - `diffTargets(current: TargetLite[], chosen: string[]): { error: string } | TargetsPlan`
  - `type MediaOrderEntry = { kind: 'kept'; id: string } | { kind: 'new'; url: string; mediaType: 'image' | 'video' }`
  - `diffMedia(existingIds: string[], orderedKeptIds: string[], added: Array<{ url: string; mediaType: 'image' | 'video' }>): { deleteIds: string[]; order: MediaOrderEntry[] }`
  - `mediaToBlob(url: string, expected: 'image' | 'video' | null)` exportado desde `./batch`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/social/publish/edit.test.ts
import { describe, expect, it } from 'vitest'
import { diffMedia, diffTargets, PUBLISHED_LOCKED } from './edit'

describe('diffTargets', () => {
  const current = [
    { id: 't1', network: 'instagram', status: 'published' },
    { id: 't2', network: 'x', status: 'failed' },
    { id: 't3', network: 'threads', status: 'scheduled' },
  ]

  it('crea las nuevas, borra las desmarcadas pendientes y re-arma las fallidas que quedan', () => {
    expect(diffTargets(current, ['instagram', 'x', 'facebook'])).toEqual({
      create: ['facebook'],
      deleteIds: ['t3'],
      rearmIds: ['t2'],
    })
  })

  it('desmarcar una red ya publicada es el error fijo', () => {
    expect(diffTargets(current, ['x', 'threads'])).toEqual({ error: PUBLISHED_LOCKED })
  })

  it('una fallida desmarcada se borra, no se re-arma', () => {
    expect(diffTargets(current, ['instagram', 'threads'])).toEqual({
      create: [],
      deleteIds: ['t2'],
      rearmIds: [],
    })
  })

  it('publishing jamás aparece en el plan aunque el form lo desmarque', () => {
    const withPublishing = [{ id: 't9', network: 'youtube', status: 'publishing' }]
    expect(diffTargets(withPublishing, [])).toEqual({ create: [], deleteIds: [], rearmIds: [] })
  })
})

describe('diffMedia', () => {
  it('borra lo quitado y arma el orden final: lo que queda (en su orden) más lo nuevo', () => {
    const added = [{ url: 'https://blob/n1.jpg', mediaType: 'image' as const }]
    expect(diffMedia(['m1', 'm2', 'm3'], ['m3', 'm1'], added)).toEqual({
      deleteIds: ['m2'],
      order: [
        { kind: 'kept', id: 'm3' },
        { kind: 'kept', id: 'm1' },
        { kind: 'new', url: 'https://blob/n1.jpg', mediaType: 'image' },
      ],
    })
  })

  it('un id ajeno en la lista de conservadas se ignora: el form no inventa media', () => {
    expect(diffMedia(['m1'], ['m1', 'hack'], [])).toEqual({
      deleteIds: [],
      order: [{ kind: 'kept', id: 'm1' }],
    })
  })

  it('sin media queda todo vacío', () => {
    expect(diffMedia([], [], [])).toEqual({ deleteIds: [], order: [] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/social/publish/edit.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/social/publish/edit.ts
// Pure planning for the scheduled-post editor: what the form chose, resolved against
// what the database holds, into writes the action can apply with status guards.

export type TargetLite = { id: string; network: string; status: string }
export type TargetsPlan = { create: string[]; deleteIds: string[]; rearmIds: string[] }

export const PUBLISHED_LOCKED = 'No se puede quitar una red ya publicada.'

/**
 * Published targets are immovable: the form locks their checkbox, so an absence here
 * means a manipulated request — refused, not silently kept. Publishing targets never
 * enter any list: the action refuses the whole edit while one exists, and this guard
 * is the second line for the race where one slips in between read and write.
 */
export function diffTargets(
  current: TargetLite[],
  chosen: string[],
): { error: string } | TargetsPlan {
  const chosenSet = new Set(chosen)
  for (const target of current) {
    if (target.status === 'published' && !chosenSet.has(target.network)) {
      return { error: PUBLISHED_LOCKED }
    }
  }
  const existing = new Set(current.map((t) => t.network))
  return {
    create: chosen.filter((network) => !existing.has(network)),
    deleteIds: current
      .filter((t) => !chosenSet.has(t.network) && (t.status === 'scheduled' || t.status === 'failed'))
      .map((t) => t.id),
    rearmIds: current
      .filter((t) => chosenSet.has(t.network) && t.status === 'failed')
      .map((t) => t.id),
  }
}

export type MediaOrderEntry =
  | { kind: 'kept'; id: string }
  | { kind: 'new'; url: string; mediaType: 'image' | 'video' }

/**
 * The final order is the form's kept list (in its order) followed by the additions.
 * Kept ids that do not exist on the post are dropped: the form cannot conjure media.
 */
export function diffMedia(
  existingIds: string[],
  orderedKeptIds: string[],
  added: Array<{ url: string; mediaType: 'image' | 'video' }>,
): { deleteIds: string[]; order: MediaOrderEntry[] } {
  const existing = new Set(existingIds)
  const kept = orderedKeptIds.filter((id) => existing.has(id))
  const keptSet = new Set(kept)
  return {
    deleteIds: existingIds.filter((id) => !keptSet.has(id)),
    order: [
      ...kept.map((id) => ({ kind: 'kept' as const, id })),
      ...added.map((m) => ({ kind: 'new' as const, url: m.url, mediaType: m.mediaType })),
    ],
  }
}
```

Y en `src/lib/social/publish/batch.ts`, SOLO cambiar la línea de la firma:

```ts
export async function mediaToBlob(
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/social/publish/edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run
git add src/lib/social/publish/edit.ts src/lib/social/publish/edit.test.ts src/lib/social/publish/batch.ts
git commit -m "Agrega los diffs puros del editor y exporta mediaToBlob"
```

---

### Task 3: Alternador y calendario semanal

**Files:**
- Modify: `src/app/admin/(dash)/schedule/page.tsx` (completo; hoy tiene 31 líneas)
- Create: `src/app/admin/(dash)/schedule/calendar.tsx`

**Interfaces:**
- Consumes (task 1): `dayLabel`, `dayKey`, `groupByDay`, `hourLabel`, `normalizeWeekParam`, `addDays`, `weekDays`, `weekLabel` de `@/lib/schedule-week`.
- Produces (para el task 5): la consulta de página con media adjunta (`QueueItem` con `media`), y los links de tarjeta `/admin/schedule/<id>?volver=<query-actual>`.

- [ ] **Step 1: Reescribir `page.tsx`**

```tsx
// src/app/admin/(dash)/schedule/page.tsx
import Link from 'next/link'
import { asc, eq, inArray } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { normalizeWeekParam } from '@/lib/schedule-week'
import { cn } from '@/lib/utils'
import { Composer } from './composer'
import { BatchUpload } from './batch-upload'
import { Queue } from './queue'
import { WeekCalendar } from './calendar'

export const dynamic = 'force-dynamic'

/**
 * Rebuilds the page URL flipping one key, carrying the rest — the content page's
 * `contentHref` mold. `mensaje` never carries over (one-shot OAuth outcome).
 */
function scheduleHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key in changes || key === 'mensaje') continue
    if (typeof value === 'string') next.set(key, value)
    else if (Array.isArray(value)) for (const v of value) next.append(key, v)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/admin/schedule?${query}` : '/admin/schedule'
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const calendarView = params.vista === 'calendario'
  const monday = normalizeWeekParam(
    typeof params.semana === 'string' ? params.semana : undefined,
    new Date(),
    SITE_TIMEZONE,
  )

  const db = getDb()
  const rows = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .orderBy(asc(scheduledPosts.scheduledAt))

  const posts = new Map<
    string,
    {
      post: (typeof rows)[number]['post']
      targets: Array<(typeof rows)[number]['target']>
      media: Array<typeof scheduledPostMedia.$inferSelect>
    }
  >()
  for (const row of rows) {
    const entry = posts.get(row.post.id) ?? { post: row.post, targets: [], media: [] }
    entry.targets.push(row.target)
    posts.set(row.post.id, entry)
  }

  // Media in its own query: joining it above would multiply post×target×media rows
  // for nothing, and the calendar only needs the first thumbnail anyway.
  const ids = [...posts.keys()]
  if (ids.length > 0) {
    const media = await db
      .select()
      .from(scheduledPostMedia)
      .where(inArray(scheduledPostMedia.postId, ids))
      .orderBy(asc(scheduledPostMedia.position))
    for (const m of media) posts.get(m.postId)?.media.push(m)
  }

  const items = [...posts.values()]
  // `volver` carries the exact view to return to after editing — list or a given week.
  const volver = scheduleHref(params, {})

  return (
    <div className="space-y-6">
      <Composer />
      <BatchUpload />
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          {[
            { label: 'Lista', href: scheduleHref(params, { vista: null, semana: null }), active: !calendarView },
            { label: 'Calendario', href: scheduleHref(params, { vista: 'calendario' }), active: calendarView },
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                'rounded-full px-2.5 py-1 font-mono text-[0.68rem] transition-colors',
                tab.active ? 'bg-white/[0.14] text-fg' : 'bg-white/[0.05] text-fg-faint hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {calendarView ? (
          <WeekCalendar
            monday={monday}
            items={items}
            zone={SITE_TIMEZONE}
            volver={volver}
            prevHref={scheduleHref(params, { vista: 'calendario', semana: addDaysHref(monday, -7) })}
            nextHref={scheduleHref(params, { vista: 'calendario', semana: addDaysHref(monday, 7) })}
          />
        ) : (
          <Queue items={items} volver={volver} />
        )}
      </div>
    </div>
  )
}

// Local alias so the import list stays honest about who does date math.
import { addDays as addDaysHref } from '@/lib/schedule-week'
```

NOTA para el implementador: el import de `addDays` va arriba con los demás imports (el bloque final del snippet solo indica el alias; en el archivo real escríbelo en la cabecera como `import { addDays, normalizeWeekParam } from '@/lib/schedule-week'` y usa `addDays(monday, -7)` directo).

- [ ] **Step 2: Crear `calendar.tsx`**

```tsx
// src/app/admin/(dash)/schedule/calendar.tsx
import Image from 'next/image'
import Link from 'next/link'
import type { ScheduledPost, ScheduledPostTarget } from '@/db/schema'
import { dayLabel, dayKey, groupByDay, hourLabel, weekDays, weekLabel } from '@/lib/schedule-week'
import { cn } from '@/lib/utils'

type Item = {
  post: ScheduledPost
  targets: ScheduledPostTarget[]
  media: Array<{ blobUrl: string; mediaType: string }>
}

const DOT: Record<string, string> = {
  scheduled: 'bg-white/40',
  publishing: 'bg-amber-400',
  published: 'bg-emerald-400',
  failed: 'bg-red-400',
}

export function WeekCalendar({
  monday,
  items,
  zone,
  volver,
  prevHref,
  nextHref,
}: {
  monday: string
  items: Item[]
  zone: string
  volver: string
  prevHref: string
  nextHref: string
}) {
  const days = weekDays(monday)
  const today = dayKey(new Date(), zone)
  const week = new Set(days)
  const grouped = groupByDay(
    items
      .map((item) => ({ ...item, scheduledAt: item.post.scheduledAt }))
      .filter((item) => week.has(dayKey(item.scheduledAt, zone))),
    zone,
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link href={prevHref} className="text-fg-faint transition-colors hover:text-fg">
          ← Semana anterior
        </Link>
        <span className="font-mono text-[0.8rem] text-fg-muted">{weekLabel(monday)}</span>
        <Link href={nextHref} className="text-fg-faint transition-colors hover:text-fg">
          Semana siguiente →
        </Link>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[52rem] grid-cols-7 gap-2">
          {days.map((day, index) => (
            <div
              key={day}
              className={cn('rounded-xl p-2', day === today ? 'bg-white/[0.06]' : 'bg-white/[0.02]')}
            >
              <p
                className={cn(
                  'mb-2 font-mono text-[0.65rem] uppercase tracking-[0.14em]',
                  day === today ? 'text-fg' : 'text-fg-faint',
                )}
              >
                {dayLabel(day, index)}
              </p>
              <div className="space-y-2">
                {(grouped.get(day) ?? []).map(({ post, targets, media }) => (
                  <Link
                    key={post.id}
                    href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                    className="block rounded-lg bg-white/[0.05] p-2 transition-colors hover:bg-white/[0.1]"
                  >
                    <p className="font-mono text-[0.65rem] text-fg-faint">
                      {hourLabel(post.scheduledAt, zone)}
                    </p>
                    {media[0] ? (
                      media[0].mediaType === 'image' ? (
                        <Image
                          src={media[0].blobUrl}
                          alt=""
                          width={120}
                          height={64}
                          unoptimized
                          className="mt-1 h-16 w-full rounded object-cover"
                        />
                      ) : (
                        <span className="mt-1 block rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.6rem] text-fg-faint">
                          video
                        </span>
                      )
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-fg">
                      {post.caption || '(sin texto)'}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      {targets.map((target) => (
                        <span
                          key={target.id}
                          title={`${target.network}: ${target.status}`}
                          className={cn('h-2 w-2 rounded-full', DOT[target.status] ?? 'bg-white/40')}
                        />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `Queue` acepta y usa `volver`**

En `src/app/admin/(dash)/schedule/queue.tsx`: agregar la prop `volver: string` y, en cada `<li>`, junto al botón Eliminar, el link de edición (la lista es la otra lente de la misma cola — sin él, la vista Lista no llega al editor):

```tsx
<Link
  href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
  className="text-xs text-fg-faint hover:text-fg"
>
  Editar
</Link>
```

(con `import Link from 'next/link'` arriba; el botón Eliminar existente no cambia).

- [ ] **Step 4: Verificar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: suite verde, lint y tipos limpios. `/admin/schedule/<id>` aún no existe (404 al hacer clic) — llega en el task 5; este task entrega la vista.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(dash)/schedule/page.tsx" "src/app/admin/(dash)/schedule/calendar.tsx" "src/app/admin/(dash)/schedule/queue.tsx"
git commit -m "Agrega el alternador Lista|Calendario con la semana de 7 columnas"
```

---

### Task 4: Server action `updateScheduledPost`

**Files:**
- Modify: `src/app/admin/actions.ts` (agregar imports y la función al final de la sección de schedule, junto a `createScheduledPost`)

**Interfaces:**
- Consumes (task 2): `diffMedia`, `diffTargets`, `mediaToBlob` (de `@/lib/social/publish/edit` y `@/lib/social/publish/batch`); `mediaTypeFromUrl` ya exportado en batch.
- Produces (para el task 5): `updateScheduledPost(postId: string, _prev: FormState, formData: FormData): Promise<FormState>` — se usa con `.bind(null, postId)` en `useActionState`. Campos del form: `caption` (string), `scheduledAt` (datetime-local), `networks` (repetido), `keptMedia` (repetido, ids en orden final), `media` (files), `mediaUrls` (textarea, una URL por línea), `volver` (string).

- [ ] **Step 1: Agregar imports en `actions.ts`**

A los imports existentes, sumar: `asc`, `inArray` a la línea de drizzle-orm; y

```ts
import { diffMedia, diffTargets } from '@/lib/social/publish/edit'
import { mediaToBlob, mediaTypeFromUrl } from '@/lib/social/publish/batch'
```

- [ ] **Step 2: Escribir la función**

```ts
export async function updateScheduledPost(
  postId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth()
  const db = getDb()

  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId))
  if (!post) return { error: 'El post ya no existe.' }

  const targets = await db
    .select()
    .from(scheduledPostTargets)
    .where(eq(scheduledPostTargets.postId, postId))
  if (targets.some((t) => t.status === 'publishing')) {
    return { error: 'Hay una publicación en curso. Vuelve en un minuto.' }
  }

  const existingMedia = await db
    .select()
    .from(scheduledPostMedia)
    .where(eq(scheduledPostMedia.postId, postId))
    .orderBy(asc(scheduledPostMedia.position))

  const caption = String(formData.get('caption') ?? '').trim()
  const networks = formData.getAll('networks').map(String)
  const scheduledAt = fromZonedInput(String(formData.get('scheduledAt') ?? ''), SITE_TIMEZONE)
  const keptIds = formData.getAll('keptMedia').map(String)
  const files = formData.getAll('media').filter((f): f is File => f instanceof File && f.size > 0)
  const urls = String(formData.get('mediaUrls') ?? '')
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean)

  const targetsPlan = diffTargets(targets, networks)
  if ('error' in targetsPlan) return { error: targetsPlan.error }

  // Pre-validation before touching storage: kept media with their stored types, files
  // with their real types, URLs counted as images — the batch's deferred-type rule
  // (image is the guess that never falsely rejects; the re-check below settles it).
  const typeById = new Map(existingMedia.map((m) => [m.id, m.mediaType]))
  const keptTypes = keptIds
    .map((id) => typeById.get(id))
    .filter((t): t is 'image' | 'video' => t === 'image' || t === 'video')
  const fileVideo = files.filter((f) => f.type.startsWith('video/')).length
  const preImages =
    keptTypes.filter((t) => t === 'image').length + (files.length - fileVideo) + urls.length
  const preVideos = keptTypes.filter((t) => t === 'video').length + fileVideo
  const preError = validateScheduleDraft(
    { caption, imageCount: preImages, videoCount: preVideos, networks, scheduledAt },
    new Date(),
  )
  if (preError) return { error: preError }

  const added: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const file of files) {
    const blob = await put(`scheduled/${randomUUID()}-${file.name}`, file, { access: 'public' })
    added.push({ url: blob.url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
  }
  for (const url of urls) {
    const stored = await mediaToBlob(url, mediaTypeFromUrl(url))
    if (!stored) return { error: 'No se pudo leer una media por URL.' }
    added.push(stored)
  }

  const mediaPlan = diffMedia(existingMedia.map((m) => m.id), keptIds, added)

  // Re-check with the real types now that every URL resolved (a Drive link that
  // turned out to be a video where only images fit fails here, nothing saved).
  const finalTypes = mediaPlan.order.map((entry) =>
    entry.kind === 'kept' ? typeById.get(entry.id)! : entry.mediaType,
  )
  const error = validateScheduleDraft(
    {
      caption,
      imageCount: finalTypes.filter((t) => t === 'image').length,
      videoCount: finalTypes.filter((t) => t === 'video').length,
      networks,
      scheduledAt,
    },
    new Date(),
  )
  if (error) return { error }

  // Sequential writes (neon-http has no interactive transactions); worst-case cut
  // leaves media updated with old targets — the same partial-failure profile already
  // accepted in createScheduledPost. Every target write carries its status guard so
  // a cron claim between the read above and here loses nothing but this edit's touch.
  await db.update(scheduledPosts).set({ caption, scheduledAt: scheduledAt! }).where(eq(scheduledPosts.id, postId))

  if (mediaPlan.deleteIds.length > 0) {
    await db.delete(scheduledPostMedia).where(inArray(scheduledPostMedia.id, mediaPlan.deleteIds))
  }
  for (const [position, entry] of mediaPlan.order.entries()) {
    if (entry.kind === 'kept') {
      await db.update(scheduledPostMedia).set({ position }).where(eq(scheduledPostMedia.id, entry.id))
    } else {
      await db.insert(scheduledPostMedia).values({
        postId,
        blobUrl: entry.url,
        mediaType: entry.mediaType,
        position,
      })
    }
  }

  if (targetsPlan.create.length > 0) {
    await db
      .insert(scheduledPostTargets)
      .values(targetsPlan.create.map((network) => ({ postId, network })))
  }
  if (targetsPlan.deleteIds.length > 0) {
    await db.delete(scheduledPostTargets).where(
      and(
        inArray(scheduledPostTargets.id, targetsPlan.deleteIds),
        inArray(scheduledPostTargets.status, ['scheduled', 'failed']),
      ),
    )
  }
  for (const id of targetsPlan.rearmIds) {
    await db
      .update(scheduledPostTargets)
      .set({ status: 'scheduled', attemptCount: 0, lastError: null, updatedAt: new Date() })
      .where(and(eq(scheduledPostTargets.id, id), eq(scheduledPostTargets.status, 'failed')))
  }

  revalidatePath('/admin/schedule')

  // Only our own schedule views are valid return targets; anything else in `volver`
  // (a crafted form) falls back to the plain page.
  const volver = String(formData.get('volver') ?? '')
  redirect(volver.startsWith('/admin/schedule') ? volver : '/admin/schedule')
}
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todo verde (la función aún no tiene consumidor; el task 5 la usa).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "Agrega updateScheduledPost con guards de estado contra el cron"
```

---

### Task 5: Página de edición `/admin/schedule/[id]`

**Files:**
- Create: `src/app/admin/(dash)/schedule/[id]/page.tsx`
- Create: `src/app/admin/(dash)/schedule/[id]/editor.tsx`

**Interfaces:**
- Consumes: `updateScheduledPost` (task 4), `deleteScheduledPost` (ya existe: `(postId: string) => Promise<FormState>`), `toZonedInput` de `@/lib/utils`, `SITE_TIMEZONE` de `@/lib/analytics` (solo en page.tsx, nunca en el client), `networkLabel` de `@/lib/networks`.
- Produces: nada aguas abajo.

- [ ] **Step 1: Crear `page.tsx`**

```tsx
// src/app/admin/(dash)/schedule/[id]/page.tsx
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { toZonedInput } from '@/lib/utils'
import { Editor } from './editor'

export const dynamic = 'force-dynamic'

export default async function EditScheduledPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const volver =
    typeof query.volver === 'string' && query.volver.startsWith('/admin/schedule')
      ? query.volver
      : '/admin/schedule'

  const db = getDb()
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id))
  if (!post) notFound()

  const [targets, media] = await Promise.all([
    db.select().from(scheduledPostTargets).where(eq(scheduledPostTargets.postId, id)),
    db
      .select()
      .from(scheduledPostMedia)
      .where(eq(scheduledPostMedia.postId, id))
      .orderBy(asc(scheduledPostMedia.position)),
  ])

  return (
    <Editor
      postId={id}
      volver={volver}
      caption={post.caption}
      scheduledAtLocal={toZonedInput(post.scheduledAt, SITE_TIMEZONE)}
      targets={targets.map((t) => ({ network: t.network, status: t.status }))}
      media={media.map((m) => ({ id: m.id, blobUrl: m.blobUrl, mediaType: m.mediaType }))}
    />
  )
}
```

- [ ] **Step 2: Crear `editor.tsx`**

```tsx
// src/app/admin/(dash)/schedule/[id]/editor.tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteScheduledPost, updateScheduledPost, type FormState } from '@/app/admin/actions'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'

// Twin of ENABLED in the composer (schedule/composer.tsx) — update both together.
const NETWORKS = ['instagram', 'facebook', 'youtube', 'threads', 'x']

type MediaRow = { id: string; blobUrl: string; mediaType: string }

export function Editor({
  postId,
  volver,
  caption,
  scheduledAtLocal,
  targets,
  media,
}: {
  postId: string
  volver: string
  caption: string
  scheduledAtLocal: string
  targets: Array<{ network: string; status: string }>
  media: MediaRow[]
}) {
  const publishing = targets.some((t) => t.status === 'publishing')
  const published = new Set(targets.filter((t) => t.status === 'published').map((t) => t.network))
  const initialNetworks = new Set(targets.map((t) => t.network))

  const [kept, setKept] = useState<MediaRow[]>(media)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateScheduledPost.bind(null, postId),
    {},
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()
  const router = useRouter()

  function move(index: number, delta: number) {
    const next = [...kept]
    const swap = index + delta
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap]!, next[index]!]
    setKept(next)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">Editar post</h1>
        <Link href={volver} className="text-sm text-fg-faint transition-colors hover:text-fg">
          ← Volver
        </Link>
      </div>

      {publishing ? (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Hay una publicación en curso. Vuelve en un minuto.
        </p>
      ) : null}
      {published.size > 0 ? (
        <p className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Ya publicado en {[...published].map(networkLabel).join(', ')}. Los cambios no tocan lo
          publicado.
        </p>
      ) : null}

      <form action={formAction}>
        <fieldset disabled={publishing || pending} className="space-y-4">
          <input type="hidden" name="volver" value={volver} />
          <label className="block">
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Texto
            </span>
            <textarea
              name="caption"
              defaultValue={caption}
              rows={4}
              className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-fg outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Fecha y hora
            </span>
            <input
              type="datetime-local"
              name="scheduledAt"
              defaultValue={scheduledAtLocal}
              className="rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-fg outline-none"
            />
          </label>

          <div>
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Redes
            </span>
            <div className="flex flex-wrap gap-3">
              {NETWORKS.map((network) => {
                const locked = published.has(network)
                return (
                  <label key={network} className={cn('flex items-center gap-1.5 text-sm', locked && 'opacity-70')}>
                    {/* A disabled checkbox never submits; the hidden twin keeps the
                        published network in the form so the server guard stays a
                        backstop, not the primary path. */}
                    {locked ? <input type="hidden" name="networks" value={network} /> : null}
                    <input
                      type="checkbox"
                      name="networks"
                      value={network}
                      defaultChecked={initialNetworks.has(network)}
                      disabled={locked}
                    />
                    {networkLabel(network)}
                    {locked ? ' ✓' : ''}
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <span className="mb-1 block font-mono text-[0.65rem] uppercase tracking-[0.14em] text-fg-faint">
              Media
            </span>
            {kept.length > 0 ? (
              <ul className="mb-2 space-y-2">
                {kept.map((m, index) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2">
                    <input type="hidden" name="keptMedia" value={m.id} />
                    {m.mediaType === 'image' ? (
                      <Image src={m.blobUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded bg-white/[0.08] font-mono text-[0.6rem] text-fg-faint">
                        video
                      </span>
                    )}
                    <span className="flex-1 truncate text-xs text-fg-faint">{m.blobUrl}</span>
                    <button type="button" onClick={() => move(index, -1)} className="text-fg-faint hover:text-fg">↑</button>
                    <button type="button" onClick={() => move(index, 1)} className="text-fg-faint hover:text-fg">↓</button>
                    <button
                      type="button"
                      onClick={() => setKept(kept.filter((k) => k.id !== m.id))}
                      className="text-xs text-fg-faint hover:text-fg"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="block text-sm">
              Agregar archivos
              <input type="file" name="media" multiple accept="image/*,video/*" className="mt-1 block text-xs" />
            </label>
            <label className="mt-2 block text-sm">
              Agregar por URL (una por línea)
              <textarea
                name="mediaUrls"
                rows={2}
                placeholder="https://…"
                className="mt-1 w-full rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-fg outline-none"
              />
            </label>
          </div>

          {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
          {deleteError ? <p className="text-sm text-red-400">{deleteError}</p> : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-white/[0.12] px-4 py-2 text-sm text-fg transition-colors hover:bg-white/[0.18]"
            >
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  setDeleteError(null)
                  const result = await deleteScheduledPost(postId)
                  if (result.error) setDeleteError(result.error)
                  else router.push(volver)
                })
              }
              className="text-sm text-fg-faint transition-colors hover:text-red-300"
            >
              Eliminar
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todo verde. Además `npx next build` debe compilar (atrapa errores de rutas dinámicas).

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(dash)/schedule/[id]/page.tsx" "src/app/admin/(dash)/schedule/[id]/editor.tsx"
git commit -m "Agrega la página de edición del post programado"
```
