# Comentarios 1: la cola y el sondeo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada comentario nuevo en las publicaciones del dueño quede guardado en una cola, descubierto por el cron que ya corre cada cinco minutos, en Instagram, Facebook y YouTube. Todavía no se responde ni se redacta nada: al terminar, la tabla se llena sola.

**Architecture:** Un `Comentarista` por red con la misma forma que los `Connector` y los `Publisher` que ya existen (`listar`, `responder`, su propia credencial cuando difiere de la de lectura), un registro en `src/lib/social/comentarios/index.ts`, y un orquestador `sondearComentarios` que el cron de publicación llama al final. Lo que decide algo —qué publicaciones entran en la ventana, cómo se normaliza cada payload, cómo se recorta un texto— es puro y se testea; lo que habla con la red vive en su archivo.

**Tech Stack:** Next.js App Router, Drizzle + Neon (`db:push`, sin archivos de migración), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-comentarios-design.md` (secciones 1, 4, 8 y 9, y la tabla de entregas).

Rama: `comentarios`, nacida de `main` con el spec ya commiteado.

## Global Constraints

- Frases fijas en español en todo lo visible; el detalle de la red solo a `console.error` truncado a 300 (`String(error).slice(0, 300)`).
- La identidad de un comentario es `(account_id, external_id)`: un comentario nunca se procesa dos veces, y el sondeo jamás pisa una fila existente.
- Un comentario del propio dueño (su autor es el id externo de la cuenta) entra con estado `propio` y nunca recibe borrador ni respuesta: es su propia respuesta.
- Ventana de **siete días** por `published_at` del post, tope de **20** publicaciones por cuenta y pasada, la más reciente primero.
- El sondeo corre **después** de publicar y **antes** del barrido, y su fallo nunca tumba la corrida: publicar a tiempo manda sobre responder a tiempo.
- Solo cuentas **con credencial** (`access_token` no nulo) y de las tres redes con comentarista. Una red sin comentarista se ignora en silencio.
- Los comentaristas no escriben en la base: devuelven datos y el orquestador decide. `comentarios/` no importa `server-only` salvo el orquestador (`run.ts`), que sí toca la base.
- Comentarios solo para restricciones que el código no puede mostrar, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la ejecución**: la tabla es nueva y vacía, así que el push lo hace el controlador al desplegar.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | la tabla `post_comments` |
| `src/lib/social/comentarios/comentarista.ts` | los tipos, los estados y las frases fijas |
| `src/lib/social/comentarios/ventana.ts` | lo puro: qué publicaciones entran en la pasada |
| `src/lib/social/comentarios/instagram.ts` | listar y responder en Instagram, con su normalizador puro |
| `src/lib/social/comentarios/facebook.ts` | ídem Facebook |
| `src/lib/social/comentarios/youtube.ts` | ídem YouTube, con la credencial OAuth del publisher |
| `src/lib/social/comentarios/index.ts` | el registro `COMENTARISTAS` |
| `src/lib/social/comentarios/run.ts` | `sondearComentarios`: recorre cuentas, guarda lo nuevo |
| `src/app/api/cron/publish-social/route.ts` | llama al sondeo entre publicar y barrer |
| `src/app/api/social/[network]/connect/route.ts` | los permisos nuevos |
| `README.md` | qué reconectar y por qué |

---

### Task 1: La tabla y lo puro de la ventana

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/lib/social/comentarios/comentarista.ts`, `src/lib/social/comentarios/ventana.ts`
- Test: `src/lib/social/comentarios/ventana.test.ts`

**Interfaces:**
- Produces (Tasks 2-3), de `schema.ts`: la tabla `postComments` y el tipo `PostComment`.
- Produces, de `comentarista.ts`: `COMMENT_STATES`, `type CommentState`, `type ComentarioLeido = { externalId: string; postExternalId: string; author: string | null; authorExternalId: string | null; text: string; publishedAt: Date }`, `type Comentarista`, y las frases `SIN_CREDENCIAL`, `RED_RECHAZO`, `COMENTARIO_AUSENTE`.
- Produces, de `ventana.ts`: `DIAS_VENTANA = 7`, `MAX_POSTS_POR_PASADA = 20`, `postsAsondear(posts: Array<{ externalId: string; publishedAt: Date }>, now: Date): string[]`, `recortar(texto: string, limite: number): string`.

- [ ] **Step 1: El test que falla**

```ts
// src/lib/social/comentarios/ventana.test.ts
import { describe, expect, it } from 'vitest'
import { DIAS_VENTANA, MAX_POSTS_POR_PASADA, postsAsondear, recortar } from './ventana'

const now = new Date('2026-09-11T12:00:00Z')
const hace = (dias: number) => new Date(now.getTime() - dias * 864e5)

describe('postsAsondear', () => {
  it('deja pasar lo de los últimos siete días, del más nuevo al más viejo', () => {
    expect(
      postsAsondear(
        [
          { externalId: 'viejo', publishedAt: hace(3) },
          { externalId: 'nuevo', publishedAt: hace(1) },
        ],
        now,
      ),
    ).toEqual(['nuevo', 'viejo'])
  })

  it('descarta lo que quedó fuera de la ventana', () => {
    expect(
      postsAsondear(
        [
          { externalId: 'dentro', publishedAt: hace(DIAS_VENTANA - 0.1) },
          { externalId: 'fuera', publishedAt: hace(DIAS_VENTANA + 0.1) },
        ],
        now,
      ),
    ).toEqual(['dentro'])
  })

  it('corta en el tope por pasada, quedándose con los más nuevos', () => {
    const muchos = Array.from({ length: MAX_POSTS_POR_PASADA + 5 }, (_, i) => ({
      externalId: `p${i}`,
      // p0 es el más viejo; los últimos son los más nuevos.
      publishedAt: new Date(now.getTime() - (MAX_POSTS_POR_PASADA + 5 - i) * 3600_000),
    }))
    const elegidos = postsAsondear(muchos, now)
    expect(elegidos).toHaveLength(MAX_POSTS_POR_PASADA)
    expect(elegidos[0]).toBe(`p${MAX_POSTS_POR_PASADA + 4}`)
    expect(elegidos).not.toContain('p0')
  })

  it('un post del futuro no rompe nada: entra, porque su fecha está dentro', () => {
    expect(postsAsondear([{ externalId: 'f', publishedAt: new Date(now.getTime() + 864e5) }], now)).toEqual(['f'])
  })

  it('sin publicaciones no hay nada que sondear', () => {
    expect(postsAsondear([], now)).toEqual([])
  })
})

describe('recortar', () => {
  it('deja intacto lo que cabe', () => {
    expect(recortar('hola', 10)).toBe('hola')
  })

  it('corta en el límite, sin puntos suspensivos: es un texto que se publica', () => {
    expect(recortar('hola mundo', 4)).toBe('hola')
  })

  it('recorta los espacios de los bordes antes de medir', () => {
    expect(recortar('  hola  ', 10)).toBe('hola')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/social/comentarios/ventana.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: La tabla**

En `src/db/schema.ts`, al final del archivo y antes del bloque de `export type`, agrega:

```ts
export const COMMENT_STATES = ['pendiente', 'enviado', 'descartado', 'propio', 'fallido'] as const
export type CommentState = (typeof COMMENT_STATES)[number]

/**
 * Un comentario que alguien dejó en una publicación del dueño, y qué se hizo con él.
 *
 * La identidad es `(account_id, external_id)`: es lo que impide que el sondeo lo
 * procese dos veces, y por eso la fila sobrevive al envío en vez de borrarse. `propio`
 * marca los comentarios del dueño mismo — sus propias respuestas — que nunca reciben
 * borrador.
 *
 * `draft` y `draft_error` los llena la entrega 2; `reply_external_id` y `error`, la 3.
 */
export const postComments = pgTable(
  'post_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    network: text('network').notNull(),
    postExternalId: text('post_external_id').notNull(),
    externalId: text('external_id').notNull(),
    author: text('author'),
    authorExternalId: text('author_external_id'),
    text: text('text').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    draft: text('draft'),
    draftError: text('draft_error'),
    state: text('state').$type<CommentState>().notNull().default('pendiente'),
    replyExternalId: text('reply_external_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('post_comments_account_external_key').on(t.externalId, t.accountId),
    index('post_comments_state_idx').on(t.state),
    index('post_comments_published_idx').on(t.publishedAt),
  ],
)
```

y junto a los otros tipos exportados al final: `export type PostComment = typeof postComments.$inferSelect`.

**El orden de las columnas de la unique importa**: drizzle-kit introspecta las claves
únicas por la posición física de la columna en la tabla, y `external_id` se declara antes
que `account_id`. Declararla al revés hace que cada `db:push` quiera recrearla (ver el
comentario de `social_posts_account_external_key`).

- [ ] **Step 4: Los tipos y las frases**

```ts
// src/lib/social/comentarios/comentarista.ts
import type { SocialAccount } from '@/db'
import type { CommentState } from '@/db/schema'

export type { CommentState }

/** Lo que una red cuenta de un comentario, ya normalizado. */
export type ComentarioLeido = {
  externalId: string
  postExternalId: string
  /** Nombre o usuario visible; null cuando la red no lo entrega. */
  author: string | null
  /** El id del autor en la red: con él se reconoce un comentario del propio dueño. */
  authorExternalId: string | null
  text: string
  publishedAt: Date
}

/**
 * Lo único que el orquestador sabe de una red. Agregar Threads o X el día que se quiera
 * es un archivo y una línea en el índice, igual que `Connector` y `Publisher`.
 */
export type Comentarista = {
  network: string
  /**
   * Credencial de escritura cuando difiere de la de lectura. YouTube lee con una API key
   * y comenta con OAuth, que es exactamente la razón por la que `Publisher` tiene este
   * mismo campo.
   */
  ensureCredential?(account: SocialAccount): Promise<string | null>
  listar(account: SocialAccount, token: string, postExternalId: string): Promise<ComentarioLeido[]>
  responder(account: SocialAccount, token: string, comentarioExternalId: string, texto: string): Promise<string>
  /** Cuántos caracteres acepta la red en una respuesta. */
  limiteTexto: number
}

// Frases fijas: lo único que el dueño puede llegar a leer de un fallo.
export const SIN_CREDENCIAL = 'Esa cuenta ya no está conectada.'
export const RED_RECHAZO = 'La red no aceptó la respuesta. Inténtalo de nuevo.'
export const COMENTARIO_AUSENTE = 'El comentario ya no está en la red.'
```

- [ ] **Step 5: Lo puro de la ventana**

```ts
// src/lib/social/comentarios/ventana.ts
// Qué publicaciones entran en una pasada del sondeo, y cómo se recorta un texto al
// límite de su red. Puro: sin base, sin red.

/** Coincide con el plazo del mensaje privado de Meta, que es lo que viene después. */
export const DIAS_VENTANA = 7
/**
 * El sondeo corre dentro de la corrida de publicación, que tiene 240 segundos y una
 * cadencia de cinco minutos: el tope es lo que impide que responder a tiempo le quite
 * el turno a publicar a tiempo.
 */
export const MAX_POSTS_POR_PASADA = 20

/** Los ids a sondear, del más nuevo al más viejo, ya acotados por ventana y por tope. */
export function postsAsondear(
  posts: Array<{ externalId: string; publishedAt: Date }>,
  now: Date,
): string[] {
  const desde = now.getTime() - DIAS_VENTANA * 864e5
  return posts
    .filter((post) => post.publishedAt.getTime() >= desde)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, MAX_POSTS_POR_PASADA)
    .map((post) => post.externalId)
}

/** Sin puntos suspensivos a propósito: esto se publica, no se muestra. */
export function recortar(texto: string, limite: number): string {
  return texto.trim().slice(0, limite)
}
```

- [ ] **Step 6: Verde y commit**

Run: `npx vitest run src/lib/social/comentarios/ventana.test.ts && npm run typecheck && npm run lint`
Expected: PASS y sin errores.

```bash
git add src/db/schema.ts src/lib/social/comentarios/comentarista.ts src/lib/social/comentarios/ventana.ts src/lib/social/comentarios/ventana.test.ts
git commit -m "Agrega la tabla de comentarios y lo puro de la ventana de sondeo"
```

---

### Task 2: Los tres comentaristas

**Files:**
- Create: `src/lib/social/comentarios/instagram.ts`, `facebook.ts`, `youtube.ts`, `index.ts`
- Test: `src/lib/social/comentarios/instagram.test.ts`, `facebook.test.ts`, `youtube.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Comentarista`, `ComentarioLeido`, `recortar`, `COMENTARIO_AUSENTE`).
- Produces (Task 3): `COMENTARISTAS: Comentarista[]`, `comentaristaFor(network: string): Comentarista | undefined`, y los normalizadores puros `normalizeInstagramComment`, `normalizeFacebookComment`, `normalizeYouTubeThread`.

- [ ] **Step 1: Tests que fallan**

```ts
// src/lib/social/comentarios/instagram.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeInstagramComment } from './instagram'

describe('normalizeInstagramComment', () => {
  it('mapea el payload de Graph a un comentario', () => {
    expect(
      normalizeInstagramComment(
        {
          id: '17900000000000001',
          text: '¿Cuánto cobras por esto?',
          timestamp: '2026-09-10T18:22:04+0000',
          username: 'alguien',
          from: { id: '17841400000000999', username: 'alguien' },
        },
        '18114074218999893',
      ),
    ).toEqual({
      externalId: '17900000000000001',
      postExternalId: '18114074218999893',
      author: '@alguien',
      authorExternalId: '17841400000000999',
      text: '¿Cuánto cobras por esto?',
      publishedAt: new Date('2026-09-10T18:22:04+0000'),
    })
  })

  it('tolera un comentario sin from ni username', () => {
    const c = normalizeInstagramComment({ id: '1', text: 'hola', timestamp: '2026-09-10T18:22:04+0000' }, 'p')
    expect(c).toMatchObject({ author: null, authorExternalId: null, text: 'hola' })
  })

  it('un comentario sin texto es texto vacío, nunca null: la columna no lo admite', () => {
    expect(normalizeInstagramComment({ id: '1', timestamp: '2026-09-10T18:22:04+0000' }, 'p').text).toBe('')
  })

  it('sin id devuelve null: sin identidad no hay fila', () => {
    expect(normalizeInstagramComment({ text: 'hola', timestamp: '2026-09-10T18:22:04+0000' }, 'p')).toBeNull()
  })
})
```

```ts
// src/lib/social/comentarios/facebook.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeFacebookComment } from './facebook'

describe('normalizeFacebookComment', () => {
  it('mapea el payload de Graph a un comentario', () => {
    expect(
      normalizeFacebookComment(
        {
          id: '1020304050607080_9988776655',
          message: 'Gran video',
          created_time: '2026-09-10T18:22:04+0000',
          from: { id: '61550000000042', name: 'Ana Pérez' },
        },
        '61550000000001_1020304050607080',
      ),
    ).toEqual({
      externalId: '1020304050607080_9988776655',
      postExternalId: '61550000000001_1020304050607080',
      author: 'Ana Pérez',
      authorExternalId: '61550000000042',
      text: 'Gran video',
      publishedAt: new Date('2026-09-10T18:22:04+0000'),
    })
  })

  it('tolera el from ausente, que es lo que Graph devuelve sin el permiso de identidad', () => {
    const c = normalizeFacebookComment({ id: '1', message: 'hola', created_time: '2026-09-10T18:22:04+0000' }, 'p')
    expect(c).toMatchObject({ author: null, authorExternalId: null })
  })

  it('sin id devuelve null', () => {
    expect(normalizeFacebookComment({ message: 'hola', created_time: '2026-09-10T18:22:04+0000' }, 'p')).toBeNull()
  })
})
```

```ts
// src/lib/social/comentarios/youtube.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeYouTubeThread } from './youtube'

describe('normalizeYouTubeThread', () => {
  it('toma el comentario de primer nivel del hilo', () => {
    expect(
      normalizeYouTubeThread(
        {
          id: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
          snippet: {
            topLevelComment: {
              id: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
              snippet: {
                textOriginal: 'Buenísimo el dato',
                authorDisplayName: 'Ana Pérez',
                authorChannelId: { value: 'UCanaperez' },
                publishedAt: '2026-09-10T18:22:04Z',
                videoId: 'dQw4w9WgXcQ',
              },
            },
          },
        },
        'dQw4w9WgXcQ',
      ),
    ).toEqual({
      externalId: 'UgxKREWxIgDrw8w2e_Z4AaABAg',
      postExternalId: 'dQw4w9WgXcQ',
      author: 'Ana Pérez',
      authorExternalId: 'UCanaperez',
      text: 'Buenísimo el dato',
      publishedAt: new Date('2026-09-10T18:22:04Z'),
    })
  })

  it('sin comentario de primer nivel devuelve null', () => {
    expect(normalizeYouTubeThread({ id: 'x', snippet: {} }, 'v')).toBeNull()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/social/comentarios`
Expected: FAIL — los módulos no existen.

- [ ] **Step 3: Instagram**

```ts
// src/lib/social/comentarios/instagram.ts
import type { SocialAccount } from '@/db'
import { instagramConnector } from '../instagram'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
/** El mismo tope que un caption: Graph rechaza más. */
const LIMITE = 2200

export type InstagramCommentPayload = {
  id?: string
  text?: string
  timestamp?: string
  username?: string
  from?: { id?: string; username?: string }
}

/** Null cuando el payload no trae id: sin identidad no hay fila que insertar. */
export function normalizeInstagramComment(
  raw: InstagramCommentPayload,
  postExternalId: string,
): ComentarioLeido | null {
  if (!raw.id) return null
  const usuario = raw.from?.username ?? raw.username ?? null
  return {
    externalId: raw.id,
    postExternalId,
    author: usuario ? `@${usuario}` : null,
    authorExternalId: raw.from?.id ?? null,
    // La columna es NOT NULL y un comentario puede ser solo una imagen o un sticker.
    text: raw.text ?? '',
    publishedAt: new Date(raw.timestamp ?? 0),
  }
}

async function pedir(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Instagram ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const instagramComentarista: Comentarista = {
  network: 'instagram',
  // Lee y comenta con la misma credencial; `instagram_manage_comments` es lo que
  // habilita ambas cosas sobre la propia cuenta. Envuelto en una flecha y no pasado por
  // referencia, para que el método conserve su `this` si algún día lo necesita.
  ensureCredential: (account) => instagramConnector.ensureCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const fields = 'id,text,timestamp,username,from'
    const data = (await pedir(
      `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`,
    )) as { data?: InstagramCommentPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.data ?? []) {
      const c = normalizeInstagramComment(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${GRAPH}/${comentarioExternalId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: recortar(texto, LIMITE), access_token: token }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Instagram ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Instagram no devolvió el id de la respuesta')
    return body.id
  },
}
```

- [ ] **Step 4: Facebook**

```ts
// src/lib/social/comentarios/facebook.ts
import { facebookConnector } from '../facebook'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const GRAPH = 'https://graph.facebook.com/v23.0'
const LIMITE = 8000

export type FacebookCommentPayload = {
  id?: string
  message?: string
  created_time?: string
  from?: { id?: string; name?: string }
}

export function normalizeFacebookComment(
  raw: FacebookCommentPayload,
  postExternalId: string,
): ComentarioLeido | null {
  if (!raw.id) return null
  return {
    externalId: raw.id,
    postExternalId,
    // `from` viene vacío sin el permiso de identidad del comentarista; el comentario
    // sigue sirviendo, solo que sin nombre.
    author: raw.from?.name ?? null,
    authorExternalId: raw.from?.id ?? null,
    text: raw.message ?? '',
    publishedAt: new Date(raw.created_time ?? 0),
  }
}

async function pedir(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Facebook ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

export const facebookComentarista: Comentarista = {
  network: 'facebook',
  ensureCredential: (account) => facebookConnector.ensureCredential(account),
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const fields = 'id,message,created_time,from'
    const data = (await pedir(
      `${GRAPH}/${postExternalId}/comments?fields=${fields}&limit=50&access_token=${token}`,
    )) as { data?: FacebookCommentPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.data ?? []) {
      const c = normalizeFacebookComment(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${GRAPH}/${comentarioExternalId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: recortar(texto, LIMITE), access_token: token }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Facebook ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('Facebook no devolvió el id de la respuesta')
    return body.id
  },
}
```

- [ ] **Step 5: YouTube**

Lee antes `src/lib/social/publish/youtube.ts` y **reusa** su `ensureYoutubeCredential`
en vez de escribir otro: si no está exportada, expórtala (solo el `export`, sin tocar su
cuerpo). Es la credencial OAuth; la del conector es la API key de lectura y no sirve para
comentar.

```ts
// src/lib/social/comentarios/youtube.ts
import { ensureYoutubeCredential } from '../publish/youtube'
import { COMENTARIO_AUSENTE, type Comentarista, type ComentarioLeido } from './comentarista'
import { recortar } from './ventana'

const API = 'https://www.googleapis.com/youtube/v3'
const LIMITE = 10000

export type YouTubeThreadPayload = {
  id?: string
  snippet?: {
    topLevelComment?: {
      id?: string
      snippet?: {
        textOriginal?: string
        authorDisplayName?: string
        authorChannelId?: { value?: string }
        publishedAt?: string
      }
    }
  }
}

export function normalizeYouTubeThread(
  raw: YouTubeThreadPayload,
  postExternalId: string,
): ComentarioLeido | null {
  const top = raw.snippet?.topLevelComment
  const snippet = top?.snippet
  const id = top?.id ?? raw.id
  if (!id || !snippet) return null
  return {
    externalId: id,
    postExternalId,
    author: snippet.authorDisplayName ?? null,
    authorExternalId: snippet.authorChannelId?.value ?? null,
    text: snippet.textOriginal ?? '',
    publishedAt: new Date(snippet.publishedAt ?? 0),
  }
}

export const youtubeComentarista: Comentarista = {
  network: 'youtube',
  // OAuth, no la API key: el conector lee con `key=` y comentar exige `youtube.force-ssl`.
  ensureCredential: ensureYoutubeCredential,
  limiteTexto: LIMITE,

  async listar(_account, token, postExternalId) {
    const response = await fetch(
      `${API}/commentThreads?part=snippet&videoId=${postExternalId}&maxResults=50&order=time`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!response.ok) {
      const body = await response.text()
      // 403 con `commentsDisabled` es una respuesta normal: ese video no recibe
      // comentarios y no hay nada que sondear.
      if (response.status === 403 && body.includes('commentsDisabled')) return []
      throw new Error(`YouTube ${response.status}: ${body.slice(0, 200)}`)
    }
    const data = (await response.json()) as { items?: YouTubeThreadPayload[] }
    const leidos: ComentarioLeido[] = []
    for (const raw of data.items ?? []) {
      const c = normalizeYouTubeThread(raw, postExternalId)
      if (c) leidos.push(c)
    }
    return leidos
  },

  async responder(_account, token, comentarioExternalId, texto) {
    const response = await fetch(`${API}/comments?part=snippet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { parentId: comentarioExternalId, textOriginal: recortar(texto, LIMITE) },
      }),
    })
    if (response.status === 404) throw new Error(COMENTARIO_AUSENTE)
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`YouTube ${response.status}: ${body.slice(0, 200)}`)
    }
    const body = (await response.json()) as { id?: string }
    if (!body.id) throw new Error('YouTube no devolvió el id de la respuesta')
    return body.id
  },
}
```

- [ ] **Step 6: El registro**

```ts
// src/lib/social/comentarios/index.ts
import type { Comentarista } from './comentarista'
import { facebookComentarista } from './facebook'
import { instagramComentarista } from './instagram'
import { youtubeComentarista } from './youtube'

/** Agregar Threads o X es un archivo y una línea acá, igual que CONNECTORS y PUBLISHERS. */
export const COMENTARISTAS: Comentarista[] = [
  instagramComentarista,
  facebookComentarista,
  youtubeComentarista,
]

export function comentaristaFor(network: string): Comentarista | undefined {
  return COMENTARISTAS.find((c) => c.network === network)
}

export * from './comentarista'
```

- [ ] **Step 7: Verde y commit**

Run: `npx vitest run src/lib/social/comentarios && npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add src/lib/social/comentarios/instagram.ts src/lib/social/comentarios/instagram.test.ts src/lib/social/comentarios/facebook.ts src/lib/social/comentarios/facebook.test.ts src/lib/social/comentarios/youtube.ts src/lib/social/comentarios/youtube.test.ts src/lib/social/comentarios/index.ts src/lib/social/publish/youtube.ts
git commit -m "Agrega los comentaristas de Instagram, Facebook y YouTube"
```

---

### Task 3: El sondeo, dentro del cron

**Files:**
- Create: `src/lib/social/comentarios/run.ts`
- Modify: `src/app/api/cron/publish-social/route.ts`

**Interfaces:**
- Consumes: Tasks 1 y 2.
- Produces: `sondearComentarios(now?: Date): Promise<SondeoReport>` con
  `SondeoReport = Array<{ network: string; handle: string | null; posts: number; nuevos: number; error?: string }>`.

- [ ] **Step 1: El orquestador**

```ts
// src/lib/social/comentarios/run.ts
import 'server-only'
import { and, desc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm'
import { getDb, postComments, socialAccounts, socialPosts } from '@/db'
import type { SocialAccount } from '@/db'
import { connectorFor } from '../index'
import { comentaristaFor } from './index'
import { DIAS_VENTANA, postsAsondear } from './ventana'

export type SondeoReport = Array<{
  network: string
  handle: string | null
  posts: number
  nuevos: number
  error?: string
}>

async function sondearCuenta(
  account: SocialAccount,
  now: Date,
): Promise<{ posts: number; nuevos: number }> {
  const comentarista = comentaristaFor(account.network)
  if (!comentarista) return { posts: 0, nuevos: 0 }
  const db = getDb()

  // La credencial del comentarista cuando difiere de la de lectura, y si no la del
  // conector: el mismo molde que usa `attempt` en publish/run.ts.
  const ensure = comentarista.ensureCredential ?? connectorFor(account.network)?.ensureCredential
  const token = ensure ? await ensure(account) : null
  // Sin credencial no es un fallo: es una cuenta que el dueño desconectó, o una red
  // cuyo permiso nuevo todavía no autorizó. Se sale antes de tocar la red.
  if (!token) return { posts: 0, nuevos: 0 }

  // Las publicaciones ya están en la base: la sincronización diaria las trajo. El sondeo
  // no vuelve a preguntarle a la red cuáles son.
  const desde = new Date(now.getTime() - DIAS_VENTANA * 864e5)
  const recientes = await db
    .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.accountId, account.id),
        isNull(socialPosts.archivedAt),
        gte(socialPosts.publishedAt, desde),
      ),
    )
    .orderBy(desc(socialPosts.publishedAt))

  const ids = postsAsondear(recientes, now)
  if (ids.length === 0) return { posts: 0, nuevos: 0 }

  // Todos los comentarios ya conocidos de esta cuenta en esos posts, de una consulta:
  // preguntar por cada comentario sería una consulta por comentario y por pasada.
  const conocidos = new Set(
    (
      await db
        .select({ externalId: postComments.externalId })
        .from(postComments)
        .where(and(eq(postComments.accountId, account.id), inArray(postComments.postExternalId, ids)))
    ).map((fila) => fila.externalId),
  )

  let nuevos = 0
  for (const postExternalId of ids) {
    const leidos = await comentarista.listar(account, token, postExternalId)
    const frescos = leidos.filter((c) => !conocidos.has(c.externalId))
    if (frescos.length === 0) continue

    await db
      .insert(postComments)
      .values(
        frescos.map((c) => ({
          accountId: account.id,
          network: account.network,
          postExternalId: c.postExternalId,
          externalId: c.externalId,
          author: c.author,
          authorExternalId: c.authorExternalId,
          text: c.text,
          publishedAt: c.publishedAt,
          // Un comentario del propio dueño es su propia respuesta: entra al historial
          // pero nunca a la cola.
          state:
            c.authorExternalId && c.authorExternalId === account.externalId
              ? ('propio' as const)
              : ('pendiente' as const),
        })),
      )
      // Dos pasadas que se solapan verían los mismos comentarios; la unique decide y la
      // segunda no pisa nada.
      .onConflictDoNothing({ target: [postComments.externalId, postComments.accountId] })
    for (const c of frescos) conocidos.add(c.externalId)
    nuevos += frescos.length
  }

  return { posts: ids.length, nuevos }
}

/**
 * Una pasada de descubrimiento. Corre dentro de la corrida de publicación, después de
 * publicar: el fallo de una cuenta no detiene a las demás, y ninguno detiene la corrida.
 */
export async function sondearComentarios(now: Date = new Date()): Promise<SondeoReport> {
  const cuentas = await getDb()
    .select()
    .from(socialAccounts)
    .where(isNotNull(socialAccounts.accessToken))

  const conComentarista = cuentas.filter((cuenta) => comentaristaFor(cuenta.network))
  const reporte: SondeoReport = []
  // En serie, como la sincronización: la casa nunca pega concurrente contra Meta.
  for (const cuenta of conComentarista) {
    try {
      const { posts, nuevos } = await sondearCuenta(cuenta, now)
      reporte.push({ network: cuenta.network, handle: cuenta.handle, posts, nuevos })
    } catch (error) {
      console.error(`[comentarios] ${cuenta.network}:`, String(error).slice(0, 300))
      reporte.push({
        network: cuenta.network,
        handle: cuenta.handle,
        posts: 0,
        nuevos: 0,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      })
    }
  }
  return reporte
}
```

- [ ] **Step 2: El cron**

En `src/app/api/cron/publish-social/route.ts`, importa `sondearComentarios` de
`@/lib/social/comentarios/run` y, entre `publishDue()` y `barrerHuerfanos()`:

```ts
    // Después de publicar y antes de barrer: publicar a tiempo manda sobre responder a
    // tiempo, y el sondeo no debe quitarle segundos a la publicación de esta pasada.
    // Su fallo no puede tumbar la corrida, que ya publicó.
    let comentarios: Awaited<ReturnType<typeof sondearComentarios>> = []
    try {
      comentarios = await sondearComentarios()
    } catch (error) {
      console.error('Falló el sondeo de comentarios:', String(error).slice(0, 300))
    }
```

y el `NextResponse.json({ report, barrido })` pasa a `{ report, comentarios, barrido }`.

- [ ] **Step 3: Verificar y commitear**

Run: `npm run typecheck && npm run lint && npm test`
Expected: verde; ningún test cambia.

```bash
git add src/lib/social/comentarios/run.ts src/app/api/cron/publish-social/route.ts
git commit -m "Sondea los comentarios nuevos en cada corrida de publicación"
```

---

### Task 4: Los permisos y el instructivo

**Files:**
- Modify: `src/app/api/social/[network]/connect/route.ts`, `README.md`, este plan

- [x] **Step 1: Los permisos**

En `SCOPES`:
- `instagram`: agrega `,instagram_manage_comments` al final de la cadena.
- `facebook`: agrega `,pages_manage_engagement`.
- `youtube`: reemplaza `https://www.googleapis.com/auth/youtube.readonly` por
  `https://www.googleapis.com/auth/youtube.force-ssl` (separado por espacio del
  `youtube.upload` que ya está).

Sobre el bloque de `youtube`, ajusta el comentario existente: `force-ssl` incluye todo lo
que hacía `readonly` (el descubrimiento de canal del callback y el sondeo de
procesamiento del publisher) y además permite comentar, que es lo que se agrega acá.

Sobre `instagram` y `facebook`, una línea cada uno: el permiso nuevo es el que habilita
listar y responder comentarios en las publicaciones propias, y con la app en modo
desarrollo no necesita revisión de Meta.

- [x] **Step 2: El README**

En la sección «Analítica de posts», después del bloque de TikTok y antes de «Conectar y
sincronizar», agrega:

```markdown
### Responder comentarios

El panel puede traer los comentarios nuevos de tus publicaciones de Instagram, Facebook y
YouTube, y —en las entregas siguientes— proponerte una respuesta que apruebas de un
toque. El descubrimiento viaja en la misma corrida que publica, cada cinco minutos, y
mira tus publicaciones de los últimos siete días.

Para que funcione hay que **reconectar una vez cada red**, porque el permiso se concede
en el consentimiento: entra a **Cuentas** y pulsa *Reconectar* en cada tarjeta de
Instagram, Facebook y YouTube. Mientras no lo hagas, esa red simplemente no trae
comentarios; nada más se rompe.

Los permisos que se agregan son `instagram_manage_comments`, `pages_manage_engagement` y,
en YouTube, `youtube.force-ssl` en vez de `youtube.readonly`. Ninguno necesita trámite
mientras la app de Meta siga en modo desarrollo y el proyecto de Google en pruebas, con
tus propias cuentas.
```

- [x] **Step 3: Verificación final y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde.

Marca `[x]` cada step cumplido en este plan.

```bash
git add "src/app/api/social/[network]/connect/route.ts" README.md docs/superpowers/plans/2026-09-11-comentarios-1-cola-y-sondeo.md
git commit -m "Pide los permisos de comentarios y explica qué reconectar"
```

**Tras fusionar, el controlador hace dos cosas con el dueño**: `npm run db:push` para
crear la tabla (es nueva y vacía, así que el push es seguro en cualquier orden), y
recordarle reconectar las tres redes. El PR apunta a `contenido-presentacion`.
