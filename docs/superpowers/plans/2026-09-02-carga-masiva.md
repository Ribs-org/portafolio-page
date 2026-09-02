# Carga masiva de posts — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Programar decenas de posts de una vez — CSV en `/admin/schedule` o `POST /api/schedule/batch` con token — con resultado por fila y la media viajando por URL pública hacia el Blob.

**Architecture:** Un motor `scheduleBatch` (validación pura reusando `validateScheduleDraft`, descarga de media con verificación de tipo, inserciones por las vías de la fase 1) con dos puertas que solo traducen formato: un parser CSV RFC 4180 propio + server action con tabla de resultados, y una ruta con Bearer `SCHEDULE_API_KEY` al molde de `CRON_SECRET`.

**Tech Stack:** Next.js App Router, Drizzle + Neon, Vitest, Vercel Blob.

**Spec:** `docs/superpowers/specs/2026-09-02-carga-masiva-design.md`

## Global Constraints

- Frases fijas en español por fila; detalle upstream (descarga fallida, content-type ajeno) a `console.error` truncado a 300. La API jamás filtra texto upstream.
- Fechas `YYYY-MM-DD HH:MM` interpretadas con `fromZonedInput(valor, SITE_TIMEZONE)`.
- Tope de 50 items por lote. Redes válidas: las cinco publicables (tiktok no).
- Comentarios solo para restricciones que el código no puede mostrar, tono de los vecinos.
- Commits en español, presente, estilo del repo, con footer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01GfKG533gmtPXZ8ku9QpK12`
- Disciplina git del ejecutor: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash, `git add` por archivo, padre verificado tras commitear.
- Verificación: `npx vitest run <archivo>` por task; al final `npm test && npm run typecheck && npm run lint && npm run build`.

---

### Task 1: Parser CSV RFC 4180

**Files:**
- Create: `src/lib/social/publish/csv.ts`
- Test: `src/lib/social/publish/csv.test.ts`

**Interfaces:**
- Produces (usados por Task 5): `parseCsv(text: string): string[][]`;
  `CSV_HEADER_ERROR`; `csvToBatchItems(text: string): { items: Array<{ fecha: string; texto: string; redes: string[]; media: string[] }> } | { error: string }`.

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/social/publish/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CSV_HEADER_ERROR, csvToBatchItems, parseCsv } from './csv'

describe('parseCsv', () => {
  it('separa campos y filas simples', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ])
  })

  it('las comillas protegen comas, saltos de línea y comillas dobles', () => {
    expect(parseCsv('"hola, mundo","línea\npartida","dijo ""hola"""')).toEqual([
      ['hola, mundo', 'línea\npartida', 'dijo "hola"'],
    ])
  })

  it('tolera CRLF e ignora filas totalmente vacías', () => {
    expect(parseCsv('a,b\r\n\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('csvToBatchItems', () => {
  const header = 'fecha,texto,redes,media'

  it('mapea filas al item del lote, separando redes y media por |', () => {
    const result = csvToBatchItems(
      `${header}\n2026-09-03 10:00,"Hola, lote",threads|x,\n2026-09-03 18:30,Con foto,instagram,https://ej.com/a.jpg|https://ej.com/b.jpg`,
    )
    expect(result).toEqual({
      items: [
        { fecha: '2026-09-03 10:00', texto: 'Hola, lote', redes: ['threads', 'x'], media: [] },
        {
          fecha: '2026-09-03 18:30',
          texto: 'Con foto',
          redes: ['instagram'],
          media: ['https://ej.com/a.jpg', 'https://ej.com/b.jpg'],
        },
      ],
    })
  })

  it('rechaza el lote entero si el encabezado no es el esperado', () => {
    expect(csvToBatchItems('fecha,caption,redes,media\n')).toEqual({ error: CSV_HEADER_ERROR })
    expect(csvToBatchItems('')).toEqual({ error: CSV_HEADER_ERROR })
  })

  it('un CSV con solo encabezado produce cero items', () => {
    expect(csvToBatchItems(header)).toEqual({ items: [] })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/csv.test.ts`
Expected: FAIL — `./csv` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/csv.ts`:

```ts
export const CSV_HEADER_ERROR =
  'El encabezado del CSV debe ser exactamente: fecha,texto,redes,media'

/** RFC 4180 in ~40 lines: quoted fields may hold commas, newlines and "" quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  return rows
}

function splitPipe(cell: string): string[] {
  return cell
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function csvToBatchItems(
  text: string,
): { items: Array<{ fecha: string; texto: string; redes: string[]; media: string[] }> } | { error: string } {
  const rows = parseCsv(text)
  const header = rows[0]
  if (
    !header ||
    header.length !== 4 ||
    header[0] !== 'fecha' ||
    header[1] !== 'texto' ||
    header[2] !== 'redes' ||
    header[3] !== 'media'
  ) {
    return { error: CSV_HEADER_ERROR }
  }

  return {
    items: rows.slice(1).map((row) => ({
      fecha: (row[0] ?? '').trim(),
      texto: row[1] ?? '',
      redes: splitPipe(row[2] ?? ''),
      media: splitPipe(row[3] ?? ''),
    })),
  }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/csv.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/csv.ts src/lib/social/publish/csv.test.ts
git commit -m "Parsea CSV RFC 4180 sin dependencias para la carga masiva"
```
(con el footer de Global Constraints)

---

### Task 2: Validación pura del item de lote

**Files:**
- Create: `src/lib/social/publish/batch.ts`
- Test: `src/lib/social/publish/batch.test.ts`

**Interfaces:**
- Consumes: `validateScheduleDraft` de `./validate`; `fromZonedInput` de `@/lib/utils`; `SITE_TIMEZONE` de `@/lib/analytics`.
- Produces (usados por Tasks 3–5):
  - `type BatchItem = { fecha: string; texto: string; redes: string[]; media: string[] }`
  - `type BatchResult = { index: number; ok: true; postId: string } | { index: number; ok: false; error: string }`
  - `MAX_BATCH_ITEMS = 50`
  - `mediaTypeFromUrl(url: string): 'image' | 'video' | null`
  - `validateBatchItem(item: BatchItem, now: Date): string | null`

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/social/publish/batch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mediaTypeFromUrl, validateBatchItem, type BatchItem } from './batch'

const now = new Date('2026-09-02T12:00:00Z')
const base: BatchItem = {
  fecha: '2026-09-03 10:00',
  texto: 'Hola lote',
  redes: ['threads', 'x'],
  media: [],
}

describe('mediaTypeFromUrl', () => {
  it('infiere por extensión, ignorando mayúsculas y querystrings', () => {
    expect(mediaTypeFromUrl('https://ej.com/a.JPG')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/b.png?token=x')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/c.mp4')).toBe('video')
    expect(mediaTypeFromUrl('https://ej.com/d.webm')).toBe('video')
  })

  it('extensión desconocida es null: no se adivina', () => {
    expect(mediaTypeFromUrl('https://ej.com/archivo.pdf')).toBeNull()
    expect(mediaTypeFromUrl('https://ej.com/sin-extension')).toBeNull()
  })
})

describe('validateBatchItem', () => {
  it('acepta un item de texto puro válido', () => {
    expect(validateBatchItem(base, now)).toBeNull()
  })

  it('rechaza la fecha ilegible con la pista del formato', () => {
    expect(validateBatchItem({ ...base, fecha: 'mañana a las diez' }, now)).toMatch(/YYYY-MM-DD/)
  })

  it('rechaza redes desconocidas o sin publisher', () => {
    expect(validateBatchItem({ ...base, redes: ['tiktok'] }, now)).toMatch(/tiktok/)
    expect(validateBatchItem({ ...base, redes: ['myspace'] }, now)).toMatch(/myspace/)
  })

  it('rechaza media con extensión indescifrable', () => {
    expect(validateBatchItem({ ...base, media: ['https://ej.com/x.pdf'] }, now)).toMatch(/tipo/)
  })

  it('delega en las reglas del compositor: límites y formas por red', () => {
    expect(validateBatchItem({ ...base, texto: 'x'.repeat(281) }, now)).toMatch(/280/)
    expect(
      validateBatchItem(
        { ...base, redes: ['instagram'], media: [] },
        now,
      ),
    ).toMatch(/archivo/)
    expect(
      validateBatchItem(
        { ...base, redes: ['x'], media: ['https://ej.com/v.mp4'] },
        now,
      ),
    ).toMatch(/video/)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/publish/batch.test.ts`
Expected: FAIL — `./batch` no existe.

- [ ] **Step 3: Implementación**

Crear `src/lib/social/publish/batch.ts`:

```ts
import { SITE_TIMEZONE } from '@/lib/analytics'
import { fromZonedInput } from '@/lib/utils'
import { validateScheduleDraft } from './validate'

export type BatchItem = { fecha: string; texto: string; redes: string[]; media: string[] }

export type BatchResult =
  | { index: number; ok: true; postId: string }
  | { index: number; ok: false; error: string }

export const MAX_BATCH_ITEMS = 50

// The five networks with a publisher; tiktok reads but cannot post yet.
const PUBLISHABLE = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x'])

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])

/** By extension, cheaply, before any download; the real content-type re-checks later. */
export function mediaTypeFromUrl(url: string): 'image' | 'video' | null {
  const path = url.split('?')[0] ?? ''
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return null
}

/**
 * The batch item's whole rulebook: its own shape first, then the composer's exact
 * rules via validateScheduleDraft — one source of truth for limits and media shapes.
 */
export function validateBatchItem(item: BatchItem, now: Date): string | null {
  const scheduledAt = fromZonedInput(item.fecha, SITE_TIMEZONE)
  if (!scheduledAt) return 'La fecha no se entendió (usa YYYY-MM-DD HH:MM).'

  for (const red of item.redes) {
    if (!PUBLISHABLE.has(red)) return `Red desconocida o sin publicación: ${red}.`
  }

  let imageCount = 0
  let videoCount = 0
  for (const url of item.media) {
    const type = mediaTypeFromUrl(url)
    if (!type) return 'No puedo inferir el tipo de una media por su URL.'
    if (type === 'image') imageCount++
    else videoCount++
  }

  return validateScheduleDraft(
    { caption: item.texto, imageCount, videoCount, networks: item.redes, scheduledAt },
    now,
  )
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/social/publish/batch.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/batch.ts src/lib/social/publish/batch.test.ts
git commit -m "Valida cada item del lote con las reglas exactas del compositor"
```

---

### Task 3: El motor `scheduleBatch`

**Files:**
- Modify: `src/lib/social/publish/batch.ts` (agregar al final)

**Interfaces:**
- Consumes: Task 2; `put` de `@vercel/blob`; `getDb, scheduledPosts, scheduledPostMedia, scheduledPostTargets` de `@/db`; `randomUUID` de `node:crypto`.
- Produces (usado por Tasks 4–5): `scheduleBatch(items: BatchItem[]): Promise<BatchResult[]>`.

Sin test unitario nuevo: la lógica con ramas vive en Task 2; esto es la costura con
HTTP y DB, el trato de siempre. Verificación por typecheck, lint y suite.

- [ ] **Step 1: Implementación**

Agregar a `batch.ts` (sumar los imports de Interfaces arriba):

```ts
async function mediaToBlob(
  url: string,
  expected: 'image' | 'video',
): Promise<{ url: string; mediaType: 'image' | 'video' } | null> {
  const response = await fetch(url)
  if (!response.ok) {
    console.error('No se pudo descargar la media del lote:', response.status, url.slice(0, 200))
    return null
  }
  const contentType = response.headers.get('content-type') ?? ''
  // The extension promised one thing; the server must agree, or the row is refused —
  // a PDF renamed .jpg would otherwise reach Meta as an "image".
  if (!contentType.startsWith(`${expected}/`)) {
    console.error('Content-type inesperado en la media del lote:', contentType, url.slice(0, 200))
    return null
  }
  const extension = (url.split('?')[0] ?? '').split('.').pop()?.toLowerCase() ?? 'bin'
  const blob = await put(`scheduled/${randomUUID()}.${extension}`, await response.blob(), {
    access: 'public',
  })
  return { url: blob.url, mediaType: expected }
}

/**
 * One batch, sequential on purpose: fifty concurrent downloads against third-party
 * hosting is how you meet rate limits. A failed row records its fixed sentence and
 * the loop keeps going — partial success is the contract, Buffer-style.
 */
export async function scheduleBatch(items: BatchItem[]): Promise<BatchResult[]> {
  const db = getDb()
  const now = new Date()
  const results: BatchResult[] = []

  for (const [index, item] of items.entries()) {
    const invalid = validateBatchItem(item, now)
    if (invalid) {
      results.push({ index, ok: false, error: invalid })
      continue
    }

    try {
      const uploaded: Array<{ url: string; mediaType: 'image' | 'video' }> = []
      let mediaFailed = false
      for (const url of item.media) {
        const stored = await mediaToBlob(url, mediaTypeFromUrl(url)!)
        if (!stored) {
          results.push({ index, ok: false, error: 'No se pudo leer una media de la fila.' })
          mediaFailed = true
          break
        }
        uploaded.push(stored)
      }
      if (mediaFailed) continue

      const scheduledAt = fromZonedInput(item.fecha, SITE_TIMEZONE)!
      const [post] = await db
        .insert(scheduledPosts)
        .values({ caption: item.texto, scheduledAt })
        .returning()
      if (uploaded.length > 0) {
        await db.insert(scheduledPostMedia).values(
          uploaded.map((m, position) => ({
            postId: post!.id,
            blobUrl: m.url,
            mediaType: m.mediaType,
            position,
          })),
        )
      }
      await db
        .insert(scheduledPostTargets)
        .values(item.redes.map((network) => ({ postId: post!.id, network })))

      results.push({ index, ok: true, postId: post!.id })
    } catch (error) {
      console.error(`Falló el item ${index} del lote:`, error)
      results.push({ index, ok: false, error: 'No se pudo guardar la fila. Inténtalo de nuevo.' })
    }
  }

  return results
}
```

- [ ] **Step 2: Verificar**

Run: `npx vitest run src/lib/social/publish/ && npm run typecheck && npm run lint`
Expected: PASS los tres.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/publish/batch.ts
git commit -m "Programa el lote completo con media por URL y resultado por fila"
```

---

### Task 4: La API con token

**Files:**
- Create: `src/app/api/schedule/batch/route.ts`
- Modify: `README.md` (fila `SCHEDULE_API_KEY` + nota corta de uso)

**Interfaces:**
- Consumes: `scheduleBatch`, `MAX_BATCH_ITEMS`, `type BatchItem` de `@/lib/social/publish/batch`; `env`.
- Produces: `POST /api/schedule/batch` con Bearer `SCHEDULE_API_KEY`.

Sin test unitario (rutas). Verificación por typecheck y lint.

- [ ] **Step 1: La ruta**

Crear `src/app/api/schedule/batch/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { MAX_BATCH_ITEMS, scheduleBatch, type BatchItem } from '@/lib/social/publish/batch'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// Downloads ride inside this function; same budget as the publish cron.
export const maxDuration = 240

export async function POST(request: Request) {
  const key = env('SCHEDULE_API_KEY')
  // Same discipline as the crons: without a key the endpoint stays shut.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let posts: BatchItem[]
  try {
    const body = (await request.json()) as { posts?: unknown[] }
    if (!Array.isArray(body.posts)) throw new Error('sin posts')
    // Shape-normalized at the door: a string where an array belongs must become an
    // invalid row with a sentence, never a crash inside the batch loop.
    posts = body.posts.map((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>
      return {
        fecha: typeof p.fecha === 'string' ? p.fecha : '',
        texto: typeof p.texto === 'string' ? p.texto : '',
        redes: Array.isArray(p.redes) ? p.redes.map(String) : [],
        media: Array.isArray(p.media) ? p.media.map(String) : [],
      }
    })
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo debe ser JSON con { posts: [...] }.' },
      { status: 400 },
    )
  }
  if (posts.length > MAX_BATCH_ITEMS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_BATCH_ITEMS} posts por lote.` },
      { status: 400 },
    )
  }

  // Rejected rows are data, not an endpoint failure — same rule as the cron report.
  const resultados = await scheduleBatch(posts)
  return NextResponse.json({ resultados })
}
```

- [ ] **Step 2: README**

Fila nueva en la tabla de env:

```markdown
| `SCHEDULE_API_KEY` | Autoriza `POST /api/schedule/batch` (carga masiva por API) | Sin ella el endpoint queda cerrado; genérala igual que `CRON_SECRET` |
```

Y una nota corta junto a la sección del cron (mismo tono):

```markdown
### Carga masiva por API

`POST /api/schedule/batch` con header `Authorization: Bearer <SCHEDULE_API_KEY>` y
cuerpo `{ "posts": [{ "fecha": "2026-09-03 10:00", "texto": "Hola", "redes": ["x"], "media": [] }] }`
(máximo 50). Responde el resultado por item; las filas rechazadas traen su motivo.
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/schedule/batch/route.ts README.md
git commit -m "Abre la carga masiva por API con su propia clave"
```

---

### Task 5: La sección «Carga masiva» del panel y verificación final

**Files:**
- Modify: `src/app/admin/actions.ts` (agregar al final)
- Create: `src/app/admin/(dash)/schedule/batch-upload.tsx`
- Modify: `src/app/admin/(dash)/schedule/page.tsx`

**Interfaces:**
- Consumes: `csvToBatchItems` (Task 1), `scheduleBatch`, `MAX_BATCH_ITEMS` (Tasks 2–3), `requireAuth`/`revalidatePath` existentes.
- Produces: `uploadBatch(prev, formData)` y la sección en `/admin/schedule`.

Sin test unitario (action + UI). Verificación final completa.

- [ ] **Step 1: La action**

Agregar al final de `src/app/admin/actions.ts` (sumar a los imports:
`csvToBatchItems` desde `@/lib/social/publish/csv`; `scheduleBatch, MAX_BATCH_ITEMS`
desde `@/lib/social/publish/batch`):

```ts
export type BatchRow = { fila: number; ok: boolean; detalle: string }
export type BatchState = { error?: string; filas?: BatchRow[] }

export async function uploadBatch(_prev: BatchState, formData: FormData): Promise<BatchState> {
  await requireAuth()

  const file = formData.get('archivo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Adjunta un archivo CSV.' }

  const parsed = csvToBatchItems(await file.text())
  if ('error' in parsed) return { error: parsed.error }
  if (parsed.items.length === 0) return { error: 'El CSV no trae filas de posts.' }
  if (parsed.items.length > MAX_BATCH_ITEMS) {
    return { error: `Máximo ${MAX_BATCH_ITEMS} posts por lote.` }
  }

  const resultados = await scheduleBatch(parsed.items)
  revalidatePath('/admin/schedule')
  return {
    // +2: la fila 1 del archivo es el encabezado, y la gente cuenta desde 1.
    filas: resultados.map((r) => ({
      fila: r.index + 2,
      ok: r.ok,
      detalle: r.ok ? 'Programado' : r.error,
    })),
  }
}
```

- [ ] **Step 2: El componente**

Crear `src/app/admin/(dash)/schedule/batch-upload.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { uploadBatch } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const PLANTILLA = `fecha,texto,redes,media
2026-09-03 10:00,"Mi primer post en lote",threads|x,
2026-09-03 18:30,"Con foto, y con coma",instagram|facebook,https://ejemplo.com/foto.jpg`

export function BatchUpload() {
  const [state, action, pending] = useActionState(uploadBatch, {})

  return (
    <details className="rounded-xl bg-white/[0.03] p-4">
      <summary className="cursor-pointer text-sm font-medium">Carga masiva (CSV)</summary>

      <form action={action} className="mt-4 space-y-4">
        <p className="text-[0.8rem] leading-relaxed text-fg-faint">
          Una fila por post: fecha en tu zona horaria, texto entre comillas si lleva
          comas, redes y URLs de media separadas por <code>|</code>. Máximo 50 filas.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-white/[0.06] p-3 text-xs text-fg-muted">{PLANTILLA}</pre>

        <input type="file" name="archivo" accept=".csv,text/csv" className="block text-sm text-fg-muted" />

        {state.error && <p className="text-sm text-red-400">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15] disabled:opacity-50"
        >
          {pending ? 'Cargando…' : 'Cargar lote'}
        </button>
      </form>

      {state.filas && (
        <ul className="mt-4 space-y-1">
          {state.filas.map((fila) => (
            <li
              key={fila.fila}
              className={cn('text-sm', fila.ok ? 'text-emerald-300' : 'text-red-300')}
            >
              Fila {fila.fila}: {fila.detalle}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
```

- [ ] **Step 3: La página**

En `src/app/admin/(dash)/schedule/page.tsx`, importar `BatchUpload` desde
`./batch-upload` y renderizarlo entre `<Composer />` y `<Queue …/>`:

```tsx
      <Composer />
      <BatchUpload />
      <Queue items={[...posts.values()]} />
```

- [ ] **Step 4: Verificación final completa**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS los cuatro (200 + 13 nuevos = 213 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/actions.ts "src/app/admin/(dash)/schedule/batch-upload.tsx" "src/app/admin/(dash)/schedule/page.tsx"
git commit -m "Muestra la carga masiva en el panel con resultado por fila"
```

---

## Notas para el ejecutor

- **Orden**: 1→5; Tasks 1 y 2 podrían ir en paralelo pero comparten directorio — secuencial.
- **`scheduledAt!` doble parse** en scheduleBatch: `validateBatchItem` ya garantizó que
  `fromZonedInput` no es null; el `!` es seguro y el re-parse evita acarrear el Date
  por la firma del resultado de validación.
- **`put(..., await response.blob(), ...)`**: `@vercel/blob` acepta Blob directamente.
- **La dedup entre lotes no existe** (spec, No objetivos): cargar dos veces = programar
  dos veces. No «arreglarlo».
- **AGENTS.md**: si el build re-agrega su bloque, commitearlo junto está bien.
