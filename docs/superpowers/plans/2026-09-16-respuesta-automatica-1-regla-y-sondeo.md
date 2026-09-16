# Respuesta automática 1: la regla y el sondeo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un post programado lleve una palabra clave, un mensaje con enlace y una respuesta pública; que el sondeo de comentarios vea los posts recién publicados; y que cuando alguien comente la palabra, la corrida siguiente responda sola en público (con el mensaje y el enlace, porque el privado llega en la entrega 2) y la cola lo muestre como automático.

**Architecture:** Una tabla `reglas_clave` (una fila por post programado) y una marca `automatico` en `post_comments`. Todo lo que decide es puro en `comentarios/reglas.ts` (normalizar, coincidir, enlace medible, validar, `decidirAutomatica`); el orquestador `comentarios/automatico.ts` carga la entrada, ejecuta el plan con el `Comentarista` de la red y guarda. El sondeo une a `social_posts` los destinos publicados del calendario para cerrar el hueco del sync diario. El compositor, el editor, el lote y el CSV escriben la regla; la cola la muestra.

**Tech Stack:** Next.js App Router, Drizzle + Neon (`db:push`, sin archivos de migración), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-respuesta-automatica-design.md` (secciones 1 a 5, «Manejo de errores», «Testing», «Las entregas» punto 1). En esta entrega `decidirAutomatica` ya sabe de privado, pero el orquestador le pasa siempre `privadoEncendido: false`: la entrega 2 enciende ese camino.

Rama: `respuesta-automatica`, nacida de `main` con la spec ya commiteada (`cf33af5`).

## Global Constraints

- Frases fijas en español hacia la base y la UI; el detalle de la red solo a `console.error` truncado a 300.
- Palabra clave: una sola palabra, letras y dígitos, hasta 30 caracteres, guardada normalizada (minúsculas, sin tildes). Coincidencia por palabra completa, sin distinguir mayúsculas ni tildes.
- `mensaje` de 1 a 1000 caracteres; `respuesta_publica` de 1 a 300, por defecto `Te lo mandé por privado 📩`.
- Frases: `REGLA_PALABRA = 'La palabra clave es una sola palabra, sin espacios, hasta 30 letras.'`, `REGLA_MENSAJE = 'El mensaje del privado va de 1 a 1000 caracteres.'`, `REGLA_RESPUESTA = 'La respuesta pública va de 1 a 300 caracteres.'`.
- Un comentario respondido por regla queda `state = 'enviado'`, `automatico = true`, `draft` = texto enviado, `reply_external_id`. Un fallo de red → `state = 'fallido'`, `error = RED_RECHAZO`, `automatico = true`. Comentario borrado → `descartado` con `COMENTARIO_AUSENTE`.
- Los comentarios `propio` nunca disparan reglas. Un segundo comentario del mismo autor en el mismo post recibe solo la respuesta pública (`privado: null` en el plan).
- Sin privado posible (siempre en esta entrega): la respuesta pública es `enlaceMedible(mensaje)`.
- `MAX_AUTOMATICAS_POR_CORRIDA = 20`, compartido por todas las cuentas de la corrida; `aplicarReglas` respeta `seAcaboElTiempo`.
- El enlace se etiqueta con `?s=dm-<palabra>` solo si su host es el del sitio: `SITE_URL` o, si falta, `VERCEL_PROJECT_PRODUCTION_URL`; sin ninguna, no se etiqueta.
- La IA no redacta borrador para un comentario que coincide con una regla.
- Comentarios en el código solo para restricciones que el código no puede mostrar, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Disciplina git: HEAD verificado antes de empezar (`git log --oneline -1` debe mostrar `cf33af5` o un commit de este plan), jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. **Ningún `db:push` durante la ejecución**: la tabla es nueva y la columna nullable-con-default; el push lo hace el dueño antes de promover el deploy.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | tabla `reglas_clave`, columna `post_comments.automatico` |
| `src/lib/social/comentarios/reglas.ts` (+ test) | lo puro: normalizar, coincidir, enlace medible, validar, `decidirAutomatica` |
| `src/lib/social/comentarios/ventana.ts` (+ test) | `unirPosts`: sync más destinos publicados, sin repetir |
| `src/lib/social/comentarios/automatico.ts` | `reglasPara`, `aplicarReglas`, `hostDelSitio`: el orquestador |
| `src/lib/social/comentarios/run.ts` | el sondeo une posts y llama a `aplicarReglas` |
| `src/lib/social/comentarios/redaccion.ts` | caption cae al programado; salta los que coinciden con regla |
| `src/lib/social/publish/crear.ts` | inserta la regla con el post |
| `src/app/admin/actions.ts` | crear/actualizar la regla desde compositor y editor |
| `src/app/admin/(dash)/schedule/composer.tsx`, `regla-clave.tsx` | el bloque plegado |
| `src/app/admin/(dash)/schedule/[id]/page.tsx`, `editor.tsx` | los tres campos editables |
| `src/lib/social/publish/batch.ts`, `csv.ts`, `src/app/api/schedule/batch/route.ts` | `regla` por fila |
| `src/lib/comentarios-cola.ts`, `comments/page.tsx`, `comments/cola.tsx` | marca, filtro «Automáticas», palabra en cabecera |
| `public/docs/api-editor.md`, `README.md`, `.env.example` | `regla`, `SITE_URL`, cómo funciona |

---

### Task 1: La tabla, la marca y lo puro de la regla

**Files:**
- Modify: `src/db/schema.ts` (después de `scheduledPostMedia`; columna en `postComments`; tipo al final)
- Create: `src/lib/social/comentarios/reglas.ts`
- Test: `src/lib/social/comentarios/reglas.test.ts`

**Interfaces:**
- Produces, de `schema.ts`: `reglasClave` (tabla), `type ReglaClave`, `postComments.automatico` (boolean not null default false).
- Produces, de `reglas.ts`:
  - `RESPUESTA_PUBLICA_POR_DEFECTO`, `REGLA_PALABRA`, `REGLA_MENSAJE`, `REGLA_RESPUESTA`, `MAX_AUTOMATICAS_POR_CORRIDA = 20`, `MAX_PALABRA = 30`, `MAX_MENSAJE = 1000`, `MAX_RESPUESTA = 300`
  - `type ReglaLimpia = { palabra: string; mensaje: string; respuestaPublica: string }`
  - `normalizarPalabra(bruta: string): string | null`
  - `coincide(texto: string, palabra: string): boolean`
  - `enlaceMedible(mensaje: string, palabra: string, sitioHost: string | null): string`
  - `validarRegla(raw: unknown): { regla: ReglaLimpia | null } | { error: string }`
  - `type Plan = { accion: 'ignorar' } | { accion: 'responder'; publico: string; privado: string | null }`
  - `decidirAutomatica(entrada: { texto; esPropio; yaRecibioPrivado; network; publishedAt; now; privadoEncendido; regla; sitioHost }): Plan`

- [ ] **Step 1: Escribe el test que falla**

`src/lib/social/comentarios/reglas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  REGLA_MENSAJE,
  REGLA_PALABRA,
  REGLA_RESPUESTA,
  RESPUESTA_PUBLICA_POR_DEFECTO,
  coincide,
  decidirAutomatica,
  enlaceMedible,
  normalizarPalabra,
  validarRegla,
} from './reglas'

describe('normalizarPalabra', () => {
  it('minúsculas, sin tildes, sin espacios alrededor', () => {
    expect(normalizarPalabra('  GUÍA ')).toBe('guia')
    expect(normalizarPalabra('Guía2')).toBe('guia2')
  })

  it('rechaza vacío, espacios internos, símbolos y más de 30', () => {
    expect(normalizarPalabra('')).toBeNull()
    expect(normalizarPalabra('   ')).toBeNull()
    expect(normalizarPalabra('dos palabras')).toBeNull()
    expect(normalizarPalabra('#guia')).toBeNull()
    expect(normalizarPalabra('a'.repeat(31))).toBeNull()
    expect(normalizarPalabra('a'.repeat(30))).toBe('a'.repeat(30))
  })
})

describe('coincide', () => {
  it('palabra completa, sin importar mayúsculas, tildes ni signos alrededor', () => {
    expect(coincide('GUÍA', 'guia')).toBe(true)
    expect(coincide('quiero la guía!!', 'guia')).toBe(true)
    expect(coincide('#guia por favor', 'guia')).toBe(true)
    expect(coincide('Guia 🙏', 'guia')).toBe(true)
  })

  it('no dispara dentro de otra palabra ni con texto vacío', () => {
    expect(coincide('me gusta guiar', 'guia')).toBe(false)
    expect(coincide('guias', 'guia')).toBe(false)
    expect(coincide('', 'guia')).toBe(false)
  })
})

describe('enlaceMedible', () => {
  const host = 'www.vicente-pareja.cl'

  it('etiqueta el primer enlace propio, con ? o con &', () => {
    expect(enlaceMedible('Acá está: https://www.vicente-pareja.cl/guia', 'guia', host)).toBe(
      'Acá está: https://www.vicente-pareja.cl/guia?s=dm-guia',
    )
    expect(enlaceMedible('https://www.vicente-pareja.cl/?x=1 y más', 'guia', host)).toBe(
      'https://www.vicente-pareja.cl/?x=1&s=dm-guia y más',
    )
  })

  it('deja igual los enlaces externos, el texto sin enlace, y todo si no hay host', () => {
    expect(enlaceMedible('mira https://notion.so/algo', 'guia', host)).toBe('mira https://notion.so/algo')
    expect(enlaceMedible('sin enlace', 'guia', host)).toBe('sin enlace')
    expect(enlaceMedible('https://www.vicente-pareja.cl/guia', 'guia', null)).toBe('https://www.vicente-pareja.cl/guia')
  })

  it('el host se compara sin www y sin distinguir mayúsculas', () => {
    expect(enlaceMedible('https://vicente-pareja.cl/guia', 'guia', 'WWW.vicente-pareja.cl')).toBe(
      'https://vicente-pareja.cl/guia?s=dm-guia',
    )
  })
})

describe('validarRegla', () => {
  it('sin palabra ni mensaje no hay regla', () => {
    expect(validarRegla(undefined)).toEqual({ regla: null })
    expect(validarRegla(null)).toEqual({ regla: null })
    expect(validarRegla({ palabra: '', mensaje: '' })).toEqual({ regla: null })
    expect(validarRegla({ palabra: '  ', mensaje: '  ', respuestaPublica: 'x' })).toEqual({ regla: null })
  })

  it('normaliza la palabra y pone la respuesta por defecto', () => {
    expect(validarRegla({ palabra: 'GUÍA', mensaje: 'Toma: https://x.cl' })).toEqual({
      regla: { palabra: 'guia', mensaje: 'Toma: https://x.cl', respuestaPublica: RESPUESTA_PUBLICA_POR_DEFECTO },
    })
    expect(validarRegla({ palabra: 'guia', mensaje: 'm', respuestaPublica: ' Listo 📩 ' })).toEqual({
      regla: { palabra: 'guia', mensaje: 'm', respuestaPublica: 'Listo 📩' },
    })
  })

  it('cada campo tiene su frase', () => {
    expect(validarRegla({ palabra: 'dos palabras', mensaje: 'm' })).toEqual({ error: REGLA_PALABRA })
    expect(validarRegla({ palabra: 'guia' })).toEqual({ error: REGLA_MENSAJE })
    expect(validarRegla({ palabra: 'guia', mensaje: 'x'.repeat(1001) })).toEqual({ error: REGLA_MENSAJE })
    expect(validarRegla({ palabra: 'guia', mensaje: 'm', respuestaPublica: 'x'.repeat(301) })).toEqual({ error: REGLA_RESPUESTA })
    expect(validarRegla({ mensaje: 'sin palabra' })).toEqual({ error: REGLA_PALABRA })
    expect(validarRegla('guia')).toEqual({ error: REGLA_PALABRA })
  })
})

describe('decidirAutomatica', () => {
  const now = new Date('2026-09-16T12:00:00Z')
  const regla = { palabra: 'guia', mensaje: 'Toma: https://www.vicente-pareja.cl/guia', respuestaPublica: 'Te lo mandé 📩' }
  const base = {
    texto: 'GUÍA porfa',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-16T11:00:00Z'),
    now,
    privadoEncendido: true,
    regla,
    sitioHost: 'www.vicente-pareja.cl',
  }
  const conEnlace = 'Toma: https://www.vicente-pareja.cl/guia?s=dm-guia'

  it('coincide y hay privado: respuesta corta en público, mensaje medible en privado', () => {
    expect(decidirAutomatica(base)).toEqual({ accion: 'responder', publico: 'Te lo mandé 📩', privado: conEnlace })
  })

  it('no coincide o es del dueño: ignorar', () => {
    expect(decidirAutomatica({ ...base, texto: 'qué buen video' })).toEqual({ accion: 'ignorar' })
    expect(decidirAutomatica({ ...base, esPropio: true })).toEqual({ accion: 'ignorar' })
  })

  it('segundo comentario del mismo autor: solo la respuesta pública', () => {
    expect(decidirAutomatica({ ...base, yaRecibioPrivado: true })).toEqual({
      accion: 'responder',
      publico: 'Te lo mandé 📩',
      privado: null,
    })
  })

  it('sin privado posible, el mensaje con enlace va en público', () => {
    const publicoConEnlace = { accion: 'responder', publico: conEnlace, privado: null }
    expect(decidirAutomatica({ ...base, privadoEncendido: false })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, network: 'tiktok' })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, network: 'youtube' })).toEqual(publicoConEnlace)
    expect(decidirAutomatica({ ...base, publishedAt: new Date('2026-09-08T11:00:00Z') })).toEqual(publicoConEnlace)
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/comentarios/reglas.test.ts`
Expected: FAIL, `Failed to resolve import "./reglas"`.

- [ ] **Step 3: La tabla y la marca**

En `src/db/schema.ts`, dentro de `postComments`, después de `dmError`:

```ts
    dmError: text('dm_error'),
    // Lo respondió una regla de palabra clave, no el dueño: la cola lo etiqueta y la IA
    // nunca le pidió borrador.
    automatico: boolean('automatico').notNull().default(false),
```

(si `boolean` no está importado de `drizzle-orm/pg-core`, súmalo al import). Después de `scheduledPostMedia`:

```ts
/**
 * La palabra clave de un post programado y qué responder cuando alguien la comenta. Una
 * por post; se edita después de publicar (a diferencia de `opciones`), así que vive en
 * su propia tabla y no en el post. `palabra` se guarda ya normalizada.
 */
export const reglasClave = pgTable('reglas_clave', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .unique()
    .references(() => scheduledPosts.id, { onDelete: 'cascade' }),
  palabra: text('palabra').notNull(),
  mensaje: text('mensaje').notNull(),
  respuestaPublica: text('respuesta_publica').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Y al final, junto a los demás tipos: `export type ReglaClave = typeof reglasClave.$inferSelect`.

- [ ] **Step 4: Lo puro**

`src/lib/social/comentarios/reglas.ts`:

```ts
// La regla de palabra clave: qué es una palabra válida, cuándo un comentario la dice, y
// qué se responde. Puro: sin base, sin red. El orquestador vive en automatico.ts.

import { DIAS_PRIVADO } from './privado'

export const RESPUESTA_PUBLICA_POR_DEFECTO = 'Te lo mandé por privado 📩'
export const REGLA_PALABRA = 'La palabra clave es una sola palabra, sin espacios, hasta 30 letras.'
export const REGLA_MENSAJE = 'El mensaje del privado va de 1 a 1000 caracteres.'
export const REGLA_RESPUESTA = 'La respuesta pública va de 1 a 300 caracteres.'

export const MAX_PALABRA = 30
export const MAX_MENSAJE = 1000
export const MAX_RESPUESTA = 300
/** Cada automática son dos llamadas a la red dentro de los 120 s del sondeo. */
export const MAX_AUTOMATICAS_POR_CORRIDA = 20

const REDES_CON_PRIVADO = new Set(['instagram', 'facebook'])

export type ReglaLimpia = { palabra: string; mensaje: string; respuestaPublica: string }

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Minúsculas, sin tildes, solo letras y dígitos; null si no sirve como palabra clave. */
export function normalizarPalabra(bruta: string): string | null {
  const limpia = sinTildes(bruta.trim().toLowerCase())
  if (limpia.length === 0 || limpia.length > MAX_PALABRA) return null
  if (!/^[a-z0-9]+$/.test(limpia)) return null
  return limpia
}

/** La palabra completa dentro del texto: «guiar» no dice «guia»; «#GUÍA!» sí. */
export function coincide(texto: string, palabra: string): boolean {
  if (!texto || !palabra) return false
  const tokens = sinTildes(texto.toLowerCase()).split(/[^a-z0-9]+/)
  return tokens.includes(palabra)
}

function mismoHost(a: string, b: string): boolean {
  const limpiar = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return limpiar(a) === limpiar(b)
}

/**
 * Agrega `s=dm-<palabra>` al primer enlace del mensaje que apunte al sitio propio, para que
 * Analítica lo cuente como fila aparte. Un enlace externo no lo lee nuestra analítica y
 * queda igual.
 */
export function enlaceMedible(mensaje: string, palabra: string, sitioHost: string | null): string {
  if (!sitioHost) return mensaje
  let hecho = false
  return mensaje.replace(/https?:\/\/[^\s<>"')\]]+/g, (crudo) => {
    if (hecho) return crudo
    let url: URL
    try {
      url = new URL(crudo)
    } catch {
      return crudo
    }
    if (!mismoHost(url.hostname, sitioHost)) return crudo
    hecho = true
    const separador = crudo.includes('?') ? '&' : '?'
    return `${crudo}${separador}s=dm-${palabra}`
  })
}

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * La regla tal como llega del formulario, el lote o el CSV. Sin palabra ni mensaje no hay
 * regla (no es un error: el bloque quedó vacío). Cualquier otra forma se rechaza con la
 * frase del campo que falla.
 */
export function validarRegla(raw: unknown): { regla: ReglaLimpia | null } | { error: string } {
  if (raw === undefined || raw === null) return { regla: null }
  if (!esObjeto(raw)) return { error: REGLA_PALABRA }
  const palabraBruta = typeof raw.palabra === 'string' ? raw.palabra : ''
  const mensaje = typeof raw.mensaje === 'string' ? raw.mensaje.trim() : ''
  const respuestaBruta = typeof raw.respuestaPublica === 'string' ? raw.respuestaPublica.trim() : ''
  if (palabraBruta.trim().length === 0 && mensaje.length === 0) return { regla: null }

  const palabra = normalizarPalabra(palabraBruta)
  if (!palabra) return { error: REGLA_PALABRA }
  if (mensaje.length < 1 || [...mensaje].length > MAX_MENSAJE) return { error: REGLA_MENSAJE }
  const respuestaPublica = respuestaBruta.length > 0 ? respuestaBruta : RESPUESTA_PUBLICA_POR_DEFECTO
  if ([...respuestaPublica].length > MAX_RESPUESTA) return { error: REGLA_RESPUESTA }
  return { regla: { palabra, mensaje, respuestaPublica } }
}

export type Plan =
  | { accion: 'ignorar' }
  | { accion: 'responder'; publico: string; privado: string | null }

/**
 * Qué hacer con un comentario frente a la regla de su post. Si hay privado, el público es
 * la respuesta corta y el mensaje con enlace va por privado; si no lo hay (red sin
 * mensajes, bandera apagada, plazo de Meta vencido), el mensaje con enlace va en público:
 * nunca se promete un privado que no salió. Un autor que ya recibió privado en este post
 * recibe solo la respuesta pública.
 */
export function decidirAutomatica(entrada: {
  texto: string
  esPropio: boolean
  yaRecibioPrivado: boolean
  network: string
  publishedAt: Date
  now: Date
  privadoEncendido: boolean
  regla: ReglaLimpia
  sitioHost: string | null
}): Plan {
  if (entrada.esPropio) return { accion: 'ignorar' }
  if (!coincide(entrada.texto, entrada.regla.palabra)) return { accion: 'ignorar' }

  const mensaje = enlaceMedible(entrada.regla.mensaje, entrada.regla.palabra, entrada.sitioHost)
  const dentroDelPlazo = entrada.now.getTime() - entrada.publishedAt.getTime() < DIAS_PRIVADO * 864e5
  const hayPrivado =
    entrada.privadoEncendido && REDES_CON_PRIVADO.has(entrada.network) && dentroDelPlazo

  if (!hayPrivado) return { accion: 'responder', publico: mensaje, privado: null }
  if (entrada.yaRecibioPrivado) return { accion: 'responder', publico: entrada.regla.respuestaPublica, privado: null }
  return { accion: 'responder', publico: entrada.regla.respuestaPublica, privado: mensaje }
}
```

`privado.ts` importa `env` de `@/lib/env`; comprueba que eso no arrastre `server-only` (no lo hace: `env.ts` es un lector de `process.env`). Si vitest se quejara, mueve `DIAS_PRIVADO` a `reglas.ts` y haz que `privado.ts` lo importe de aquí.

- [ ] **Step 5: Corre y confirma que pasa**

Run: `npx vitest run src/lib/social/comentarios/reglas.test.ts && npm run typecheck`
Expected: PASS, 14 tests (2 normalizar, 2 coincide, 3 enlace, 3 validar, 4 decidir); typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/lib/social/comentarios/reglas.ts src/lib/social/comentarios/reglas.test.ts
git commit -m "Agrega la regla de palabra clave: tabla, marca en comentarios y su lógica pura

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 2: El sondeo ve los posts recién publicados

**Files:**
- Modify: `src/lib/social/comentarios/ventana.ts`
- Modify: `src/lib/social/comentarios/run.ts:57-72`
- Modify: `src/lib/social/comentarios/redaccion.ts:22-30`
- Test: `src/lib/social/comentarios/ventana.test.ts`

**Interfaces:**
- Produces, de `ventana.ts`: `unirPosts(sync: Array<{ externalId: string; publishedAt: Date }>, publicados: Array<{ externalId: string; publishedAt: Date }>): Array<{ externalId: string; publishedAt: Date }>` — la unión sin repetir por `externalId`, con preferencia por la fila del sync.

- [ ] **Step 1: Escribe el test que falla**

Al final de `src/lib/social/comentarios/ventana.test.ts` (suma `unirPosts` al import):

```ts
describe('unirPosts', () => {
  it('suma los destinos publicados que el sync aún no trajo, sin repetir', () => {
    const sync = [{ externalId: 'a', publishedAt: hace(2) }]
    const publicados = [
      { externalId: 'a', publishedAt: hace(1) },
      { externalId: 'b', publishedAt: hace(0.01) },
    ]
    expect(unirPosts(sync, publicados)).toEqual([
      { externalId: 'a', publishedAt: hace(2) },
      { externalId: 'b', publishedAt: hace(0.01) },
    ])
  })

  it('con una sola fuente devuelve esa fuente', () => {
    const solo = [{ externalId: 'x', publishedAt: hace(1) }]
    expect(unirPosts(solo, [])).toEqual(solo)
    expect(unirPosts([], solo)).toEqual(solo)
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/comentarios/ventana.test.ts`
Expected: FAIL, `unirPosts` no exportado.

- [ ] **Step 3: Implementa `unirPosts`**

En `ventana.ts`, después de `postsAsondear`:

```ts
/**
 * Las publicaciones a vigilar salen de dos fuentes: las que el sync diario ya trajo y las
 * que el calendario publicó desde entonces (su destino guarda el id de red al publicar).
 * Sin la segunda, un post de hace diez minutos no entra a la cola hasta mañana. Manda la
 * fila del sync: trae la fecha real de la red.
 */
export function unirPosts(
  sync: Array<{ externalId: string; publishedAt: Date }>,
  publicados: Array<{ externalId: string; publishedAt: Date }>,
): Array<{ externalId: string; publishedAt: Date }> {
  const vistos = new Set(sync.map((p) => p.externalId))
  return [...sync, ...publicados.filter((p) => !vistos.has(p.externalId))]
}
```

- [ ] **Step 4: El sondeo une las dos fuentes**

En `run.ts`, importa `scheduledPostTargets` de `@/db` y `unirPosts` de `./ventana`, y reemplaza el bloque que calcula `ids`:

```ts
  // Las publicaciones ya están en la base: la sincronización diaria las trajo. Y las que
  // el calendario publicó después del último sync también, con el id que la red devolvió
  // al publicar: sin ellas un post de hace diez minutos no entraría a la cola hasta mañana.
  const desde = new Date(now.getTime() - DIAS_VENTANA * 864e5)
  const [recientes, publicados] = await Promise.all([
    db
      .select({ externalId: socialPosts.externalId, publishedAt: socialPosts.publishedAt })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.accountId, account.id),
          isNull(socialPosts.archivedAt),
          gte(socialPosts.publishedAt, desde),
        ),
      )
      .orderBy(desc(socialPosts.publishedAt)),
    db
      .select({ externalId: scheduledPostTargets.externalId, publishedAt: scheduledPostTargets.updatedAt })
      .from(scheduledPostTargets)
      .where(
        and(
          eq(scheduledPostTargets.accountId, account.id),
          eq(scheduledPostTargets.status, 'published'),
          isNotNull(scheduledPostTargets.externalId),
          gte(scheduledPostTargets.updatedAt, desde),
        ),
      ),
  ])

  const ids = postsAsondear(
    unirPosts(
      recientes,
      publicados.flatMap((p) => (p.externalId ? [{ externalId: p.externalId, publishedAt: p.publishedAt }] : [])),
    ),
    now,
  )
  if (ids.length === 0) return vacio
```

- [ ] **Step 5: La caption cae al post programado**

En `redaccion.ts`, `captionDe` pasa a:

```ts
/**
 * El caption de la publicación comentada: del sync si ya la trajo, y si no del post
 * programado que la publicó (la red aún no la devolvió). Null si ninguno la tiene.
 */
async function captionDe(accountId: string, postExternalId: string): Promise<string | null> {
  const db = getDb()
  const [post] = await db
    .select({ caption: socialPosts.caption })
    .from(socialPosts)
    .where(and(eq(socialPosts.accountId, accountId), eq(socialPosts.externalId, postExternalId)))
    .limit(1)
  if (post?.caption) return post.caption
  const [programado] = await db
    .select({ caption: scheduledPosts.caption })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPosts.id, scheduledPostTargets.postId))
    .where(and(eq(scheduledPostTargets.accountId, accountId), eq(scheduledPostTargets.externalId, postExternalId)))
    .limit(1)
  return programado?.caption ?? null
}
```

(importa `scheduledPosts` y `scheduledPostTargets` de `@/db`).

- [ ] **Step 6: Corre, typecheck y commit**

Run: `npx vitest run src/lib/social/comentarios && npm run typecheck`
Expected: PASS y sin errores.

```bash
git add src/lib/social/comentarios/ventana.ts src/lib/social/comentarios/ventana.test.ts src/lib/social/comentarios/run.ts src/lib/social/comentarios/redaccion.ts
git commit -m "Hace que el sondeo vigile los posts que el calendario acaba de publicar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 3: Aplicar las reglas en el sondeo

**Files:**
- Create: `src/lib/social/comentarios/automatico.ts`
- Modify: `src/lib/social/comentarios/run.ts` (llamar a `aplicarReglas` tras insertar; contador compartido)
- Modify: `src/lib/social/comentarios/redaccion.ts` (saltar los que coinciden)

**Interfaces:**
- Consumes: todo lo de la Task 1; `comentaristaFor`, `connectorFor`; `COMENTARIO_AUSENTE`, `RED_RECHAZO` de `./comentarista`; `seAcaboElTiempo` de `./ventana`.
- Produces, de `automatico.ts`:
  - `hostDelSitio(): string | null`
  - `reglasPara(accountId: string, postExternalIds: string[]): Promise<Map<string, ReglaLimpia>>` (clave: `postExternalId`)
  - `aplicarReglas(account: SocialAccount, token: string, nuevos: Array<{ id: string; postExternalId: string; externalId: string; authorExternalId: string | null; text: string; publishedAt: Date; state: string }>, cupo: { restantes: number }, inicio: number): Promise<{ respondidos: number; fallidos: number }>`

- [ ] **Step 1: Escribe el orquestador**

`src/lib/social/comentarios/automatico.ts`:

```ts
import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, postComments, reglasClave, scheduledPostTargets } from '@/db'
import type { SocialAccount } from '@/db'
import { env } from '@/lib/env'
import { COMENTARIO_AUSENTE, RED_RECHAZO } from './comentarista'
import { comentaristaFor } from './index'
import { decidirAutomatica, type ReglaLimpia } from './reglas'
import { seAcaboElTiempo } from './ventana'

/**
 * El host del sitio propio, para etiquetar el enlace del mensaje. `SITE_URL` si el dueño
 * la puso; si no, el dominio de producción que Vercel inyecta; sin ninguno, null y el
 * enlace va sin etiqueta.
 */
export function hostDelSitio(): string | null {
  const crudo = env('SITE_URL') ?? env('VERCEL_PROJECT_PRODUCTION_URL')
  if (!crudo) return null
  try {
    return new URL(crudo.startsWith('http') ? crudo : `https://${crudo}`).hostname
  } catch {
    return null
  }
}

/** Las reglas de los posts de una cuenta, por id de red del post. */
export async function reglasPara(accountId: string, postExternalIds: string[]): Promise<Map<string, ReglaLimpia>> {
  const mapa = new Map<string, ReglaLimpia>()
  if (postExternalIds.length === 0) return mapa
  const filas = await getDb()
    .select({
      externalId: scheduledPostTargets.externalId,
      palabra: reglasClave.palabra,
      mensaje: reglasClave.mensaje,
      respuestaPublica: reglasClave.respuestaPublica,
    })
    .from(reglasClave)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, reglasClave.postId))
    .where(
      and(eq(scheduledPostTargets.accountId, accountId), inArray(scheduledPostTargets.externalId, postExternalIds)),
    )
  for (const f of filas) {
    if (f.externalId) mapa.set(f.externalId, { palabra: f.palabra, mensaje: f.mensaje, respuestaPublica: f.respuestaPublica })
  }
  return mapa
}

type Nuevo = {
  id: string
  postExternalId: string
  externalId: string
  authorExternalId: string | null
  text: string
  publishedAt: Date
  state: string
}

/**
 * Responde en el acto los comentarios nuevos que dicen la palabra clave de su post. Corre
 * dentro del sondeo, sobre los recién insertados de una cuenta, con el token que el sondeo
 * ya consiguió. El privado llega en la entrega 2: hoy el plan siempre se decide sin él.
 * `cupo.restantes` es compartido por toda la corrida.
 */
export async function aplicarReglas(
  account: SocialAccount,
  token: string,
  nuevos: Nuevo[],
  cupo: { restantes: number },
  inicio: number,
): Promise<{ respondidos: number; fallidos: number }> {
  const resultado = { respondidos: 0, fallidos: 0 }
  const candidatos = nuevos.filter((n) => n.state === 'pendiente')
  if (candidatos.length === 0 || cupo.restantes <= 0) return resultado
  const comentarista = comentaristaFor(account.network)
  if (!comentarista) return resultado
  // Solo la credencial del propio comentarista escribe; si no tiene una propia, la del
  // sondeo (que viene del conector) es la misma que usaría el dueño al responder a mano.
  const tokenEscritura = comentarista.ensureCredential ? await comentarista.ensureCredential(account) : token
  if (!tokenEscritura) return resultado

  const reglas = await reglasPara(account.id, [...new Set(candidatos.map((c) => c.postExternalId))])
  if (reglas.size === 0) return resultado
  const db = getDb()
  const sitioHost = hostDelSitio()
  const now = new Date()

  for (const c of candidatos) {
    if (cupo.restantes <= 0 || seAcaboElTiempo(inicio, Date.now())) break
    const regla = reglas.get(c.postExternalId)
    if (!regla) continue

    const plan = decidirAutomatica({
      texto: c.text,
      esPropio: false,
      yaRecibioPrivado: false,
      network: account.network,
      publishedAt: c.publishedAt,
      now,
      privadoEncendido: false,
      regla,
      sitioHost,
    })
    if (plan.accion === 'ignorar') continue

    cupo.restantes -= 1
    try {
      const replyId = await comentarista.responder(account, tokenEscritura, c.externalId, plan.publico)
      await db
        .update(postComments)
        .set({ state: 'enviado', replyExternalId: replyId, draft: plan.publico, error: null, automatico: true, updatedAt: new Date() })
        .where(eq(postComments.id, c.id))
      resultado.respondidos += 1
    } catch (error) {
      console.error(`[comentarios] automática ${account.network}:`, String(error).slice(0, 300))
      const borrado = error instanceof Error && error.message === COMENTARIO_AUSENTE
      await db
        .update(postComments)
        .set({
          state: borrado ? 'descartado' : 'fallido',
          error: borrado ? COMENTARIO_AUSENTE : RED_RECHAZO,
          draft: plan.publico,
          automatico: true,
          updatedAt: new Date(),
        })
        .where(eq(postComments.id, c.id))
      resultado.fallidos += 1
    }
  }
  return resultado
}
```

- [ ] **Step 2: Engancharlo al sondeo**

En `run.ts`:

- Importa `aplicarReglas` de `./automatico` y `MAX_AUTOMATICAS_POR_CORRIDA` de `./reglas`.
- `sondearCuenta` recibe dos parámetros más: `cupo: { restantes: number }` e `inicio: number`. Su tipo de retorno `Cuenta` gana `automaticas: number`.
- Dentro del `try` del bucle, el insert pasa a devolver los ids: `insert … onConflictDoNothing` no devuelve las filas que ya existían, así que una fila que el conflicto dejó fuera no vuelve en `returning` y no entra a `aplicarReglas` (otra pasada ya la tiene). El bloque desde `await db.insert(postComments)` hasta `nuevos += frescos.length` queda así:

```ts
      const insertados = await db
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
            state: estadoInicial(c.authorExternalId, account.externalId),
          })),
        )
        // Dos pasadas que se solapan verían los mismos comentarios; la unique decide y la
        // segunda no pisa nada.
        .onConflictDoNothing({ target: [postComments.accountId, postComments.externalId] })
        .returning({ id: postComments.id, externalId: postComments.externalId })
      const idPorExternal = new Map(insertados.map((f) => [f.externalId, f.id]))
      for (const c of frescos) conocidos.add(c.externalId)
      nuevos += frescos.length

      const { respondidos } = await aplicarReglas(
        account,
        token,
        frescos.flatMap((c) => {
          const id = idPorExternal.get(c.externalId)
          return id
            ? [{ id, postExternalId: c.postExternalId, externalId: c.externalId, authorExternalId: c.authorExternalId, text: c.text, publishedAt: c.publishedAt, state: estadoInicial(c.authorExternalId, account.externalId) }]
            : []
        }),
        cupo,
        inicio,
      )
      automaticas += respondidos
```

- `sondearComentarios` crea `const cupo = { restantes: MAX_AUTOMATICAS_POR_CORRIDA }` antes del bucle y pasa `cupo, inicio` a `sondearCuenta`. `SondeoReport.cuentas[]` gana `automaticas: number` (y la entrada de error pone `automaticas: 0`).
- El bloque `catch` de la publicación no cambia: un fallo de `aplicarReglas` que escape (no debería: cada envío tiene su `try`) cae ahí y solo cuenta como salteado.

- [ ] **Step 3: La IA salta los que coinciden con regla**

En `redaccion.ts`, `redactarPendientes`: después de obtener `pendientes` y antes del bucle, filtra los que coinciden con la regla de su post:

```ts
  // Un comentario que dice la palabra clave lo responde la regla en el sondeo, no el
  // modelo: si quedó pendiente fue por el cupo de la corrida, y la siguiente lo toma.
  const porCuenta = new Map<string, string[]>()
  for (const f of pendientes) porCuenta.set(f.accountId, [...(porCuenta.get(f.accountId) ?? []), f.postExternalId])
  const reglasPorCuenta = new Map<string, Map<string, ReglaLimpia>>()
  for (const [accountId, posts] of porCuenta) reglasPorCuenta.set(accountId, await reglasPara(accountId, [...new Set(posts)]))
  const aRedactar = pendientes.filter((f) => {
    const regla = reglasPorCuenta.get(f.accountId)?.get(f.postExternalId)
    return !regla || !coincide(f.text, regla.palabra)
  })
```

y el bucle itera `aRedactar` en vez de `pendientes`. Importa `reglasPara` de `./automatico` y `coincide`, `type ReglaLimpia` de `./reglas`.

- [ ] **Step 4: Typecheck, tests y commit**

Run: `npm run typecheck && npx vitest run src/lib/social/comentarios`
Expected: sin errores; PASS.

```bash
git add src/lib/social/comentarios/automatico.ts src/lib/social/comentarios/run.ts src/lib/social/comentarios/redaccion.ts
git commit -m "Responde solo los comentarios que dicen la palabra clave de su post

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 4: Compositor y editor escriben la regla

**Files:**
- Modify: `src/lib/social/publish/crear.ts`
- Create: `src/app/admin/(dash)/schedule/regla-clave.tsx`
- Modify: `src/app/admin/(dash)/schedule/composer.tsx`
- Modify: `src/app/admin/actions.ts` (`createScheduledPost`, `updateScheduledPost`)
- Modify: `src/app/admin/(dash)/schedule/[id]/page.tsx`, `editor.tsx`

**Interfaces:**
- Consumes: `validarRegla`, `ReglaLimpia`, `RESPUESTA_PUBLICA_POR_DEFECTO`, `MAX_*` de `comentarios/reglas`; `reglasClave` de `@/db`.
- Produces: `crearPostProgramado({ …, regla?: ReglaLimpia | null })`; campos de formulario `reglaPalabra`, `reglaMensaje`, `reglaRespuesta`; `reglaDesdeFormulario(formData): unknown`; componente `<ReglaClave inicial?: { palabra; mensaje; respuestaPublica } | null />`.

- [ ] **Step 1: `crear.ts` inserta la regla**

```ts
import type { ReglaLimpia } from '../comentarios/reglas'
…
export async function crearPostProgramado(input: {
  caption: string
  scheduledAt: Date
  media: MediaSubida[]
  networks: string[]
  opciones?: Record<string, OpcionesDestino>
  regla?: ReglaLimpia | null
}): Promise<string> {
  …
  await db.insert(scheduledPostTargets).values(/* igual */)
  if (input.regla) {
    await db.insert(reglasClave).values({ postId: post!.id, ...input.regla })
  }
  return post!.id
}
```

(importa `reglasClave` de `@/db`; el `import` de `reglas.ts` no arrastra `server-only`).

- [ ] **Step 2: El bloque del compositor**

`src/app/admin/(dash)/schedule/regla-clave.tsx`:

```tsx
'use client'

import { Field, Input, Textarea } from '@/components/ui'
import { MAX_MENSAJE, MAX_PALABRA, MAX_RESPUESTA, RESPUESTA_PUBLICA_POR_DEFECTO } from '@/lib/social/comentarios/reglas'

/**
 * La regla de palabra clave de un post. Plegada por defecto en el compositor; abierta en
 * el editor cuando ya existe. Los tres campos llevan el nombre que `reglaDesdeFormulario`
 * lee. Palabra vacía = sin regla.
 */
export function ReglaClave({
  inicial,
}: {
  inicial?: { palabra: string; mensaje: string; respuestaPublica: string } | null
}) {
  return (
    <details open={Boolean(inicial)} className="rounded-xl bg-white/[0.04] p-4">
      <summary className="cursor-pointer text-sm font-medium">Respuesta automática por palabra clave</summary>
      <div className="mt-4 space-y-4">
        <Field label="Palabra clave" hint="Una sola palabra. Quien la comente recibe la respuesta sin que hagas nada.">
          <Input name="reglaPalabra" maxLength={MAX_PALABRA} defaultValue={inicial?.palabra ?? ''} placeholder="GUIA" className="max-w-[16rem]" />
        </Field>
        <Field label="Mensaje" hint="Pon el enlace aquí; si es de tu sitio se mide solo en Analítica.">
          <Textarea name="reglaMensaje" rows={3} maxLength={MAX_MENSAJE} defaultValue={inicial?.mensaje ?? ''} placeholder="Acá tienes la guía: https://…" />
        </Field>
        <Field label="Respuesta pública" hint="Lo que se responde al comentario cuando el mensaje sí salió por privado.">
          <Input name="reglaRespuesta" maxLength={MAX_RESPUESTA} defaultValue={inicial?.respuestaPublica ?? RESPUESTA_PUBLICA_POR_DEFECTO} />
        </Field>
        <p className="text-[0.72rem] text-fg-faint">
          En TikTok y YouTube, o mientras el privado esté apagado, el mensaje se publica como respuesta al comentario.
        </p>
      </div>
    </details>
  )
}
```

En `composer.tsx`, importa `ReglaClave` de `./regla-clave` y móntalo después del bloque de TikTok y antes de «Fecha y hora»:

```tsx
        {tiktok ? <TikTokOpciones soloFotos={soloFotos} /> : null}

        <ReglaClave />
```

- [ ] **Step 3: La acción de crear lee y valida la regla**

En `actions.ts`, junto a los imports: `import { validarRegla } from '@/lib/social/comentarios/reglas'` y `reglasClave` en el import de `@/db`. Agrega arriba de `createScheduledPost`:

```ts
/** Los tres campos del bloque de palabra clave, crudos, listos para `validarRegla`. */
function reglaDesdeFormulario(formData: FormData): unknown {
  return {
    palabra: String(formData.get('reglaPalabra') ?? ''),
    mensaje: String(formData.get('reglaMensaje') ?? ''),
    respuestaPublica: String(formData.get('reglaRespuesta') ?? ''),
  }
}
```

En `createScheduledPost`, después del chequeo de `opcionesCheck` y antes de subir archivos:

```ts
  const reglaCheck = validarRegla(reglaDesdeFormulario(formData))
  if ('error' in reglaCheck) return { error: reglaCheck.error }
```

y pásala a `crearPostProgramado({ …, regla: reglaCheck.regla })`.

- [ ] **Step 4: El editor edita o borra la regla**

En `updateScheduledPost`, después del bloque que valida `targetsPlan` (antes de cualquier escritura), agrega la validación:

```ts
  const reglaCheck = validarRegla(reglaDesdeFormulario(formData))
  if ('error' in reglaCheck) return { error: reglaCheck.error }
```

y justo antes de `revalidatePath('/admin/schedule')` al final, la escritura:

```ts
  // La regla se edita siempre, incluso publicado el post: rige para los comentarios que
  // lleguen desde ahora. Palabra vacía la borra.
  if (reglaCheck.regla) {
    await db
      .insert(reglasClave)
      .values({ postId, ...reglaCheck.regla })
      .onConflictDoUpdate({
        target: reglasClave.postId,
        set: { ...reglaCheck.regla, updatedAt: new Date() },
      })
  } else {
    await db.delete(reglasClave).where(eq(reglasClave.postId, postId))
  }
```

En `src/app/admin/(dash)/schedule/[id]/page.tsx`, lee la regla junto a targets y media (`db.select().from(reglasClave).where(eq(reglasClave.postId, id))`) y pásala: `regla={regla ? { palabra: regla.palabra, mensaje: regla.mensaje, respuestaPublica: regla.respuestaPublica } : null}`.

En `editor.tsx`, prop nueva `regla: { palabra: string; mensaje: string; respuestaPublica: string } | null`, y monta `<ReglaClave inicial={regla} />` después del bloque de Portada y antes de Atributos.

- [ ] **Step 5: Lint, typecheck y commit**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

```bash
git add src/lib/social/publish/crear.ts "src/app/admin/(dash)/schedule/regla-clave.tsx" "src/app/admin/(dash)/schedule/composer.tsx" src/app/admin/actions.ts "src/app/admin/(dash)/schedule/[id]/page.tsx" "src/app/admin/(dash)/schedule/[id]/editor.tsx"
git commit -m "Deja poner y editar la palabra clave de un post desde el compositor y el editor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 5: Lote, CSV y API aceptan `regla`

**Files:**
- Modify: `src/lib/social/publish/batch.ts`, `src/lib/social/publish/csv.ts`, `src/app/api/schedule/batch/route.ts`
- Test: `src/lib/social/publish/batch.test.ts`, `src/lib/social/publish/csv.test.ts`
- Modify: `public/docs/api-editor.md`

**Interfaces:**
- Produces: `BatchItem.regla?: unknown` (objeto `{ palabra, mensaje, respuestaPublica? }`); CSV con séptima columna `regla` (después de `opciones`).

- [ ] **Step 1: Tests que fallan**

En `batch.test.ts` (importa `REGLA_PALABRA`, `REGLA_MENSAJE` de `../comentarios/reglas`):

```ts
describe('regla de palabra clave en el lote', () => {
  it('acepta una regla completa y una fila sin regla', () => {
    expect(validateBatchItem({ ...base, regla: { palabra: 'GUÍA', mensaje: 'Toma: https://x.cl' } }, now)).toBeNull()
    expect(validateBatchItem({ ...base, regla: undefined }, now)).toBeNull()
  })

  it('rechaza la regla malformada con la frase del campo', () => {
    expect(validateBatchItem({ ...base, regla: { palabra: 'dos palabras', mensaje: 'm' } }, now)).toBe(REGLA_PALABRA)
    expect(validateBatchItem({ ...base, regla: { palabra: 'guia' } }, now)).toBe(REGLA_MENSAJE)
    expect(validateBatchItem({ ...base, regla: 'guia' }, now)).toBe(REGLA_PALABRA)
  })
})
```

En `csv.test.ts`:

```ts
describe('regla en el CSV', () => {
  it('la séptima columna trae la regla en JSON; vacía es sin regla', () => {
    const text = [
      'fecha,texto,redes,media,portada,opciones,regla',
      '2026-09-17 10:00,Con regla,threads,,,,"{""palabra"":""guia"",""mensaje"":""Toma: https://x.cl""}"',
      '2026-09-17 11:00,Sin regla,threads,,,,',
    ].join('\n')
    expect(csvToBatchItems(text)).toMatchObject({
      items: [{ regla: { palabra: 'guia', mensaje: 'Toma: https://x.cl' } }, { regla: undefined }],
    })
  })

  it('regla solo puede ir séptima, después de opciones', () => {
    expect(csvToBatchItems('fecha,texto,redes,media,portada,regla\n')).toEqual({ error: CSV_HEADER_ERROR })
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/publish/batch.test.ts src/lib/social/publish/csv.test.ts`
Expected: FAIL en los describes nuevos.

- [ ] **Step 3: Implementa**

`batch.ts`: `BatchItem` gana `/** { palabra, mensaje, respuestaPublica? }; se valida con validarRegla. */ regla?: unknown`. En `validateBatchItem`, después de `opcionesCheck`:

```ts
  const reglaCheck = validarRegla(item.regla)
  if ('error' in reglaCheck) return reglaCheck.error
```

En `scheduleBatch`, antes de insertar el post, `const reglaCheck = validarRegla(item.regla)`; tras insertar targets: `if (!('error' in reglaCheck) && reglaCheck.regla) await db.insert(reglasClave).values({ postId: post!.id, ...reglaCheck.regla })` (importa `reglasClave` de `@/db` y `validarRegla` de `../comentarios/reglas`).

`csv.ts`: `COLUMNAS` gana `'regla'` al final; el item gana `regla: header.length === 7 ? opcionesDeCelda(row[6] ?? '') : undefined` (reutiliza `opcionesDeCelda`, que ya parsea JSON o devuelve el texto crudo); `CSV_HEADER_ERROR` termina en «…opciones como sexta y regla como séptima.». Actualiza el test de CSV que asserta el texto exacto de `CSV_HEADER_ERROR` si lo hay.

`route.ts`: en el mapeo, `regla: p.regla,` debajo de `opciones`.

- [ ] **Step 4: Documenta**

En `public/docs/api-editor.md`, después de la sección `### opciones`, agrega:

```markdown
### `regla` (opcional) — respuesta automática por palabra clave

```json
"regla": { "palabra": "GUIA", "mensaje": "Acá tienes la guía: https://www.vicente-pareja.cl/guia", "respuestaPublica": "Te lo mandé por privado 📩" }
```

Cuando alguien comente esa palabra (completa, sin importar mayúsculas ni tildes), el
sistema responde solo en la corrida siguiente del cron. Donde hay privado (Instagram y
Facebook, con el privado encendido) responde `respuestaPublica` en público y manda
`mensaje` por privado; donde no lo hay (TikTok, YouTube, o privado apagado) publica
`mensaje` como respuesta. Si el enlace es del sitio propio se le agrega `?s=dm-<palabra>`
y aparece como fila propia en Analítica. `palabra`: una sola palabra, hasta 30 letras.
`mensaje`: 1 a 1000 caracteres. `respuestaPublica`: opcional, 1 a 300. En el CSV es la
séptima columna, después de `opciones`.
```

y en la tabla de errores:

```markdown
| `La palabra clave es una sola palabra, sin espacios, hasta 30 letras.` | `regla.palabra` vacía con mensaje, con espacios o símbolos, o `regla` que no es objeto |
| `El mensaje del privado va de 1 a 1000 caracteres.` | `regla.mensaje` ausente, vacío o largo |
| `La respuesta pública va de 1 a 300 caracteres.` | `regla.respuestaPublica` larga |
```

- [ ] **Step 5: Corre y commit**

Run: `npx vitest run src/lib/social/publish && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/social/publish/batch.ts src/lib/social/publish/batch.test.ts src/lib/social/publish/csv.ts src/lib/social/publish/csv.test.ts src/app/api/schedule/batch/route.ts public/docs/api-editor.md
git commit -m "Acepta la regla de palabra clave en el lote, el CSV y la API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 6: La cola muestra lo automático; README; cierre

**Files:**
- Modify: `src/lib/comentarios-cola.ts`
- Modify: `src/app/admin/(dash)/comments/page.tsx`, `src/app/admin/(dash)/comments/cola.tsx`
- Modify: `README.md` (sección «Responder comentarios»), `.env.example`

**Interfaces:**
- Produces: `ESTADOS_COLA` gana `'automaticas'`; `ComentarioFila` gana `automatico: boolean` y `reglaPalabra: string | null`.

- [ ] **Step 1: La consulta**

En `comentarios-cola.ts`:

- `ESTADOS_COLA = ['pendientes', 'enviados', 'automaticas', 'descartados', 'todos'] as const`.
- `POR_ESTADO.automaticas = ['pendiente', 'fallido', 'enviado', 'descartado']`.
- En `getCola`, si `filtro.estado === 'automaticas'` suma `eq(postComments.automatico, true)` a `condiciones`.
- `ComentarioFila` gana `automatico: boolean` y `reglaPalabra: string | null`; el `select` suma `automatico: postComments.automatico` y `reglaPalabra: reglasClave.palabra`, con dos `leftJoin` más:

```ts
    .leftJoin(
      scheduledPostTargets,
      and(eq(scheduledPostTargets.accountId, postComments.accountId), eq(scheduledPostTargets.externalId, postComments.postExternalId)),
    )
    .leftJoin(reglasClave, eq(reglasClave.postId, scheduledPostTargets.postId))
```

(importa `reglasClave`, `scheduledPostTargets` de `@/db`). Como puede haber más de un destino con el mismo `external_id` solo si dos cuentas comparten id, y el join ya filtra por `accountId`, no multiplica filas.

- [ ] **Step 2: La página y la tarjeta**

`comments/page.tsx`: `ETIQUETA_ESTADO.automaticas = 'Automáticas'`.

`comments/cola.tsx`:
- En la cabecera de cada grupo, si `primero.reglaPalabra`, una línea bajo la caption: `<p className="text-[0.72rem] text-fg-faint">Palabra clave: {primero.reglaPalabra.toUpperCase()}</p>`.
- En `Tarjeta`, en la rama no editable, junto a «Respondido:»:

```tsx
            <p className="text-fg-muted">
              <span className="text-positive">Respondido:</span> {fila.draft}
              {fila.automatico ? <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[0.68rem] text-fg-faint">Automática</span> : null}
            </p>
```

  y en la rama editable, si `fila.automatico && fila.state === 'fallido'`, encima del textarea: `<p className="mt-3 text-[0.72rem] text-fg-faint">La regla de palabra clave intentó responder y la red no aceptó; «Enviar» lo reintenta.</p>`.

- [ ] **Step 3: README y `.env.example`**

En `README.md`, dentro de «Responder comentarios», agrega al final:

```markdown
#### Respuesta automática por palabra clave

Al programar un post puedes ponerle una palabra clave, un mensaje con enlace y una
respuesta pública. Cuando alguien comenta esa palabra, la corrida siguiente del cron (cinco
minutos como mucho) responde sola, sin pasar por la cola de aprobación, y la cola lo marca
como «Automática». En Instagram y Facebook con el privado encendido (`COMENTARIOS_DM=1`,
ver arriba) responde corto en público y manda el mensaje por privado; en TikTok, YouTube o
con el privado apagado publica el mensaje con el enlace como respuesta. Si el enlace es de
tu sitio, se le agrega `?s=dm-<palabra>` y aparece como fila propia en Analítica → «Qué
contenido te trae gente». Para eso el servidor necesita saber cuál es tu dominio:
`SITE_URL=https://www.tu-dominio.cl` (si falta, usa el dominio de producción que Vercel
inyecta).
```

En `.env.example`, junto a `SITE_TIMEZONE`: `# Tu dominio, para etiquetar los enlaces del mensaje automático; si falta se usa el de Vercel.` y `SITE_URL=`.

- [ ] **Step 4: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde.

```bash
git add src/lib/comentarios-cola.ts "src/app/admin/(dash)/comments/page.tsx" "src/app/admin/(dash)/comments/cola.tsx" README.md .env.example
git commit -m "Muestra en la cola las respuestas automáticas y documenta la palabra clave

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

`git log --oneline origin/main..HEAD` debe listar ocho commits (spec, plan y los seis de este plan). Antes de desplegar, el dueño corre `npm run db:push` (tabla nueva y columna con default).
