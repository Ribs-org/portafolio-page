# Modo Tinder, entrega 1: la lista y la traída — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development
> (recomendada) o superpowers:executing-plans para implementar tarea por tarea. Los pasos
> usan casillas (`- [ ]`) para marcar avance.

**Meta:** que una lista de creadores de X que el dueño cura se traiga sola, cuatro veces al
día, y que cada tuit nuevo quede guardado como una ficha cruda lista para reescribir.

**Arquitectura:** una tabla para los creadores y otra para las fichas. Un `Fuente` por
plataforma, con la misma forma que los conectores, los publicadores y los comentaristas, del
que esta entrega implementa solo el de X. Un cron propio, separado del de cinco minutos,
porque se paga por publicación leída y un creador publica tres o cuatro veces al día. El
`since_id` por creador es el control de costo: un creador que no publicó nada cuesta cero.

**Stack:** Next.js 16, Drizzle sobre Neon, la API v2 de X con autenticación de aplicación,
Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-modo-tinder-design.md` (secciones 1, 2, 3 y 8,
y la fila «1 · La lista y la traída» de la tabla de entregas).

## Restricciones globales

- Frases fijas en español en todo lo visible; el detalle de X solo a `console.error`
  truncado a 300 (`String(error).slice(0, 300)`).
- Nada de esta entrega se ve en pantalla. La administración de la lista y la baraja son las
  entregas 3 y 4.
- **No se guarda ni se descarga media ajena.** La ficha es texto y su enlace al original.
- Solo tuits originales: la consulta excluye respuestas y retuits.
- El fallo de un creador no detiene a los demás. Tres creadores seguidos fallando cortan la
  corrida, porque eso ya no es un creador sino X.
- Tope diario de lecturas, por defecto **300**, guardado en `ajustes` y editable. Al
  alcanzarlo la traída para y lo registra; al día siguiente sigue desde el mismo `since_id`.
- Para leer se usa **autenticación de aplicación** (`X_BEARER_TOKEN`), nunca el token OAuth
  del dueño.
- Comentarios de código solo para restricciones que el código no puede mostrar, en el tono
  de los vecinos. Commits en español, en presente, terminando con:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash,
  `git add` por archivo.
- Verificación por tarea: `npx vitest run <archivo>`; al cerrar: `npm test && npm run
  typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la
  ejecución**: las tablas son nuevas y el push lo hace el controlador al desplegar.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | gana `source_authors` y `source_posts` con sus tipos |
| `src/lib/ajustes.ts` | gana `guardarAjuste`, que la entrega 2 de comentarios dejó sin escribir por no tener llamador |
| `src/lib/social/fuentes/fuente.ts` | el tipo `Fuente`, el tipo `PostAjeno` y las frases fijas |
| `src/lib/social/fuentes/x.ts` | el normalizador puro y el cliente de la API de X |
| `src/lib/social/fuentes/index.ts` | el registro, una línea por plataforma |
| `src/lib/social/fuentes/tope.ts` | puro: el día, el contador y el tope diario |
| `src/lib/social/fuentes/run.ts` | el orquestador: recorre los creadores y guarda las fichas |
| `src/app/api/cron/traer-ideas/route.ts` | el endpoint que dispara la traída |

---

### Task 1: El esquema

**Archivos:**
- Modificar: `src/db/schema.ts`

**Interfaces:**
- Produce: `sourceAuthors`, `sourcePosts` (tablas), `SOURCE_POST_STATES`,
  `SourcePostState`, `SourceAuthor`, `SourcePost`.

- [x] **Paso 1: Los estados**

En `src/db/schema.ts`, junto a `COMMENT_STATES` que ya existe, con el mismo patrón:

```ts
export const SOURCE_POST_STATES = ['cruda', 'lista', 'aprobada', 'rechazada', 'fallida'] as const
export type SourcePostState = (typeof SOURCE_POST_STATES)[number]
```

- [x] **Paso 2: La tabla de creadores**

`boolean` puede no estar todavía en el import de `drizzle-orm/pg-core` al tope del archivo;
agrégalo si falta.

```ts
/**
 * La lista curada de creadores que el modo Tinder lee. `since_id` es el control de costo
 * entero: X cobra por publicación leída, así que la consulta arranca desde el último tuit
 * ya visto y un creador que no publicó nada sale gratis.
 */
export const sourceAuthors = pgTable(
  'source_authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    network: text('network').notNull(),
    username: text('username').notNull(),
    // El id numérico de X. Se resuelve una sola vez: si el creador se cambia el nombre de
    // usuario, el id sigue siendo el mismo y la traída no se entera, que es lo correcto.
    externalId: text('external_id'),
    active: boolean('active').notNull().default(true),
    sinceId: text('since_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // `network` se declara antes que `username`, y en una tabla nueva el orden de
    // declaración es el orden físico: drizzle-kit introspecta las uniques por ese orden.
    unique('source_authors_network_username_key').on(t.network, t.username),
  ],
)
```

- [x] **Paso 3: La tabla de fichas**

```ts
/**
 * Una ficha por tuit traído. `author_handle` y `url` van copiados para que la baraja se
 * lea sin join, y `original_text` se guarda porque la ficha muestra el original plegado
 * debajo del texto reescrito.
 *
 * `draft` y `draft_error` los llena la entrega 2; `scheduled_post_id`, la 3.
 */
export const sourcePosts = pgTable(
  'source_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => sourceAuthors.id, { onDelete: 'cascade' }),
    network: text('network').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    authorHandle: text('author_handle').notNull(),
    originalText: text('original_text').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    draft: text('draft'),
    draftError: text('draft_error'),
    state: text('state').$type<SourcePostState>().notNull().default('cruda'),
    scheduledPostId: uuid('scheduled_post_id').references(() => scheduledPosts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Mismo orden físico que la declaración: `author_id` es la segunda columna y
    // `external_id` la cuarta. Declararla al revés haría que cada `db:push` futuro
    // quisiera recrear la tabla.
    unique('source_posts_author_external_key').on(t.authorId, t.externalId),
    index('source_posts_state_idx').on(t.state),
    index('source_posts_published_idx').on(t.publishedAt),
  ],
)
```

`onDelete: 'set null'` en `scheduled_post_id` y no `cascade`: si el dueño borra la
publicación programada desde el calendario, la ficha tiene que sobrevivir, porque su fila es
lo que impide que el mismo tuit vuelva a entrar.

- [x] **Paso 4: Los tipos**

Junto a los demás `$inferSelect` del archivo, siguiendo su patrón exacto:

```ts
export type SourceAuthor = typeof sourceAuthors.$inferSelect
export type SourcePost = typeof sourcePosts.$inferSelect
```

- [x] **Paso 5: Verificar**

Corre `npm run typecheck` y `npm run lint`. **No corras `db:push`**: las tablas son nuevas y
el push lo hace el controlador al desplegar.

- [x] **Paso 6: Commit**

```bash
git add src/db/schema.ts
git commit
```

Mensaje: `Agrega las tablas de creadores y fichas del modo Tinder`

---

### Task 2: La fuente de X

**Archivos:**
- Crear: `src/lib/social/fuentes/fuente.ts`
- Crear: `src/lib/social/fuentes/x.ts`
- Crear: `src/lib/social/fuentes/index.ts`
- Test: `src/lib/social/fuentes/x.test.ts`

**Interfaces:**
- Produce: los tipos `PostAjeno` y `Fuente`, las frases `AUTOR_ILEGIBLE` y `TOPE_ALCANZADO`,
  `normalizeXTweet(raw, username, ahora)`, `xFuente`, `FUENTES`, `fuenteFor(network)`.

Ningún archivo de `fuentes/` importa `server-only` salvo el orquestador de la tarea 4. Este
par no toca la base.

- [x] **Paso 1: El contrato**

`src/lib/social/fuentes/fuente.ts`:

```ts
/** Un post ajeno ya normalizado. Sin media: la ficha es texto y su enlace al original. */
export type PostAjeno = {
  externalId: string
  url: string
  authorHandle: string
  text: string
  publishedAt: Date
}

/**
 * Una plataforma de la que se leen ideas ajenas. Misma forma que CONNECTORS, PUBLISHERS y
 * COMENTARISTAS: agregar YouTube o Reddit es un archivo y una línea en el índice.
 *
 * `traer` recibe el tope de cuántas publicaciones puede leer en esta llamada, porque quien
 * llama lleva la cuenta del gasto del día y la fuente no tiene por qué conocerla. Recibe
 * también el username además del id: la llamada va por id, pero el enlace al original se
 * arma con el nombre, y quien llama tiene los dos a mano.
 */
export type Fuente = {
  network: string
  resolverAutor(username: string): Promise<string>
  traer(
    externalId: string,
    username: string,
    sinceId: string | null,
    tope: number,
  ): Promise<PostAjeno[]>
}

/** Lo único que el dueño llega a leer cuando una cuenta de su lista dejó de ser legible. */
export const AUTOR_ILEGIBLE = 'No se pudo leer esta cuenta.'

/** Lo único que el dueño llega a leer cuando el gasto del día llegó a su techo. */
export const TOPE_ALCANZADO = 'Se alcanzó el tope de lecturas de hoy.'
```

- [x] **Paso 2: El test que falla**

`src/lib/social/fuentes/x.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeXTweet } from './x'

const AHORA = new Date(1_789_128_000_000)

describe('normalizeXTweet', () => {
  it('arma la ficha con el enlace al original', () => {
    const c = normalizeXTweet(
      { id: '42', text: 'una idea', created_at: '2026-09-10T12:00:00.000Z' },
      'algun_creador',
      AHORA,
    )
    expect(c).toEqual({
      externalId: '42',
      url: 'https://x.com/algun_creador/status/42',
      authorHandle: 'algun_creador',
      text: 'una idea',
      publishedAt: new Date('2026-09-10T12:00:00.000Z'),
    })
  })

  it('descarta el tuit sin id, que no tiene identidad', () => {
    expect(normalizeXTweet({ text: 'una idea' }, 'x', AHORA)).toBeNull()
  })

  it('descarta el tuit sin texto, que no es una idea', () => {
    expect(normalizeXTweet({ id: '42', text: '   ' }, 'x', AHORA)).toBeNull()
  })

  it('usa la hora de descubrimiento cuando la fecha falta o es basura', () => {
    expect(normalizeXTweet({ id: '1', text: 'a' }, 'x', AHORA)?.publishedAt).toEqual(AHORA)
    expect(
      normalizeXTweet({ id: '2', text: 'a', created_at: 'ayer' }, 'x', AHORA)?.publishedAt,
    ).toEqual(AHORA)
  })

  it('recorta los bordes del texto', () => {
    expect(normalizeXTweet({ id: '1', text: '  una idea \n' }, 'x', AHORA)?.text).toBe('una idea')
  })
})
```

- [x] **Paso 3: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/fuentes/x.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 4: La fuente**

`src/lib/social/fuentes/x.ts`. El normalizador es puro y recibe `ahora` en vez de llamar a
`new Date()`, para que el test no dependa del reloj:

```ts
import { env } from '@/lib/env'
import type { Fuente, PostAjeno } from './fuente'

const API = 'https://api.x.com/2'

export type XTweetPayload = {
  id?: string
  text?: string
  created_at?: string
}

/** Null cuando no hay id o no hay texto: sin identidad no hay fila, y sin texto no hay idea. */
export function normalizeXTweet(
  raw: XTweetPayload,
  username: string,
  ahora: Date,
): PostAjeno | null {
  if (!raw.id) return null
  const text = (raw.text ?? '').trim()
  if (text.length === 0) return null
  const fecha = raw.created_at ? new Date(raw.created_at) : null
  return {
    externalId: raw.id,
    url: `https://x.com/${username}/status/${raw.id}`,
    authorHandle: username,
    text,
    // Sin fecha de la red, la del descubrimiento: 1970 hundiría la ficha al fondo de una
    // baraja ordenada por fecha, y un Date inválido reventaría el insert.
    publishedAt: fecha && !Number.isNaN(fecha.getTime()) ? fecha : ahora,
  }
}

async function pedir(ruta: string): Promise<Record<string, unknown>> {
  const token = env('X_BEARER_TOKEN')
  if (!token) throw new Error('X_BEARER_TOKEN is not set')
  const response = await fetch(`${API}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`X ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const xFuente: Fuente = {
  network: 'x',

  async resolverAutor(username) {
    const body = (await pedir(`/users/by/username/${encodeURIComponent(username)}`)) as {
      data?: { id?: string }
    }
    const id = body.data?.id
    if (!id) throw new Error('X no devolvió el id de la cuenta')
    return id
  },

  async traer(externalId, username, sinceId, tope) {
    // `exclude` deja fuera respuestas y retuits: una respuesta fuera de su hilo no se
    // entiende, y un retuit es contenido ajeno dentro de contenido ajeno.
    const params = new URLSearchParams({
      'tweet.fields': 'created_at',
      exclude: 'replies,retweets',
      // La API acepta entre 5 y 100; el tope del día puede pedir menos que el mínimo.
      max_results: String(Math.min(Math.max(tope, 5), 100)),
    })
    if (sinceId) params.set('since_id', sinceId)
    const body = (await pedir(`/users/${externalId}/tweets?${params}`)) as {
      data?: XTweetPayload[]
    }
    // Una sola hora de descubrimiento para toda la página: dos tuits traídos juntos no
    // tienen por qué diferir en milisegundos cuando ninguno trajo fecha.
    const ahora = new Date()
    const leidos: PostAjeno[] = []
    for (const raw of body.data ?? []) {
      const c = normalizeXTweet(raw, username, ahora)
      if (c) leidos.push(c)
    }
    return leidos
  },
}
```

- [x] **Paso 5: El registro**

`src/lib/social/fuentes/index.ts`:

```ts
import type { Fuente } from './fuente'
import { xFuente } from './x'

/** Agregar YouTube o Reddit es un archivo y una línea acá, igual que COMENTARISTAS. */
export const FUENTES: Fuente[] = [xFuente]

export function fuenteFor(network: string): Fuente | undefined {
  return FUENTES.find((f) => f.network === network)
}

export * from './fuente'
```

- [x] **Paso 6: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/fuentes/x.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 7: Commit**

```bash
git add src/lib/social/fuentes/fuente.ts src/lib/social/fuentes/x.ts src/lib/social/fuentes/index.ts src/lib/social/fuentes/x.test.ts
git commit
```

Mensaje: `Lee los tuits nuevos de una cuenta con la API de X`

---

### Task 3: El tope diario de lecturas

**Archivos:**
- Modificar: `src/lib/ajustes.ts`
- Crear: `src/lib/social/fuentes/tope.ts`
- Test: `src/lib/social/fuentes/tope.test.ts`

**Interfaces:**
- Consume: `leerAjuste` de `@/lib/ajustes`.
- Produce: `guardarAjuste(clave, valor)`, `CLAVE_TOPE`, `CLAVE_CONTADOR`,
  `TOPE_POR_DEFECTO`, `diaDe(now)`, `normalizarTope(bruto)`,
  `leidasHoy(valor, hoy)`, `serializarContador(hoy, leidas)`, `idMayor(a, b)`.

- [x] **Paso 1: El escritor de ajustes**

`src/lib/ajustes.ts` tiene hoy solo el lector: la entrega 2 de comentarios dejó fuera el
escritor a propósito, por no tener llamador. Ahora lo tiene. Agrégalo junto a `leerAjuste`:

```ts
export async function guardarAjuste(clave: string, valor: string): Promise<void> {
  await getDb()
    .insert(ajustes)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: ajustes.clave, set: { valor, updatedAt: new Date() } })
}
```

- [x] **Paso 2: El test que falla**

`src/lib/social/fuentes/tope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  TOPE_POR_DEFECTO,
  diaDe,
  idMayor,
  leidasHoy,
  normalizarTope,
  serializarContador,
} from './tope'

describe('diaDe', () => {
  it('da el día en UTC, no en la zona de quien corre el test', () => {
    expect(diaDe(new Date('2026-09-11T23:30:00.000Z'))).toBe('2026-09-11')
    expect(diaDe(new Date('2026-09-12T00:30:00.000Z'))).toBe('2026-09-12')
  })
})

describe('leidasHoy', () => {
  it('cuenta lo guardado cuando el día coincide', () => {
    expect(leidasHoy('2026-09-11:120', '2026-09-11')).toBe(120)
  })

  it('vuelve a cero cuando el día cambió', () => {
    expect(leidasHoy('2026-09-10:299', '2026-09-11')).toBe(0)
  })

  it('vuelve a cero cuando no hay nada guardado o está corrupto', () => {
    expect(leidasHoy(null, '2026-09-11')).toBe(0)
    expect(leidasHoy('basura', '2026-09-11')).toBe(0)
    expect(leidasHoy('2026-09-11:abc', '2026-09-11')).toBe(0)
  })
})

describe('serializarContador', () => {
  it('vuelve a leerse igual', () => {
    expect(leidasHoy(serializarContador('2026-09-11', 7), '2026-09-11')).toBe(7)
  })
})

describe('normalizarTope', () => {
  it('usa el de por defecto cuando no hay nada guardado o no es un número', () => {
    expect(normalizarTope(null)).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('muchas')).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('0')).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('-5')).toBe(TOPE_POR_DEFECTO)
  })

  it('respeta un número guardado', () => {
    expect(normalizarTope('50')).toBe(50)
  })
})

describe('idMayor', () => {
  it('compara como número, no como texto', () => {
    // Como texto, '9' sería mayor que '10'. Los ids de X crecen y cambian de largo.
    expect(idMayor('9', '10')).toBe('10')
    expect(idMayor('1800000000000000000', '1799999999999999999')).toBe('1800000000000000000')
  })

  it('devuelve el otro cuando uno falta', () => {
    expect(idMayor(null, '10')).toBe('10')
    expect(idMayor('10', null)).toBe('10')
    expect(idMayor(null, null)).toBeNull()
  })
})
```

- [x] **Paso 3: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/fuentes/tope.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 4: El módulo**

`src/lib/social/fuentes/tope.ts`. Puro: no toca la base ni la red.

```ts
export const CLAVE_TOPE = 'tinder_tope_lecturas'
export const CLAVE_CONTADOR = 'tinder_lecturas_hoy'

/**
 * Red de seguridad contra un creador que enloquece, no un límite de curación: el uso
 * esperado ronda las sesenta lecturas diarias, así que está cinco veces arriba.
 */
export const TOPE_POR_DEFECTO = 300

/** UTC y no la zona del servidor: el contador tiene que cambiar de día en un solo sitio. */
export function diaDe(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** El contador viaja como `AAAA-MM-DD:N`; un día distinto al de hoy vale cero. */
export function leidasHoy(valor: string | null, hoy: string): number {
  if (!valor) return 0
  const [dia, n] = valor.split(':')
  if (dia !== hoy) return 0
  const leidas = Number(n)
  return Number.isInteger(leidas) && leidas >= 0 ? leidas : 0
}

export function serializarContador(hoy: string, leidas: number): string {
  return `${hoy}:${leidas}`
}

export function normalizarTope(bruto: string | null): number {
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : TOPE_POR_DEFECTO
}

/**
 * Los ids de X son enteros que crecen y cambian de largo, así que compararlos como texto
 * daría que '9' es mayor que '10'. BigInt porque no caben en un number.
 */
export function idMayor(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return BigInt(a) >= BigInt(b) ? a : b
}
```

- [x] **Paso 5: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/fuentes/tope.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 6: Commit**

```bash
git add src/lib/ajustes.ts src/lib/social/fuentes/tope.ts src/lib/social/fuentes/tope.test.ts
git commit
```

Mensaje: `Lleva la cuenta de lo leído en el día y su techo`

---

### Task 4: La traída y su cron

**Archivos:**
- Crear: `src/lib/social/fuentes/run.ts`
- Crear: `src/app/api/cron/traer-ideas/route.ts`

**Interfaces:**
- Consume: todo lo de las tareas 1, 2 y 3.
- Produce: `TraidaReport`, `traerIdeas(now?: Date): Promise<TraidaReport>`.

- [x] **Paso 1: El orquestador**

`src/lib/social/fuentes/run.ts`:

```ts
import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb, sourceAuthors, sourcePosts } from '@/db'
import { guardarAjuste, leerAjuste } from '@/lib/ajustes'
import { fuenteFor } from './index'
import { AUTOR_ILEGIBLE } from './fuente'
import {
  CLAVE_CONTADOR,
  CLAVE_TOPE,
  diaDe,
  idMayor,
  leidasHoy,
  normalizarTope,
  serializarContador,
} from './tope'

/**
 * Cuántos creadores seguidos fallando bastan para cortar la corrida: uno es un creador que
 * se puso privado, tres seguidos ya no es un creador, es X.
 */
const MAX_FALLOS_SEGUIDOS = 3

export type TraidaReport = {
  autores: Array<{ username: string; nuevas: number; error?: string }>
  leidas: number
  topeAlcanzado: boolean
}

async function marcar(id: string, error: string | null): Promise<void> {
  await getDb()
    .update(sourceAuthors)
    .set({ lastError: error, updatedAt: new Date() })
    .where(eq(sourceAuthors.id, id))
}

/**
 * Una pasada de la traída. Corre en su propio cron, pocas veces al día: se paga por
 * publicación leída, y un creador publica tres o cuatro veces, no cada cinco minutos.
 */
export async function traerIdeas(now: Date = new Date()): Promise<TraidaReport> {
  const db = getDb()
  const reporte: TraidaReport = { autores: [], leidas: 0, topeAlcanzado: false }

  const hoy = diaDe(now)
  const tope = normalizarTope(await leerAjuste(CLAVE_TOPE))
  let leidas = leidasHoy(await leerAjuste(CLAVE_CONTADOR), hoy)
  if (leidas >= tope) {
    reporte.topeAlcanzado = true
    return reporte
  }

  const autores = await db.select().from(sourceAuthors).where(eq(sourceAuthors.active, true))

  let seguidos = 0
  for (const autor of autores) {
    const fuente = fuenteFor(autor.network)
    // Una red sin fuente se ignora en silencio: no es un fallo, es que todavía no existe.
    if (!fuente) continue

    const restante = tope - leidas
    if (restante <= 0) {
      reporte.topeAlcanzado = true
      break
    }

    try {
      let externalId = autor.externalId
      if (!externalId) {
        externalId = await fuente.resolverAutor(autor.username)
        await db
          .update(sourceAuthors)
          .set({ externalId, updatedAt: new Date() })
          .where(eq(sourceAuthors.id, autor.id))
      }

      const ajenos = await fuente.traer(externalId, autor.username, autor.sinceId, restante)
      leidas += ajenos.length
      seguidos = 0

      if (ajenos.length > 0) {
        await db
          .insert(sourcePosts)
          .values(
            ajenos.map((p) => ({
              authorId: autor.id,
              network: autor.network,
              externalId: p.externalId,
              url: p.url,
              authorHandle: p.authorHandle,
              originalText: p.text,
              publishedAt: p.publishedAt,
            })),
          )
          // Dos corridas que se solapen verían los mismos tuits; la unique decide y la
          // segunda no pisa nada.
          .onConflictDoNothing({
            target: [sourcePosts.authorId, sourcePosts.externalId],
          })

        let masNuevo = autor.sinceId
        for (const p of ajenos) masNuevo = idMayor(masNuevo, p.externalId)
        await db
          .update(sourceAuthors)
          .set({ sinceId: masNuevo, lastError: null, updatedAt: new Date() })
          .where(eq(sourceAuthors.id, autor.id))
      } else if (autor.lastError) {
        await marcar(autor.id, null)
      }

      reporte.autores.push({ username: autor.username, nuevas: ajenos.length })
    } catch (error) {
      // El detalle de X se queda en el log: el reporte lleva una frase fija.
      console.error(`[ideas] ${autor.username}:`, String(error).slice(0, 300))
      await marcar(autor.id, AUTOR_ILEGIBLE)
      reporte.autores.push({ username: autor.username, nuevas: 0, error: AUTOR_ILEGIBLE })
      seguidos += 1
      if (seguidos >= MAX_FALLOS_SEGUIDOS) {
        console.error(`[ideas] se abandona la corrida tras ${seguidos} cuentas seguidas fallando.`)
        break
      }
    }
  }

  reporte.leidas = leidas
  await guardarAjuste(CLAVE_CONTADOR, serializarContador(hoy, leidas))
  return reporte
}
```

Fíjate en el contador: se guarda **siempre** al final, incluso si la corrida se cortó. Lo
que ya se leyó ya se pagó, y olvidarlo sería pagarlo dos veces mañana.

- [x] **Paso 2: El cron**

`src/app/api/cron/traer-ideas/route.ts`, con la misma disciplina que
`src/app/api/cron/publish-social/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { traerIdeas } from '@/lib/social/fuentes/run'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
// Holgado: la traída son unas pocas llamadas a X, una por creador de la lista, y corre
// cuatro veces al día en su propio horario.
export const maxDuration = 120

export async function GET(request: Request) {
  const secret = env('CRON_SECRET')
  // Misma disciplina que publish-social: sin secreto el endpoint queda cerrado.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  try {
    const reporte = await traerIdeas()
    return NextResponse.json(reporte)
  } catch (error) {
    console.error('Falló la traída de ideas:', String(error).slice(0, 300))
    return NextResponse.json({ error: 'La traída de ideas falló por completo.' }, { status: 500 })
  }
}
```

- [x] **Paso 3: Verificar**

Corre `npm test`, `npm run typecheck`, `npm run lint` y `npx next build`. Hay un warning
conocido y ajeno de Vite sobre `vitest.config.ts`: no lo toques.

No hay test nuevo en esta tarea: `run.ts` toca la base y la red, y la casa no prueba esos
orquestadores. Su vecino directo, `src/lib/social/comentarios/run.ts`, tampoco tiene test.
Lo puro que esta tarea usa ya está probado en las tareas 2 y 3.

- [x] **Paso 4: Commit**

```bash
git add src/lib/social/fuentes/run.ts src/app/api/cron/traer-ideas/route.ts
git commit
```

Mensaje: `Trae las ideas nuevas de cada creador de la lista`

---

### Task 5: El instructivo

**Archivos:**
- Modificar: `.env.example`
- Modificar: `README.md`
- Modificar: este plan (marcar las casillas)

- [x] **Paso 1: La variable**

En `.env.example`, al final, con el formato de las demás:

```
# Leer los tuits públicos de los creadores del modo Tinder, con autenticación de
# aplicación. Se saca del portal de desarrolladores de X, en la misma app que ya publica.
X_BEARER_TOKEN=
```

- [x] **Paso 2: El README**

Después de la sección «Responder comentarios» y antes de la siguiente, agrega:

```markdown
### Modo Tinder

El panel puede leer los tuits nuevos de una lista de creadores que tú curas y —en las
entregas siguientes— proponerte una reescritura con tu voz que apruebas de un toque. Nada
sale publicado sin que lo veas.

Para que funcione necesitas `X_BEARER_TOKEN` en el entorno, que sacas del portal de
desarrolladores de X, en la misma app que ya usas para publicar. X ya no tiene capa
gratuita: hay que **activar facturación por uso en la app**. Cobra unos 0,005 dólares por
publicación leída, así que veinte creadores publicando tres veces al día salen por unos
nueve dólares al mes.

La traída corre cuatro veces al día, en su propio cron, y solo pide lo publicado desde la
última vez. Un creador que no publicó nada no cuesta nada. Hay un techo diario de 300
lecturas como red de seguridad; al alcanzarlo la traída para y sigue al día siguiente sin
perder nada.

El cron nuevo lo dispara el mismo pinger externo que el de publicación, así que hay que
darlo de alta en cron-job.org apuntando a `/api/cron/traer-ideas` con el mismo
`CRON_SECRET`, a las 9, 13, 17 y 21 UTC. Sin esa entrada el endpoint existe y no lo llama
nadie, y el síntoma sería una baraja vacía sin ningún error a la vista.

Después de fusionar hay que correr `npm run db:push` otra vez, porque las tablas de
creadores y de fichas son nuevas.
```

Mantén el tono del resto: segunda persona, español, frases cortas.

- [x] **Paso 3: Las casillas**

Marca `[x]` los pasos de este plan que quedaron hechos.

- [x] **Paso 4: Verificar y commit**

Corre `npm run lint`.

```bash
git add .env.example README.md docs/superpowers/plans/2026-09-11-tinder-1-lista-y-traida.md
git commit
```

Mensaje: `Explica qué necesita la traída de ideas y cuánto cuesta`

---

## Lo que esta entrega no hace

- **No reescribe nada.** Las fichas quedan en `cruda` con el texto original. La reescritura
  es la entrega 2.
- **No se ve en pantalla.** Administrar la lista de creadores y ver la baraja son las
  entregas 3 y 4; por ahora las filas se agregan a mano en la base.
- **No publica nada.** Aprobar no existe todavía.
