# Comentarios, entrega 3: aprobar — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development
> (recomendada) o superpowers:executing-plans para implementar tarea por tarea. Los pasos
> usan casillas (`- [x]`) para marcar avance.

**Meta:** que el dueño vea en el panel cada comentario nuevo con su borrador, lo corrija si
quiere, y lo mande o lo descarte de un toque. Y que escriba y cambie las instrucciones que
sigue el modelo.

**Arquitectura:** una página nueva del panel, `/admin/comments`, que lee la cola desde
`post_comments` y la muestra agrupada por publicación. Tres acciones del servidor: responder,
descartar y reintentar el borrador. Un módulo `responder.ts` que hace el envío de verdad:
relee la fila, exige credencial, llama al comentarista de la red y guarda el resultado con
frases fijas. Un módulo `privado.ts` con el mensaje directo escrito y apagado tras la bandera
`COMENTARIOS_DM`. Lo puro se prueba; el envío no, como el resto de la casa.

**Stack:** Next.js 16 App Router, React 19, Tailwind v4, Drizzle sobre Neon, Vitest, Graph
API de Meta, YouTube Data API.

**Spec:** `docs/superpowers/specs/2026-09-11-comentarios-design.md`, secciones 5, 6 y 7, y la
fila «3 · Aprobar» de la tabla de entregas.

## Restricciones globales

- **Nada sale publicado sin que el dueño lo vea.** El único camino hacia la red es la acción
  `responderComentario`, que se dispara desde un botón.
- **El estado vive en la fila.** Antes de mandar se relee la fila y, si ya no está en
  `pendiente` ni en `fallido`, no se hace nada: dos toques o dos pestañas no mandan dos veces.
- Frases fijas en español en todo lo visible; el detalle de la red solo a `console.error`
  truncado a 300 (`String(error).slice(0, 300)`). Las frases nuevas son las de la sección 6
  del spec:
  - `No se pudo redactar la respuesta.` (ya existe como `SIN_BORRADOR`)
  - `La red no aceptó la respuesta. Inténtalo de nuevo.` (ya existe como `RED_RECHAZO`)
  - `Esa cuenta ya no está conectada.` (ya existe como `SIN_CREDENCIAL`)
  - `El comentario ya no está en la red.` (ya existe como `COMENTARIO_AUSENTE`)
  - `Escribe una respuesta.` (nueva)
- **El privado nace apagado.** `COMENTARIOS_DM` ausente o distinta de `1` significa que no se
  manda nada, y la cola no muestra su estado.
- La página sigue el sistema visual del panel: `Panel`, `Field`, `Textarea`, `Button`,
  `Submit` y `GroupLabel` de `src/components/ui.tsx` y `src/components/charts/panel.tsx`;
  tokens de `globals.css`; ningún color crudo de Tailwind. Estado pendiente en todo botón que
  envíe.
- Comentarios de código solo para restricciones que el código no puede mostrar, en el tono de
  los vecinos. Commits en español, en presente, terminando con:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash,
  `git add` por archivo.
- Verificación por tarea: `npx vitest run <archivo>`; al cerrar: `npm test && npm run
  typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la
  ejecución**: las dos columnas nuevas las aplica el controlador al desplegar.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | `post_comments` gana `dm_state` y `dm_error`; `DM_STATES` |
| `src/lib/social/comentarios/validar.ts` | puro: la respuesta que el dueño manda cabe y no está vacía |
| `src/lib/social/comentarios/privado.ts` | el mensaje directo: `tocaPrivado` puro, `mandarPrivado` contra Graph |
| `src/lib/social/comentarios/responder.ts` | el envío: relee, exige credencial, llama a la red, guarda |
| `src/lib/social/comentarios/redaccion.ts` | gana `redactarUno(id)` para el botón de reintentar |
| `src/lib/comentarios-cola.ts` | la consulta de la cola para el panel, y el agrupado puro |
| `src/app/admin/actions.ts` | cuatro acciones del servidor, envoltorios finos |
| `src/app/admin/(dash)/comments/page.tsx` | la página: cabecera, contador, filtros, instrucciones, cola |
| `src/app/admin/(dash)/comments/cola.tsx` | cliente: las tarjetas con sus tres botones |
| `src/app/admin/(dash)/comments/instrucciones.tsx` | cliente: el campo de instrucciones con su Guardar |
| `src/app/admin/(dash)/nav.tsx` | la pestaña «Comentarios» |
| `README.md`, `.env.example` | el instructivo y la bandera |

---

### Task 1: El esquema y la validación

**Archivos:**
- Modificar: `src/db/schema.ts`
- Crear: `src/lib/social/comentarios/validar.ts`
- Test: `src/lib/social/comentarios/validar.test.ts`

**Interfaces:**
- Produce: `DM_STATES`, `DmState`, las columnas `dmState` y `dmError` en `postComments`;
  `ESCRIBE_RESPUESTA`, `validarRespuesta(texto: string, limite: number): { texto: string } | { error: string }`.

- [x] **Paso 1: Las columnas**

En `src/db/schema.ts`, junto a `COMMENT_STATES`:

```ts
/** El privado de la sección 7 del diseño: `no` hasta que la bandera lo encienda. */
export const DM_STATES = ['no', 'pendiente', 'enviado', 'fallido'] as const
export type DmState = (typeof DM_STATES)[number]
```

Y en la tabla `postComments`, después de `error`:

```ts
    dmState: text('dm_state').$type<DmState>().notNull().default('no'),
    dmError: text('dm_error'),
```

Son columnas nuevas en una tabla existente: `db:push` las agrega con `ALTER TABLE` y el
`default('no')` llena las filas que ya hay. No hay unique compuesta nueva, así que no hay
orden de columnas que cuidar.

- [x] **Paso 2: El test que falla**

`src/lib/social/comentarios/validar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ESCRIBE_RESPUESTA, validarRespuesta } from './validar'

describe('validarRespuesta', () => {
  it('rechaza el texto vacío o solo espacios con la frase fija', () => {
    expect(validarRespuesta('', 100)).toEqual({ error: ESCRIBE_RESPUESTA })
    expect(validarRespuesta('   \n ', 100)).toEqual({ error: ESCRIBE_RESPUESTA })
  })

  it('recorta los bordes y devuelve el texto', () => {
    expect(validarRespuesta('  ¡Gracias!  ', 100)).toEqual({ texto: '¡Gracias!' })
  })

  it('rechaza lo que pasa del límite de la red, contando puntos de código', () => {
    const r = validarRespuesta('🙂🙂🙂', 2)
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toContain('2')
  })

  it('acepta justo el límite', () => {
    expect(validarRespuesta('🙂🙂', 2)).toEqual({ texto: '🙂🙂' })
  })
})
```

- [x] **Paso 3: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/comentarios/validar.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 4: El módulo**

`src/lib/social/comentarios/validar.ts`, puro:

```ts
export const ESCRIBE_RESPUESTA = 'Escribe una respuesta.'

/**
 * Lo que el dueño escribió a mano no se recorta en silencio como un borrador: si se pasa
 * del límite de la red, se le dice cuánto, porque la red lo rechazaría igual.
 */
export function validarRespuesta(
  texto: string,
  limite: number,
): { texto: string } | { error: string } {
  const limpio = texto.trim()
  if (limpio.length === 0) return { error: ESCRIBE_RESPUESTA }
  if ([...limpio].length > limite) {
    return { error: `La respuesta no puede pasar de ${limite} caracteres.` }
  }
  return { texto: limpio }
}
```

- [x] **Paso 5: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/comentarios/validar.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 6: Commit**

```bash
git add src/db/schema.ts src/lib/social/comentarios/validar.ts src/lib/social/comentarios/validar.test.ts
git commit
```

Mensaje: `Prepara el privado en la tabla y valida lo que el dueño responde`

---

### Task 2: El privado, escrito y apagado

**Archivos:**
- Crear: `src/lib/social/comentarios/privado.ts`
- Test: `src/lib/social/comentarios/privado.test.ts`
- Modificar: `src/lib/social/comentarios/instrucciones.ts`

**Interfaces:**
- Consume: `env` de `@/lib/env`, `pedirGraph` de `./graph`.
- Produce: `DIAS_PRIVADO`, `privadoActivo(): boolean`, `tocaPrivado(network, publishedAt,
  now, activo): boolean`, `mandarPrivado(account, token, comentarioExternalId, texto):
  Promise<string>`, `CLAVE_TEXTO_PRIVADO`, `TEXTO_PRIVADO_POR_DEFECTO`.

- [x] **Paso 1: El test que falla**

`src/lib/social/comentarios/privado.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DIAS_PRIVADO, tocaPrivado } from './privado'

const AHORA = new Date('2026-09-14T12:00:00.000Z')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 864e5)

describe('tocaPrivado', () => {
  it('nunca con la bandera apagada', () => {
    expect(tocaPrivado('instagram', hace(1), AHORA, false)).toBe(false)
  })

  it('solo en Instagram y Facebook', () => {
    expect(tocaPrivado('instagram', hace(1), AHORA, true)).toBe(true)
    expect(tocaPrivado('facebook', hace(1), AHORA, true)).toBe(true)
    expect(tocaPrivado('youtube', hace(1), AHORA, true)).toBe(false)
  })

  it('solo dentro de la ventana de Meta', () => {
    expect(tocaPrivado('instagram', hace(DIAS_PRIVADO - 1), AHORA, true)).toBe(true)
    expect(tocaPrivado('instagram', hace(DIAS_PRIVADO + 1), AHORA, true)).toBe(false)
  })
})
```

- [x] **Paso 2: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/comentarios/privado.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 3: El texto del privado**

En `src/lib/social/comentarios/instrucciones.ts`, junto a las instrucciones:

```ts
export const CLAVE_TEXTO_PRIVADO = 'comentarios_privado_texto'

/** Lo que se le manda por privado a quien comentó. Editable en el panel el día que la bandera se encienda. */
export const TEXTO_PRIVADO_POR_DEFECTO =
  'Gracias por comentar. Si quieres conversar, escríbeme por acá.'
```

- [x] **Paso 4: El módulo**

`src/lib/social/comentarios/privado.ts`. Lee `./graph.ts` primero: `pedirGraph` es un GET.
Acá hace falta un POST, así que se hace con `fetch` directo, con el mismo molde de error que
`responder` en `instagram.ts`.

```ts
import { env } from '@/lib/env'
import type { SocialAccount } from '@/db'

const GRAPH = 'https://graph.facebook.com/v23.0'

/** Meta acepta un solo privado a quien comentó, dentro de este plazo desde el comentario. */
export const DIAS_PRIVADO = 7

const REDES_CON_PRIVADO = new Set(['instagram', 'facebook'])

/**
 * Apagado salvo que la bandera diga `1`. Exige `pages_messaging` con acceso avanzado, que
 * pasa por revisión de Meta; hasta entonces, encenderla solo produce fallos con frase fija.
 */
export function privadoActivo(): boolean {
  return env('COMENTARIOS_DM') === '1'
}

export function tocaPrivado(
  network: string,
  publishedAt: Date,
  now: Date,
  activo: boolean,
): boolean {
  if (!activo) return false
  if (!REDES_CON_PRIVADO.has(network)) return false
  return now.getTime() - publishedAt.getTime() < DIAS_PRIVADO * 864e5
}

/**
 * `POST /{page-id}/messages` con `recipient.comment_id`: el mismo endpoint para la página de
 * Facebook y para la cuenta de Instagram, cada una con su id externo y su token.
 */
export async function mandarPrivado(
  account: SocialAccount,
  token: string,
  comentarioExternalId: string,
  texto: string,
): Promise<string> {
  const response = await fetch(`${GRAPH}/${account.externalId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: comentarioExternalId },
      message: { text: texto },
      access_token: token,
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Meta ${response.status}: ${body.slice(0, 200)}`)
  }
  const body = (await response.json()) as { message_id?: string }
  if (!body.message_id) throw new Error('Meta no devolvió el id del mensaje')
  return body.message_id
}
```

- [x] **Paso 5: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/comentarios/privado.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 6: Commit**

```bash
git add src/lib/social/comentarios/privado.ts src/lib/social/comentarios/privado.test.ts src/lib/social/comentarios/instrucciones.ts
git commit
```

Mensaje: `Deja escrito y apagado el mensaje privado a quien comenta`

---

### Task 3: El envío y el reintento del borrador

**Archivos:**
- Crear: `src/lib/social/comentarios/responder.ts`
- Modificar: `src/lib/social/comentarios/redaccion.ts`

**Interfaces:**
- Consume: `validarRespuesta` de `./validar`; `tocaPrivado`, `privadoActivo`,
  `mandarPrivado` de `./privado`; `CLAVE_TEXTO_PRIVADO`, `TEXTO_PRIVADO_POR_DEFECTO`,
  `CLAVE_INSTRUCCIONES`, `normalizarInstrucciones` de `./instrucciones`; `comentaristaFor`
  de `./index`; `connectorFor` de `../index`; `SIN_CREDENCIAL`, `RED_RECHAZO`,
  `COMENTARIO_AUSENTE` de `./comentarista`; `leerAjuste` de `@/lib/ajustes`.
- Produce: `responderComentario(id: string, texto: string): Promise<{ ok: true } | { error: string }>`,
  `descartarComentario(id: string): Promise<void>`,
  `redactarUno(id: string): Promise<{ ok: true } | { error: string }>`.

- [x] **Paso 1: El envío**

`src/lib/social/comentarios/responder.ts`:

```ts
import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb, postComments, socialAccounts } from '@/db'
import { leerAjuste } from '@/lib/ajustes'
import { connectorFor } from '../index'
import { COMENTARIO_AUSENTE, RED_RECHAZO, SIN_CREDENCIAL } from './comentarista'
import { comentaristaFor } from './index'
import { CLAVE_TEXTO_PRIVADO, TEXTO_PRIVADO_POR_DEFECTO } from './instrucciones'
import { mandarPrivado, privadoActivo, tocaPrivado } from './privado'
import { validarRespuesta } from './validar'

type Resultado = { ok: true } | { error: string }

/**
 * Manda la respuesta de un comentario. Relee la fila antes de nada: dos toques, o el panel
 * y el teléfono a la vez, tienen que dar un solo envío. Solo `pendiente` y `fallido` salen.
 */
export async function responderComentario(id: string, texto: string): Promise<Resultado> {
  const db = getDb()
  const [fila] = await db.select().from(postComments).where(eq(postComments.id, id)).limit(1)
  if (!fila) return { error: COMENTARIO_AUSENTE }
  // Ya salió, o ya se descartó, o es del propio dueño: no hay nada que mandar y no es un
  // error, es la segunda tecla de un mismo toque.
  if (fila.state !== 'pendiente' && fila.state !== 'fallido') return { ok: true }

  const comentarista = comentaristaFor(fila.network)
  if (!comentarista) return { error: RED_RECHAZO }

  const validado = validarRespuesta(texto, comentarista.limiteTexto)
  if ('error' in validado) return validado

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, fila.accountId))
    .limit(1)
  const ensure = comentarista.ensureCredential ?? connectorFor(fila.network)?.ensureCredential
  const token = account && ensure ? await ensure(account) : null
  if (!account || !token) {
    await marcar(id, 'fallido', SIN_CREDENCIAL)
    return { error: SIN_CREDENCIAL }
  }

  let replyId: string
  try {
    replyId = await comentarista.responder(account, token, fila.externalId, validado.texto)
  } catch (error) {
    console.error(`[comentarios] responder ${fila.network}:`, String(error).slice(0, 300))
    // Un comentario que su autor borró no va a aparecer por reintentar: se descarta con su
    // frase, en vez de quedar en `fallido` invitando a un botón que nunca va a funcionar.
    if (error instanceof Error && error.message === COMENTARIO_AUSENTE) {
      await marcar(id, 'descartado', COMENTARIO_AUSENTE)
      return { error: COMENTARIO_AUSENTE }
    }
    await marcar(id, 'fallido', RED_RECHAZO)
    return { error: RED_RECHAZO }
  }

  // Se guarda lo que salió de verdad, editado o no: es lo que la cola muestra en «enviados».
  await db
    .update(postComments)
    .set({
      state: 'enviado',
      replyExternalId: replyId,
      draft: validado.texto,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(postComments.id, id))

  await privadoSiToca(fila, account, token)
  return { ok: true }
}

/** Descartar es una decisión: la fila se queda para que el sondeo no la vuelva a traer. */
export async function descartarComentario(id: string): Promise<void> {
  const db = getDb()
  const [fila] = await db.select().from(postComments).where(eq(postComments.id, id)).limit(1)
  if (!fila || (fila.state !== 'pendiente' && fila.state !== 'fallido')) return
  await marcar(id, 'descartado', null)
}

async function marcar(id: string, state: 'fallido' | 'descartado', error: string | null) {
  await getDb()
    .update(postComments)
    .set({ state, error, updatedAt: new Date() })
    .where(eq(postComments.id, id))
}

/**
 * La sección 7 del diseño, tras la bandera. Su fallo nunca deshace la respuesta que ya
 * salió: se anota en la fila y se sigue.
 */
async function privadoSiToca(
  fila: typeof postComments.$inferSelect,
  account: typeof socialAccounts.$inferSelect,
  token: string,
) {
  if (!tocaPrivado(fila.network, fila.publishedAt, new Date(), privadoActivo())) return
  const db = getDb()
  const texto = (await leerAjuste(CLAVE_TEXTO_PRIVADO))?.trim() || TEXTO_PRIVADO_POR_DEFECTO
  try {
    await mandarPrivado(account, token, fila.externalId, texto)
    await db
      .update(postComments)
      .set({ dmState: 'enviado', dmError: null, updatedAt: new Date() })
      .where(eq(postComments.id, fila.id))
  } catch (error) {
    console.error(`[comentarios] privado ${fila.network}:`, String(error).slice(0, 300))
    await db
      .update(postComments)
      .set({ dmState: 'fallido', dmError: RED_RECHAZO, updatedAt: new Date() })
      .where(eq(postComments.id, fila.id))
  }
}
```

- [x] **Paso 2: El reintento del borrador**

En `src/lib/social/comentarios/redaccion.ts`, la parte del modelo (pedir, limpiar,
rechazar vacío) vive hoy dentro del `try` interno del bucle de `redactarPendientes`.
Extráela a dos funciones internas sin cambiar lo que hace. El caption sigue leyéndose
donde se lee hoy, fuera del `try` interno: un tropiezo de la base en esa consulta no es un
fallo del modelo y no debe marcar la fila.

```ts
/** El caption de la publicación comentada, o null si la sincronización todavía no la trajo. */
async function captionDe(accountId: string, postExternalId: string): Promise<string | null> {
  const [post] = await getDb()
    .select({ caption: socialPosts.caption })
    .from(socialPosts)
    .where(and(eq(socialPosts.accountId, accountId), eq(socialPosts.externalId, postExternalId)))
    .limit(1)
  return post?.caption ?? null
}

/**
 * Solo la parte del modelo. Lanza si falla o devuelve vacío; quien llama decide qué
 * marcar, porque la fase y el botón marcan distinto.
 */
async function redactarFila(
  fila: { text: string; author: string | null },
  caption: string | null,
  instrucciones: string,
  limite: number,
): Promise<string> {
  const crudo = await pedirBorrador({ instrucciones, caption, comentario: fila.text, autor: fila.author })
  const borrador = limpiarBorrador(crudo, limite)
  // Un borrador vacío no sirve de nada en la cola: cuenta como fallo, y el dueño
  // reintenta o escribe a mano.
  if (borrador.length === 0) throw new Error('el modelo devolvió una respuesta vacía')
  return borrador
}
```

En el bucle, la consulta del caption pasa a ser `const caption = await
captionDe(fila.accountId, fila.postExternalId)` (mismo sitio, dentro del `try` externo), y
el `try` interno queda como `borrador = await redactarFila(fila, caption, instrucciones,
comentarista.limiteTexto)`. El `catch` interno, el contador de seguidos, el
cortacircuitos y la marca diferida no cambian en nada.

Y agrega, exportado:

```ts
/**
 * El botón «Reintentar borrador» de la cola. A diferencia de la fase, acá el dueño está
 * mirando: se marca de inmediato, en cualquier dirección.
 */
export async function redactarUno(id: string): Promise<{ ok: true } | { error: string }> {
  const db = getDb()
  const [fila] = await db.select().from(postComments).where(eq(postComments.id, id)).limit(1)
  if (!fila || (fila.state !== 'pendiente' && fila.state !== 'fallido')) return { ok: true }
  const comentarista = comentaristaFor(fila.network)
  if (!comentarista) return { error: SIN_BORRADOR }
  if (!hayPasarela()) return { error: SIN_BORRADOR }
  const instrucciones = normalizarInstrucciones(await leerAjuste(CLAVE_INSTRUCCIONES))
  const caption = await captionDe(fila.accountId, fila.postExternalId)
  try {
    const borrador = await redactarFila(fila, caption, instrucciones, comentarista.limiteTexto)
    await db
      .update(postComments)
      .set({ draft: borrador, draftError: null, updatedAt: new Date() })
      .where(eq(postComments.id, id))
    return { ok: true }
  } catch (error) {
    console.error(`[comentarios] reintento ${fila.network}:`, String(error).slice(0, 300))
    await db
      .update(postComments)
      .set({ draftError: SIN_BORRADOR, updatedAt: new Date() })
      .where(eq(postComments.id, id))
    return { error: SIN_BORRADOR }
  }
}
```

Ajusta los imports que hagan falta (`postComments`, `SIN_BORRADOR`, `hayPasarela` ya se
importan en ese archivo o en `./modelo`).

- [x] **Paso 3: Verificar**

`npm test` (el suite completo: la fase de redacción no tiene test propio, pero los tests
de `ventana`, `prompt` e `instrucciones` tienen que seguir verdes), `npm run typecheck`,
`npm run lint`.

- [x] **Paso 4: Commit**

```bash
git add src/lib/social/comentarios/responder.ts src/lib/social/comentarios/redaccion.ts
git commit
```

Mensaje: `Manda la respuesta de un comentario y reintenta su borrador a pedido`

---

### Task 4: La consulta de la cola y el agrupado

**Archivos:**
- Crear: `src/lib/comentarios-cola.ts`
- Crear: `src/lib/social/comentarios/agrupar.ts`
- Test: `src/lib/social/comentarios/agrupar.test.ts`

**Interfaces:**
- Produce: el tipo `ComentarioFila`, `ESTADOS_COLA`, `getCola(filtro: { estado: EstadoCola;
  red: string | null }): Promise<ComentarioFila[]>`, `contarPendientes(): Promise<number>`;
  `agruparPorPublicacion(filas: ComentarioFila[]): Grupo[]`.

- [x] **Paso 1: El test que falla**

`src/lib/social/comentarios/agrupar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { agruparPorPublicacion } from './agrupar'

const fila = (id: string, post: string, minuto: number) => ({
  id,
  postExternalId: post,
  publishedAt: new Date(Date.UTC(2026, 8, 14, 12, minuto)),
})

describe('agruparPorPublicacion', () => {
  it('junta los comentarios de una misma publicación', () => {
    const grupos = agruparPorPublicacion([fila('a', 'p1', 1), fila('b', 'p2', 2), fila('c', 'p1', 3)])
    expect(grupos.map((g) => g.postExternalId)).toEqual(['p1', 'p2'])
    expect(grupos[0].comentarios.map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('ordena los grupos por su comentario más nuevo, primero el más reciente', () => {
    const grupos = agruparPorPublicacion([fila('a', 'p1', 1), fila('b', 'p2', 9), fila('c', 'p1', 3)])
    expect(grupos.map((g) => g.postExternalId)).toEqual(['p2', 'p1'])
  })

  it('devuelve vacío con nada', () => {
    expect(agruparPorPublicacion([])).toEqual([])
  })
})
```

- [x] **Paso 2: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/comentarios/agrupar.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 3: El agrupado**

`src/lib/social/comentarios/agrupar.ts`, puro y genérico sobre lo mínimo que necesita:

```ts
type Agrupable = { id: string; postExternalId: string; publishedAt: Date }

export type Grupo<T extends Agrupable> = { postExternalId: string; comentarios: T[] }

/**
 * La cola se lee por publicación: es más fácil responder tres comentarios del mismo video
 * seguidos que saltar entre videos. Dentro del grupo y entre grupos, lo más nuevo primero.
 */
export function agruparPorPublicacion<T extends Agrupable>(filas: T[]): Grupo<T>[] {
  const porPost = new Map<string, T[]>()
  for (const f of filas) {
    const lista = porPost.get(f.postExternalId) ?? []
    lista.push(f)
    porPost.set(f.postExternalId, lista)
  }
  const grupos = [...porPost.entries()].map(([postExternalId, comentarios]) => ({
    postExternalId,
    comentarios: [...comentarios].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
  }))
  return grupos.sort(
    (a, b) => b.comentarios[0].publishedAt.getTime() - a.comentarios[0].publishedAt.getTime(),
  )
}
```

- [x] **Paso 4: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/comentarios/agrupar.test.ts`
Esperado: pasa.

- [x] **Paso 5: La consulta**

`src/lib/comentarios-cola.ts`. Mira `src/lib/posts.ts` para copiar la forma en que el panel
consulta (`getCuentas` es el vecino directo).

```ts
import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, postComments, socialAccounts, socialPosts } from '@/db'
import type { CommentState, DmState } from '@/db/schema'

export const ESTADOS_COLA = ['pendientes', 'enviados', 'descartados', 'todos'] as const
export type EstadoCola = (typeof ESTADOS_COLA)[number]

/** Lo pendiente incluye lo fallido: las dos cosas esperan un toque del dueño. */
const POR_ESTADO: Record<EstadoCola, CommentState[]> = {
  pendientes: ['pendiente', 'fallido'],
  enviados: ['enviado'],
  descartados: ['descartado'],
  todos: ['pendiente', 'fallido', 'enviado', 'descartado'],
}

/** Tope de la cola en pantalla: más que esto no se revisa de una sentada. */
const MAX_FILAS = 200

export type ComentarioFila = {
  id: string
  network: string
  accountHandle: string | null
  author: string | null
  text: string
  publishedAt: Date
  draft: string | null
  draftError: string | null
  state: CommentState
  error: string | null
  replyExternalId: string | null
  dmState: DmState
  dmError: string | null
  postExternalId: string
  postCaption: string | null
  postThumbnailUrl: string | null
  postPermalink: string | null
}

export async function getCola(filtro: { estado: EstadoCola; red: string | null }): Promise<ComentarioFila[]> {
  const condiciones = [inArray(postComments.state, POR_ESTADO[filtro.estado])]
  if (filtro.red) condiciones.push(eq(postComments.network, filtro.red))
  const filas = await getDb()
    .select({
      id: postComments.id,
      network: postComments.network,
      accountHandle: socialAccounts.handle,
      author: postComments.author,
      text: postComments.text,
      publishedAt: postComments.publishedAt,
      draft: postComments.draft,
      draftError: postComments.draftError,
      state: postComments.state,
      error: postComments.error,
      replyExternalId: postComments.replyExternalId,
      dmState: postComments.dmState,
      dmError: postComments.dmError,
      postExternalId: postComments.postExternalId,
      postCaption: socialPosts.caption,
      postThumbnailUrl: socialPosts.thumbnailUrl,
      postPermalink: socialPosts.permalink,
    })
    .from(postComments)
    .leftJoin(socialAccounts, eq(socialAccounts.id, postComments.accountId))
    .leftJoin(
      socialPosts,
      and(eq(socialPosts.accountId, postComments.accountId), eq(socialPosts.externalId, postComments.postExternalId)),
    )
    .where(and(...condiciones))
    .orderBy(desc(postComments.publishedAt))
    .limit(MAX_FILAS)
  return filas
}

export async function contarPendientes(): Promise<number> {
  const filas = await getDb()
    .select({ id: postComments.id })
    .from(postComments)
    .where(inArray(postComments.state, POR_ESTADO.pendientes))
  return filas.length
}
```

Si `count()` de drizzle te queda más natural que traer los ids, úsalo; lo que importa es
el número.

- [x] **Paso 6: Verificar y commit**

`npm test`, `npm run typecheck`, `npm run lint`.

```bash
git add src/lib/comentarios-cola.ts src/lib/social/comentarios/agrupar.ts src/lib/social/comentarios/agrupar.test.ts
git commit
```

Mensaje: `Lee la cola de comentarios para el panel, agrupada por publicación`

---

### Task 5: Las acciones y la página

**Archivos:**
- Modificar: `src/app/admin/actions.ts`
- Crear: `src/app/admin/(dash)/comments/page.tsx`
- Crear: `src/app/admin/(dash)/comments/cola.tsx`
- Crear: `src/app/admin/(dash)/comments/instrucciones.tsx`
- Modificar: `src/app/admin/(dash)/nav.tsx`

**Interfaces:**
- Consume: todo lo de las tareas 3 y 4; `FormState` de `actions.ts`; `Panel`, `Empty` de
  `@/components/charts/panel`; `Field`, `Textarea`, `Button`, `Submit`, `GroupLabel` de
  `@/components/ui`; `networkLabel` de `@/lib/networks`; `CLAVE_INSTRUCCIONES`,
  `normalizarInstrucciones`, `TOPE_INSTRUCCIONES`, `INSTRUCCIONES_POR_DEFECTO` de
  `@/lib/social/comentarios/instrucciones`; `leerAjuste`, `guardarAjuste` de `@/lib/ajustes`.

- [x] **Paso 1: Las acciones**

En `src/app/admin/actions.ts`, al final, con el mismo molde que `syncSocialNow` (auth,
import diferido para no cargar el peso de las redes en cada acción, frase fija, revalidate):

```ts
export async function responderComentario(id: string, texto: string): Promise<FormState> {
  await requireAuth()
  const { responderComentario: responder } = await import('@/lib/social/comentarios/responder')
  const resultado = await responder(id, texto)
  revalidatePath('/admin/comments')
  return 'error' in resultado ? { error: resultado.error } : { ok: true }
}

export async function descartarComentario(id: string): Promise<FormState> {
  await requireAuth()
  const { descartarComentario: descartar } = await import('@/lib/social/comentarios/responder')
  await descartar(id)
  revalidatePath('/admin/comments')
  return { ok: true }
}

export async function reintentarBorrador(id: string): Promise<FormState> {
  await requireAuth()
  const { redactarUno } = await import('@/lib/social/comentarios/redaccion')
  const resultado = await redactarUno(id)
  revalidatePath('/admin/comments')
  return 'error' in resultado ? { error: resultado.error } : { ok: true }
}

export async function guardarInstruccionesComentarios(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAuth()
  const { CLAVE_INSTRUCCIONES, normalizarInstrucciones } = await import(
    '@/lib/social/comentarios/instrucciones'
  )
  const { guardarAjuste } = await import('@/lib/ajustes')
  const bruto = String(formData.get('instrucciones') ?? '')
  await guardarAjuste(CLAVE_INSTRUCCIONES, normalizarInstrucciones(bruto))
  revalidatePath('/admin/comments')
  return { ok: true }
}
```

- [x] **Paso 2: La pestaña**

En `src/app/admin/(dash)/nav.tsx`, en `TABS`, después de Contenido:

```ts
  { href: '/admin/comments', label: 'Comentarios' },
```

- [x] **Paso 3: El campo de instrucciones**

`src/app/admin/(dash)/comments/instrucciones.tsx`, cliente. Molde: cómo `login-form.tsx`
usa `useActionState` + `Submit`.

```tsx
'use client'

import { useActionState } from 'react'
import { guardarInstruccionesComentarios, type FormState } from '@/app/admin/actions'
import { Field, Submit, Textarea } from '@/components/ui'

const INICIAL: FormState = {}

export function Instrucciones({ valor, tope }: { valor: string; tope: number }) {
  const [state, action] = useActionState(guardarInstruccionesComentarios, INICIAL)
  return (
    <form action={action} className="space-y-3">
      <Field label="Cómo responde el modelo">
        <Textarea
          name="instrucciones"
          defaultValue={valor}
          rows={5}
          maxLength={tope}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Submit pendingLabel="Guardando…">Guardar</Submit>
        {state.ok ? <span role="status" className="text-sm text-positive">Guardado.</span> : null}
        {state.error ? <span role="alert" className="text-sm text-negative">{state.error}</span> : null}
      </div>
    </form>
  )
}
```

`Field` envuelve a su hijo en un `<label>`: no lleva `htmlFor` ni el textarea lleva `id`.

- [x] **Paso 4: La cola**

`src/app/admin/(dash)/comments/cola.tsx`, cliente. Una tarjeta por comentario, agrupadas por
publicación con la miniatura y el texto de la publicación como cabecera del grupo. Cada
tarjeta decide sola por su `state`: `pendiente` y `fallido` son editables (quién, cuándo
en relativo, el comentario, el borrador en un `Textarea`, o la frase `draftError` si no hay
borrador, y los botones **Enviar** con `variant="primary"`, **Descartar** con `ghost` y
**Reintentar borrador** cuando no hay borrador); `enviado` y `descartado` son de solo
lectura y muestran lo que salió. Estado pendiente por tarjeta con `useTransition`; el
resultado `ok` hace que la tarjeta se vaya con el `revalidatePath`, y `error` sale en
rojo bajo los botones. La línea del privado solo aparece con `mostrarPrivado`, que la
página calcula con la bandera (sección 7 del diseño).

```tsx
'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { descartarComentario, reintentarBorrador, responderComentario } from '@/app/admin/actions'
import { Empty } from '@/components/charts/panel'
import { Button, Textarea } from '@/components/ui'
import type { ComentarioFila } from '@/lib/comentarios-cola'
import { agruparPorPublicacion } from '@/lib/social/comentarios/agrupar'
import { networkLabel } from '@/lib/networks'

const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function hace(fecha: Date): string {
  const horas = Math.round((Date.now() - fecha.getTime()) / 3.6e6)
  if (horas < 1) return 'recién'
  if (horas < 24) return RELATIVE.format(-horas, 'hour')
  return RELATIVE.format(-Math.round(horas / 24), 'day')
}

export function Cola({ filas, mostrarPrivado }: { filas: ComentarioFila[]; mostrarPrivado: boolean }) {
  if (filas.length === 0) {
    return <Empty>No hay comentarios aquí. Los nuevos llegan cada cinco minutos.</Empty>
  }
  const grupos = agruparPorPublicacion(filas)
  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const primero = g.comentarios[0]
        return (
          <section key={g.postExternalId} className="space-y-3">
            <header className="flex items-start gap-3">
              {primero.postThumbnailUrl ? (
                <Image
                  src={primero.postThumbnailUrl}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
              ) : null}
              <div className="min-w-0">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-fg-faint">
                  {networkLabel(primero.network)}
                  {primero.accountHandle ? ` · ${primero.accountHandle}` : ''}
                </p>
                <p className="line-clamp-2 text-sm text-fg-muted">{primero.postCaption ?? '(sin texto)'}</p>
              </div>
            </header>
            {g.comentarios.map((c) => (
              <Tarjeta key={c.id} fila={c} mostrarPrivado={mostrarPrivado} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

function Tarjeta({ fila, mostrarPrivado }: { fila: ComentarioFila; mostrarPrivado: boolean }) {
  const editable = fila.state === 'pendiente' || fila.state === 'fallido'
  const [texto, setTexto] = useState(fila.draft ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function enviar() {
    setError(null)
    startTransition(async () => {
      const r = await responderComentario(fila.id, texto)
      if (r.error) setError(r.error)
    })
  }
  function descartar() {
    if (!confirm('¿Descartar este comentario? No se va a responder.')) return
    startTransition(async () => {
      await descartarComentario(fila.id)
    })
  }
  function reintentar() {
    setError(null)
    startTransition(async () => {
      const r = await reintentarBorrador(fila.id)
      if (r.error) setError(r.error)
    })
  }

  return (
    <article className="surface rounded-2xl p-4">
      <p className="text-[0.78rem] text-fg-faint">
        <span className="text-fg">{fila.author ?? 'Alguien'}</span> · {hace(fila.publishedAt)}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{fila.text}</p>
      {editable ? (
        <>
          {fila.draft === null && fila.draftError ? (
            <p className="mt-3 text-sm text-negative">{fila.draftError}</p>
          ) : null}
          <Textarea
            aria-label="Tu respuesta"
            className="mt-3"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={pending}
          />
          {fila.state === 'fallido' && fila.error ? (
            <p className="mt-2 text-sm text-negative">{fila.error}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={enviar} disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar'}
            </Button>
            <Button variant="ghost" onClick={descartar} disabled={pending}>Descartar</Button>
            {fila.draft === null ? (
              <Button variant="ghost" onClick={reintentar} disabled={pending}>Reintentar borrador</Button>
            ) : null}
            {error ? <span role="alert" className="text-sm text-negative">{error}</span> : null}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-1 text-sm">
          {fila.state === 'enviado' ? (
            <p className="text-fg-muted">
              <span className="text-positive">Respondido:</span> {fila.draft}
            </p>
          ) : (
            <p className="text-fg-faint">Descartado{fila.error ? ` · ${fila.error}` : ''}</p>
          )}
          {mostrarPrivado && fila.dmState !== 'no' ? (
            <p className="text-fg-faint">
              Privado: {fila.dmState}{fila.dmError ? ` · ${fila.dmError}` : ''}
            </p>
          ) : null}
        </div>
      )}
    </article>
  )
}
```

`Button` tiene `variant?: 'primary' | 'ghost' | 'danger'`. La miniatura va con `next/image`
y `unoptimized`, igual que en `schedule/calendar.tsx`: los CDN de Meta y YouTube ya están
en `remotePatterns` de `next.config`.

- [x] **Paso 5: La página**

`src/app/admin/(dash)/comments/page.tsx`, servidor. Molde: `accounts/page.tsx` y los
`href` helpers de `content/page.tsx` para los filtros en la URL.

```tsx
import Link from 'next/link'
import { Panel } from '@/components/charts/panel'
import { leerAjuste } from '@/lib/ajustes'
import { contarPendientes, ESTADOS_COLA, getCola, type EstadoCola } from '@/lib/comentarios-cola'
import {
  CLAVE_INSTRUCCIONES,
  INSTRUCCIONES_POR_DEFECTO,
  TOPE_INSTRUCCIONES,
} from '@/lib/social/comentarios/instrucciones'
import { privadoActivo } from '@/lib/social/comentarios/privado'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'
import { Cola } from './cola'
import { Instrucciones } from './instrucciones'

export const dynamic = 'force-dynamic'

const REDES = ['instagram', 'facebook', 'youtube'] as const
const ETIQUETA_ESTADO: Record<EstadoCola, string> = {
  pendientes: 'Pendientes',
  enviados: 'Enviados',
  descartados: 'Descartados',
  todos: 'Todos',
}

function href(estado: EstadoCola, red: string | null): string {
  const p = new URLSearchParams()
  if (estado !== 'pendientes') p.set('estado', estado)
  if (red) p.set('red', red)
  const q = p.toString()
  return q ? `/admin/comments?${q}` : '/admin/comments'
}

export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const estado = (ESTADOS_COLA as readonly string[]).includes(String(params.estado))
    ? (params.estado as EstadoCola)
    : 'pendientes'
  const red = (REDES as readonly string[]).includes(String(params.red)) ? String(params.red) : null

  const [filas, pendientes, instrucciones] = await Promise.all([
    getCola({ estado, red }),
    contarPendientes(),
    leerAjuste(CLAVE_INSTRUCCIONES),
  ])

  const chip = (activo: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-[0.72rem] transition-colors',
      activo ? 'bg-white/[0.12] text-fg' : 'bg-white/[0.04] text-fg-muted hover:text-fg',
    )

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Comentarios</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {pendientes === 0
            ? 'No hay nada esperando respuesta.'
            : pendientes === 1
              ? 'Un comentario espera tu respuesta.'
              : `${pendientes} comentarios esperan tu respuesta.`}
        </p>
      </header>

      <Panel
        title="Instrucciones para el modelo"
        hint="Se guardan en la base y rigen desde el siguiente borrador."
        className="mb-6"
      >
        <Instrucciones valor={instrucciones ?? INSTRUCCIONES_POR_DEFECTO} tope={TOPE_INSTRUCCIONES} />
      </Panel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ESTADOS_COLA.map((e) => (
          <Link key={e} href={href(e, red)} className={chip(e === estado)}>
            {ETIQUETA_ESTADO[e]}
          </Link>
        ))}
        <span className="mx-1 text-fg-faint">·</span>
        <Link href={href(estado, null)} className={chip(red === null)}>Todas</Link>
        {REDES.map((r) => (
          <Link key={r} href={href(estado, r)} className={chip(red === r)}>
            {networkLabel(r)}
          </Link>
        ))}
      </div>

      <Cola filas={filas} mostrarPrivado={privadoActivo()} />
    </>
  )
}
```

`privadoActivo` se importa de `@/lib/social/comentarios/privado`; la página es de servidor,
así que puede leer la bandera. En «todos» conviven filas enviadas y pendientes: cada
`Tarjeta` decide sola por su `state`, la página no lo decide por ella.

- [x] **Paso 6: Verificar**

`npm test`, `npm run typecheck`, `npm run lint` y `npx next build`. El build tiene que
listar `ƒ /admin/comments`.

- [x] **Paso 7: Commit**

```bash
git add src/app/admin/actions.ts "src/app/admin/(dash)/comments/page.tsx" "src/app/admin/(dash)/comments/cola.tsx" "src/app/admin/(dash)/comments/instrucciones.tsx" "src/app/admin/(dash)/nav.tsx"
git commit
```

Mensaje: `Muestra la cola de comentarios en el panel con sus tres acciones`

---

### Task 6: El instructivo

**Archivos:**
- Modificar: `README.md`
- Modificar: `.env.example`
- Modificar: este plan (marcar las casillas)

- [x] **Paso 1: La bandera**

En `.env.example`, junto a las otras de comentarios:

```
# Opcional. Con "1", tras responder un comentario de Instagram o Facebook se le manda un
# privado a quien comentó. Exige pages_messaging con acceso avanzado, que pasa por revisión
# de Meta. Apagada por defecto.
COMENTARIOS_DM=
```

- [x] **Paso 2: El README**

En la sección «Responder comentarios», después de lo que hay, agrega:

```markdown
La cola vive en **Comentarios**, en el panel. Cada comentario nuevo llega con el borrador que
escribió el modelo; lo corriges si quieres y lo mandas con **Enviar**, o lo descartas. Si el
modelo no pudo redactar, la tarjeta lo dice y tiene **Reintentar borrador**. Arriba está el
campo con las instrucciones que sigue el modelo: las editas ahí y rigen desde el siguiente
borrador.

Nada sale sin tu toque. Dos toques, o el panel y el teléfono a la vez, mandan una sola vez:
antes de enviar se relee el comentario y si ya salió no pasa nada.

El mensaje privado a quien comentó está escrito y **apagado**. Meta exige para eso
`pages_messaging` con acceso avanzado, que pasa por revisión de la app. El día que la
consigas, `COMENTARIOS_DM=1` en Vercel lo enciende para Instagram y Facebook, dentro de los
siete días que Meta permite. Hasta entonces la cola no muestra nada del privado.

Después de fusionar hay que correr `npm run db:push` otra vez: la tabla de comentarios gana
dos columnas para el estado del privado.
```

- [x] **Paso 3: Las casillas**

Marca `[x]` los pasos hechos.

- [x] **Paso 4: Verificar y commit**

`npm run lint`.

```bash
git add README.md .env.example docs/superpowers/plans/2026-09-14-comentarios-3-aprobar.md
git commit
```

Mensaje: `Explica la cola de comentarios y el privado apagado`

---

## Lo que esta entrega no hace

- **No llega al teléfono.** La pestaña Comentarios de la app es la entrega 4.
- **No manda privados.** El camino está escrito y la bandera nace apagada.
- **No cambia el modelo ni la redacción.** Solo agrega el reintento a pedido.
