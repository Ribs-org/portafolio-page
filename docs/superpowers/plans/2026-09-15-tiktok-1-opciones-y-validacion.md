# TikTok 1: opciones por destino y validación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el compositor, el lote y el CSV acepten TikTok como destino con las opciones que TikTok obliga a pedir (modo directo o borrador, privacidad elegida por el dueño, casillas de interacción, contenido comercial), guardadas por destino en una columna nueva y validadas con frases fijas. Todavía no se publica nada: el publisher es la entrega 2.

**Architecture:** Una columna `opciones` jsonb en `scheduled_post_targets`, un módulo puro `publish/opciones.ts` que valida y resume las opciones por red, reglas de media de TikTok en `validate.ts`, un módulo `publish/tiktok-creador.ts` que consulta `creator_info` (lo reutiliza el publisher después), y un bloque cliente `TikTokOpciones` en el compositor que se abre al marcar TikTok. Los tres caminos de escritura (compositor, lote, CSV) pasan por `validarOpcionesPorRed` y por `crearPostProgramado`.

**Tech Stack:** Next.js App Router, Drizzle + Neon (`db:push`, sin archivos de migración), Vitest, React 19 (`useActionState`, server actions).

**Spec:** `docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md` (secciones 2, 3 «Validación local», 4 «Compositor» y «Editor», tabla de decisiones y «Las entregas»).

Rama: `publicar-en-tiktok`, nacida de `main` con la spec ya commiteada. **Esta entrega no se fusiona sola**: sin publisher, un destino de TikTok programado fallaría en el cron con `NO_PUBLISH_TOKEN` y dispararía la alerta. La entrega 2 se apila en la misma rama y las dos salen en un solo PR.

## Global Constraints

- Frases fijas en español en todo lo visible; el detalle de TikTok solo a `console.error` truncado a 300 (`String(error).slice(0, 300)` o `(await response.text()).slice(0, 300)`).
- Las opciones viven **por destino** en `scheduled_post_targets.opciones`; nunca en `scheduled_posts.atributos`.
- En modo directo la privacidad **no tiene valor por defecto** y las casillas de comentarios, dúo y pegar nacen **apagadas**; el interruptor de contenido comercial nace **apagado**. Es la guía de TikTok y la auditoría la revisa.
- `comercial = 'patrocinado'` con `privacidad = 'SELF_ONLY'` se rechaza.
- Media de TikTok: **un solo video** (mp4, mov, webm) **o de 1 a 35 fotos** (jpg, jpeg, webp), nunca mezcla, nunca cero archivos; caption hasta 2200.
- Los gemelos: en esta entrega `ENABLED` (compositor) y `PUBLISHABLE` (lote y móvil) ganan `tiktok`; `NETWORKS` (editor) y `PUBLISHERS` esperan a la entrega 2. `mobile/src/lib/publicar.ts` no cambia.
- Comentarios en el código solo para restricciones que el código no puede mostrar, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Disciplina git: HEAD verificado antes de empezar (`git log --oneline -1` debe mostrar `8743708` o un commit de este plan), jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la ejecución**: la columna es nueva y nullable, el push lo hace el controlador al desplegar.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | la columna `opciones` en `scheduled_post_targets` |
| `src/lib/social/publish/opciones.ts` | tipos, frases fijas, `validarOpciones`, `validarOpcionesPorRed`, `opcionesDesdeFormulario`, `resumenOpciones` |
| `src/lib/social/publish/validate.ts` | reglas de media y formato de TikTok; `extensionDe` |
| `src/lib/social/publish/tiktok-creador.ts` | `consultarCreador` contra `creator_info` y su normalizador puro |
| `src/lib/social/fixtures/tiktok-creator-info.json` | respuesta grabada de `creator_info` |
| `src/lib/social/publish/crear.ts` | `crearPostProgramado` acepta `opciones` |
| `src/app/admin/actions.ts` | `createScheduledPost` lee y valida las opciones; `leerCreadorTikTok` |
| `src/app/admin/(dash)/schedule/tiktok-opciones.tsx` | el bloque cliente de TikTok |
| `src/app/admin/(dash)/schedule/composer.tsx` | habilita TikTok y monta el bloque |
| `src/lib/social/publish/batch.ts` | `BatchItem.opciones`, validación y escritura |
| `src/lib/social/publish/csv.ts` | sexta columna `opciones` |
| `src/app/api/schedule/batch/route.ts` | pasa `opciones` cruda |
| `src/app/admin/(dash)/schedule/[id]/page.tsx`, `editor.tsx` | muestra el resumen de opciones por destino |
| `public/docs/api-editor.md`, `README.md` | documenta `opciones` |

---

### Task 1: La columna y el módulo de opciones

**Files:**
- Modify: `src/db/schema.ts:289-318`
- Create: `src/lib/social/publish/opciones.ts`
- Test: `src/lib/social/publish/opciones.test.ts`

**Interfaces:**
- Produces, de `schema.ts`: `scheduledPostTargets.opciones` (jsonb, nullable).
- Produces, de `opciones.ts`:
  - `type PrivacidadTikTok = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'`
  - `type ComercialTikTok = 'no' | 'marca_propia' | 'patrocinado'`
  - `type OpcionesTikTok = { modo: 'borrador' } | { modo: 'directo'; privacidad: PrivacidadTikTok; comentarios: boolean; duo: boolean; pegar: boolean; comercial: ComercialTikTok }`
  - `type OpcionesDestino = OpcionesTikTok`
  - `PRIVACIDADES_TIKTOK: readonly PrivacidadTikTok[]`, `ETIQUETA_PRIVACIDAD: Record<PrivacidadTikTok, string>`
  - `TIKTOK_SIN_PRIVACIDAD`, `TIKTOK_PATROCINADO_PRIVADO`, `OPCIONES_ERROR`
  - `validarOpciones(network: string, raw: unknown): { opciones: OpcionesDestino | null } | { error: string }`
  - `validarOpcionesPorRed(networks: string[], raw: Record<string, unknown>): { opciones: Record<string, OpcionesDestino> } | { error: string }`
  - `opcionesDesdeFormulario(formData: FormData, networks: string[]): Record<string, unknown>`
  - `resumenOpciones(network: string, opciones: unknown): string | null`

- [ ] **Step 1: Escribe el test que falla**

`src/lib/social/publish/opciones.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  OPCIONES_ERROR,
  TIKTOK_PATROCINADO_PRIVADO,
  TIKTOK_SIN_PRIVACIDAD,
  opcionesDesdeFormulario,
  resumenOpciones,
  validarOpciones,
  validarOpcionesPorRed,
} from './opciones'

const directo = {
  modo: 'directo',
  privacidad: 'SELF_ONLY',
  comentarios: true,
  duo: false,
  pegar: false,
  comercial: 'no',
}

describe('validarOpciones para tiktok', () => {
  it('acepta el modo directo completo', () => {
    expect(validarOpciones('tiktok', directo)).toEqual({ opciones: directo })
  })

  it('acepta el borrador y descarta lo demás', () => {
    expect(validarOpciones('tiktok', { modo: 'borrador', privacidad: 'SELF_ONLY', comentarios: true })).toEqual({
      opciones: { modo: 'borrador' },
    })
  })

  it('sin opciones: la frase apunta a la privacidad, que es lo que falta casi siempre', () => {
    expect(validarOpciones('tiktok', undefined)).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', null)).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('directo sin privacidad o con una desconocida', () => {
    expect(validarOpciones('tiktok', { ...directo, privacidad: undefined })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', { ...directo, privacidad: '' })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
    expect(validarOpciones('tiktok', { ...directo, privacidad: 'PRIVADO' })).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('las casillas ausentes valen false', () => {
    expect(validarOpciones('tiktok', { modo: 'directo', privacidad: 'PUBLIC_TO_EVERYONE' })).toEqual({
      opciones: {
        modo: 'directo',
        privacidad: 'PUBLIC_TO_EVERYONE',
        comentarios: false,
        duo: false,
        pegar: false,
        comercial: 'no',
      },
    })
  })

  it('patrocinado no puede ser privado', () => {
    expect(validarOpciones('tiktok', { ...directo, comercial: 'patrocinado' })).toEqual({
      error: TIKTOK_PATROCINADO_PRIVADO,
    })
    expect(
      validarOpciones('tiktok', { ...directo, privacidad: 'FOLLOWER_OF_CREATOR', comercial: 'patrocinado' }),
    ).toEqual({
      opciones: { ...directo, privacidad: 'FOLLOWER_OF_CREATOR', comercial: 'patrocinado' },
    })
  })

  it('rechaza la forma que no entiende', () => {
    expect(validarOpciones('tiktok', 'directo')).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', ['directo'])).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { privacidad: 'SELF_ONLY' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { modo: 'programado' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { ...directo, comentarios: 'sí' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('tiktok', { ...directo, comercial: 'ads' })).toEqual({ error: OPCIONES_ERROR })
  })

  it('rechaza un objeto desmedido', () => {
    expect(validarOpciones('tiktok', { ...directo, relleno: 'x'.repeat(2000) })).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('validarOpciones para otras redes', () => {
  it('sin opciones es null; con opciones es error', () => {
    expect(validarOpciones('instagram', undefined)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', null)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', { modo: 'directo' })).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('validarOpcionesPorRed', () => {
  it('devuelve solo las redes con opciones', () => {
    expect(validarOpcionesPorRed(['instagram', 'tiktok'], { tiktok: directo })).toEqual({
      opciones: { tiktok: directo },
    })
    expect(validarOpcionesPorRed(['instagram'], {})).toEqual({ opciones: {} })
  })

  it('una red pedida sin sus opciones falla con su frase', () => {
    expect(validarOpcionesPorRed(['tiktok'], {})).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
  })

  it('ignora opciones de redes que no están en la fila', () => {
    expect(validarOpcionesPorRed(['instagram'], { tiktok: directo })).toEqual({ opciones: {} })
  })
})

describe('opcionesDesdeFormulario', () => {
  function form(entries: Record<string, string>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(entries)) fd.set(k, v)
    return fd
  }

  it('arma el objeto de tiktok desde los campos del compositor', () => {
    const fd = form({
      tiktokModo: 'directo',
      tiktokPrivacidad: 'SELF_ONLY',
      tiktokComentarios: 'on',
      tiktokComercial: 'marca_propia',
    })
    expect(opcionesDesdeFormulario(fd, ['tiktok'])).toEqual({
      tiktok: {
        modo: 'directo',
        privacidad: 'SELF_ONLY',
        comentarios: true,
        duo: false,
        pegar: false,
        comercial: 'marca_propia',
      },
    })
  })

  it('en borrador solo viaja el modo', () => {
    expect(opcionesDesdeFormulario(form({ tiktokModo: 'borrador', tiktokPrivacidad: 'SELF_ONLY' }), ['tiktok'])).toEqual({
      tiktok: { modo: 'borrador' },
    })
  })

  it('sin tiktok entre las redes no produce nada', () => {
    expect(opcionesDesdeFormulario(form({ tiktokModo: 'directo' }), ['instagram'])).toEqual({})
  })

  it('con tiktok y sin campos, la privacidad va vacía para que la validación hable', () => {
    expect(opcionesDesdeFormulario(form({}), ['tiktok'])).toEqual({
      tiktok: { modo: 'directo', privacidad: '', comentarios: false, duo: false, pegar: false, comercial: 'no' },
    })
  })
})

describe('resumenOpciones', () => {
  it('resume el directo y el borrador en una línea', () => {
    expect(resumenOpciones('tiktok', directo)).toBe('Directo · Solo yo · con comentarios · sin dúo · sin pegar · sin comercial')
    expect(
      resumenOpciones('tiktok', { ...directo, privacidad: 'PUBLIC_TO_EVERYONE', duo: true, comercial: 'patrocinado' }),
    ).toBe('Directo · Todos · con comentarios · con dúo · sin pegar · patrocinado')
    expect(resumenOpciones('tiktok', { modo: 'borrador' })).toBe('Borrador a tu bandeja de TikTok')
  })

  it('nada que resumir da null', () => {
    expect(resumenOpciones('tiktok', null)).toBeNull()
    expect(resumenOpciones('instagram', { modo: 'directo' })).toBeNull()
    expect(resumenOpciones('tiktok', 'basura')).toBeNull()
  })
})
```

- [ ] **Step 2: Corre el test y confirma que falla**

Run: `npx vitest run src/lib/social/publish/opciones.test.ts`
Expected: FAIL, `Failed to resolve import "./opciones"`.

- [ ] **Step 3: Agrega la columna**

En `src/db/schema.ts`, dentro de `scheduledPostTargets`, después de `lastError`:

```ts
    lastError: text('last_error'),
    // Lo que la red exige elegir por destino antes de publicar (TikTok: modo, privacidad,
    // interacciones, comercial). Null en las redes que no piden nada. La forma la valida
    // `lib/social/publish/opciones`; el editor la muestra pero no la cambia.
    opciones: jsonb('opciones'),
```

`jsonb` ya está importado en ese archivo (lo usa `atributos`).

- [ ] **Step 4: Escribe el módulo**

`src/lib/social/publish/opciones.ts`:

```ts
// Lo que cada red obliga a elegir por destino antes de publicar. Hoy solo TikTok pide
// algo; la unión crece red por red y el resto del sistema solo transporta el objeto.

export type PrivacidadTikTok = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
export type ComercialTikTok = 'no' | 'marca_propia' | 'patrocinado'

export type OpcionesTikTok =
  | { modo: 'borrador' }
  | {
      modo: 'directo'
      privacidad: PrivacidadTikTok
      comentarios: boolean
      duo: boolean
      pegar: boolean
      comercial: ComercialTikTok
    }

export type OpcionesDestino = OpcionesTikTok

export const PRIVACIDADES_TIKTOK: readonly PrivacidadTikTok[] = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
]

export const ETIQUETA_PRIVACIDAD: Record<PrivacidadTikTok, string> = {
  PUBLIC_TO_EVERYONE: 'Todos',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos mutuos',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  SELF_ONLY: 'Solo yo',
}

const COMERCIALES: readonly ComercialTikTok[] = ['no', 'marca_propia', 'patrocinado']

export const TIKTOK_SIN_PRIVACIDAD = 'TikTok necesita que elijas la privacidad.'
export const TIKTOK_PATROCINADO_PRIVADO = 'Un contenido patrocinado no puede ser privado.'
export const OPCIONES_ERROR = 'Las opciones de la red no se entendieron.'

const MAX_SERIALIZED = 2000

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function esPrivacidad(value: unknown): value is PrivacidadTikTok {
  return typeof value === 'string' && (PRIVACIDADES_TIKTOK as readonly string[]).includes(value)
}

/** Ausente vale false; cualquier cosa que no sea booleano es un error de forma. */
function casilla(value: unknown): boolean | null {
  if (value === undefined) return false
  return typeof value === 'boolean' ? value : null
}

function validarTikTok(raw: unknown): { opciones: OpcionesTikTok } | { error: string } {
  if (raw === undefined || raw === null) return { error: TIKTOK_SIN_PRIVACIDAD }
  if (!esObjeto(raw)) return { error: OPCIONES_ERROR }
  if (JSON.stringify(raw).length > MAX_SERIALIZED) return { error: OPCIONES_ERROR }

  if (raw.modo === 'borrador') return { opciones: { modo: 'borrador' } }
  if (raw.modo !== 'directo') return { error: OPCIONES_ERROR }

  if (!esPrivacidad(raw.privacidad)) return { error: TIKTOK_SIN_PRIVACIDAD }
  const comentarios = casilla(raw.comentarios)
  const duo = casilla(raw.duo)
  const pegar = casilla(raw.pegar)
  if (comentarios === null || duo === null || pegar === null) return { error: OPCIONES_ERROR }
  const comercial = raw.comercial === undefined ? 'no' : raw.comercial
  if (!(COMERCIALES as readonly unknown[]).includes(comercial)) return { error: OPCIONES_ERROR }
  if (comercial === 'patrocinado' && raw.privacidad === 'SELF_ONLY') {
    return { error: TIKTOK_PATROCINADO_PRIVADO }
  }

  return {
    opciones: {
      modo: 'directo',
      privacidad: raw.privacidad,
      comentarios,
      duo,
      pegar,
      comercial: comercial as ComercialTikTok,
    },
  }
}

/**
 * Las opciones de un destino, ya limpias, o la frase que explica qué falta. Una red que
 * no pide nada solo acepta no recibir nada.
 */
export function validarOpciones(
  network: string,
  raw: unknown,
): { opciones: OpcionesDestino | null } | { error: string } {
  if (network === 'tiktok') return validarTikTok(raw)
  if (raw === undefined || raw === null) return { opciones: null }
  return { error: OPCIONES_ERROR }
}

/** Para una fila entera: un objeto por red pedida, solo con las que tienen opciones. */
export function validarOpcionesPorRed(
  networks: string[],
  raw: Record<string, unknown>,
): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const opciones: Record<string, OpcionesDestino> = {}
  for (const network of networks) {
    const check = validarOpciones(network, raw[network])
    if ('error' in check) return check
    if (check.opciones) opciones[network] = check.opciones
  }
  return { opciones }
}

/**
 * Lo que el compositor manda, tal cual, listo para `validarOpcionesPorRed`. Con TikTok
 * marcado y sin campos, la privacidad viaja vacía a propósito: así la validación
 * responde con la frase de la privacidad y no con la de la forma.
 */
export function opcionesDesdeFormulario(formData: FormData, networks: string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  if (networks.includes('tiktok')) {
    const modo = String(formData.get('tiktokModo') ?? 'directo')
    raw.tiktok =
      modo === 'borrador'
        ? { modo: 'borrador' }
        : {
            modo: 'directo',
            privacidad: String(formData.get('tiktokPrivacidad') ?? ''),
            comentarios: formData.get('tiktokComentarios') === 'on',
            duo: formData.get('tiktokDuo') === 'on',
            pegar: formData.get('tiktokPegar') === 'on',
            comercial: String(formData.get('tiktokComercial') ?? 'no'),
          }
  }
  return raw
}

/** Una línea para el editor y el calendario; null cuando no hay nada legible. */
export function resumenOpciones(network: string, opciones: unknown): string | null {
  if (network !== 'tiktok') return null
  const check = validarTikTok(opciones)
  if ('error' in check) return null
  const o = check.opciones
  if (o.modo === 'borrador') return 'Borrador a tu bandeja de TikTok'
  const comercial =
    o.comercial === 'no' ? 'sin comercial' : o.comercial === 'marca_propia' ? 'marca propia' : 'patrocinado'
  return [
    'Directo',
    ETIQUETA_PRIVACIDAD[o.privacidad],
    o.comentarios ? 'con comentarios' : 'sin comentarios',
    o.duo ? 'con dúo' : 'sin dúo',
    o.pegar ? 'con pegar' : 'sin pegar',
    comercial,
  ].join(' · ')
}
```

- [ ] **Step 5: Corre el test y confirma que pasa**

Run: `npx vitest run src/lib/social/publish/opciones.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/db/schema.ts src/lib/social/publish/opciones.ts src/lib/social/publish/opciones.test.ts
git commit -m "Agrega las opciones por destino y su validación para TikTok

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 2: Las reglas de media de TikTok en el validador

**Files:**
- Modify: `src/lib/social/publish/validate.ts`
- Test: `src/lib/social/publish/validate.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces, de `validate.ts`: `ScheduleDraft.formats?: string[]` (extensiones en minúscula, una por archivo, `''` cuando no se conoce), `TIKTOK_MEDIA`, `TIKTOK_MAX_FOTOS = 35`, `extensionDe(nombreOUrl: string): string`.

- [ ] **Step 1: Escribe los tests que fallan**

Al final de `src/lib/social/publish/validate.test.ts`:

```ts
import { TIKTOK_MEDIA, extensionDe } from './validate'

describe('extensionDe', () => {
  it('lee la extensión de un nombre o una URL, sin querystring, en minúscula', () => {
    expect(extensionDe('clip.MP4')).toBe('mp4')
    expect(extensionDe('https://ej.com/a.JPG?x=1')).toBe('jpg')
    expect(extensionDe('https://drive.google.com/uc?id=abc')).toBe('')
    expect(extensionDe('sin-extension')).toBe('')
  })
})

describe('validación por destino (TikTok)', () => {
  const tt = { ...base, networks: ['tiktok'] }

  it('acepta un video solo', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['mp4'] }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['mov'] }, now)).toBeNull()
  })

  it('acepta de una a treinta y cinco fotos', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['jpg'] }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 35, formats: Array(35).fill('webp') }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 36 }, now)).toBe(TIKTOK_MEDIA)
  })

  it('el tope de diez sigue rigiendo si otra red acompaña', () => {
    expect(validateScheduleDraft({ ...tt, networks: ['tiktok', 'instagram'], imageCount: 11 }, now)).toMatch(/diez/)
  })

  it('rechaza cero archivos, dos videos y la mezcla', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 0 }, now)).toMatch(/archivo/)
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 2 }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, videoCount: 1 }, now)).toBe(TIKTOK_MEDIA)
  })

  it('rechaza los formatos que TikTok no toma, y difiere los desconocidos', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['png'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['gif'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['avi'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: [''] }, now)).toBeNull()
  })

  it('los formatos no molestan a las demás redes', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 1, formats: ['png'] }, now)).toBeNull()
  })

  it('el caption de TikTok llega hasta 2200', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, caption: 'x'.repeat(2200) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 1, caption: 'x'.repeat(2201) }, now)).toMatch(/largo/)
  })
})
```

Mueve el `import { TIKTOK_MEDIA, extensionDe } from './validate'` arriba, junto al import existente (un solo import de `./validate`).

- [ ] **Step 2: Corre los tests y confirma que fallan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts`
Expected: FAIL, `TIKTOK_MEDIA` y `extensionDe` no exportados.

- [ ] **Step 3: Implementa**

En `src/lib/social/publish/validate.ts`:

```ts
export type ScheduleDraft = {
  caption: string
  imageCount: number
  videoCount: number
  networks: string[]
  scheduledAt: Date | null
  /**
   * Extensión de cada archivo en minúscula, `''` si no se conoce (una URL de Drive).
   * Solo TikTok la mira: es la única red que rechaza formatos que las demás aceptan.
   */
  formats?: string[]
}

export const MAX_CAROUSEL_ITEMS = 10
export const MAX_CAPTION_LENGTH = 2200
export const X_CAPTION_LIMIT = 280
export const THREADS_CAPTION_LIMIT = 500
export const TIKTOK_MAX_FOTOS = 35
export const TIKTOK_MEDIA = 'TikTok recibe un video, o hasta 35 fotos JPG o WebP.'

// Text-first networks publish with no file at all; these three never can.
const MEDIA_REQUIRED = new Set(['instagram', 'youtube', 'tiktok'])

const TIKTOK_VIDEO = new Set(['mp4', 'mov', 'webm'])
const TIKTOK_FOTO = new Set(['jpg', 'jpeg', 'webp'])

/** La extensión de un nombre de archivo o una URL, sin querystring, en minúscula. */
export function extensionDe(nombreOUrl: string): string {
  const path = nombreOUrl.split('?')[0] ?? ''
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  return dot === -1 ? '' : last.slice(dot + 1).toLowerCase()
}

function tiktokMediaError(draft: ScheduleDraft): string | null {
  if (draft.videoCount > 1) return TIKTOK_MEDIA
  if (draft.videoCount === 1 && draft.imageCount > 0) return TIKTOK_MEDIA
  if (draft.imageCount > TIKTOK_MAX_FOTOS) return TIKTOK_MEDIA
  const permitidos = draft.videoCount === 1 ? TIKTOK_VIDEO : TIKTOK_FOTO
  for (const f of draft.formats ?? []) {
    // Extensión desconocida: el content-type de la descarga decide y re-valida.
    if (f !== '' && !permitidos.has(f)) return TIKTOK_MEDIA
  }
  return null
}
```

Y dentro de `validateScheduleDraft`, reemplaza la frase de media obligatoria y el tope de diez:

```ts
  const files = draft.imageCount + draft.videoCount
  if (files === 0 && draft.networks.some((n) => MEDIA_REQUIRED.has(n))) {
    return 'Instagram, YouTube y TikTok necesitan al menos un archivo.'
  }
  if (files === 0 && draft.caption.length === 0) {
    return 'Escribe un texto o adjunta un archivo.'
  }
  if (draft.networks.includes('tiktok')) {
    const error = tiktokMediaError(draft)
    if (error) return error
  }
  if (draft.networks.includes('x') && draft.videoCount > 0) {
    return 'X aún no recibe video desde el calendario.'
  }
  if (draft.networks.includes('x') && draft.imageCount > 4) {
    return 'X recibe hasta cuatro imágenes.'
  }
  if (draft.networks.includes('threads') && files > 1) {
    return 'Threads recibe un solo archivo por post.'
  }
  // TikTok sola llega a 35 fotos; cualquier otra red de compañía vuelve a imponer diez.
  if (files > MAX_CAROUSEL_ITEMS && draft.networks.some((n) => n !== 'tiktok')) {
    return 'Máximo diez archivos por publicación.'
  }
```

El resto de la función queda igual.

- [ ] **Step 4: Corre los tests y confirma que pasan**

Run: `npx vitest run src/lib/social/publish/validate.test.ts src/lib/social/publish/batch.test.ts src/lib/mobile-api.test.ts`
Expected: PASS. Si algún test viejo esperaba la frase exacta «Instagram y YouTube necesitan…», cámbialo a un `toMatch(/archivo/)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/validate.ts src/lib/social/publish/validate.test.ts
git commit -m "Valida la media y los formatos que TikTok acepta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 3: `creator_info` — el módulo y su acción de servidor

**Files:**
- Create: `src/lib/social/publish/tiktok-creador.ts`
- Create: `src/lib/social/fixtures/tiktok-creator-info.json`
- Test: `src/lib/social/publish/tiktok-creador.test.ts`
- Modify: `src/app/admin/actions.ts` (agregar `leerCreadorTikTok`)

**Interfaces:**
- Consumes: `tiktokConnector.ensureCredential` de `src/lib/social/tiktok.ts:57`; `cuentasPrimarias` de `src/lib/social/cuentas.ts`; `PrivacidadTikTok` de la Task 1.
- Produces, de `tiktok-creador.ts`:
  - `type CreadorTikTok = { nombre: string; avatarUrl: string | null; privacidades: PrivacidadTikTok[]; comentariosDeshabilitados: boolean; duoDeshabilitado: boolean; pegarDeshabilitado: boolean; maxDuracionSeg: number | null }`
  - `TIKTOK_RECONECTAR`, `TIKTOK_CREADOR_ILEGIBLE`, `TIKTOK_SIN_CUENTA`
  - `normalizarCreador(data: unknown): CreadorTikTok | null`
  - `consultarCreador(token: string): Promise<{ creador: CreadorTikTok } | { error: string }>`
- Produces, de `actions.ts`: `leerCreadorTikTok(): Promise<{ creador: CreadorTikTok } | { error: string }>`.

- [ ] **Step 1: Graba la fixture**

`src/lib/social/fixtures/tiktok-creator-info.json`:

```json
{
  "data": {
    "creator_avatar_url": "https://p16.tiktokcdn.com/avatar.jpeg",
    "creator_username": "ribs",
    "creator_nickname": "Ribs",
    "privacy_level_options": ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
    "comment_disabled": false,
    "duet_disabled": true,
    "stitch_disabled": false,
    "max_video_post_duration_sec": 600
  },
  "error": { "code": "ok", "message": "", "log_id": "2026091500000000000000000000000000" }
}
```

- [ ] **Step 2: Escribe el test que falla**

`src/lib/social/publish/tiktok-creador.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/tiktok-creator-info.json'
import {
  TIKTOK_CREADOR_ILEGIBLE,
  TIKTOK_RECONECTAR,
  consultarCreador,
  normalizarCreador,
} from './tiktok-creador'

describe('normalizarCreador', () => {
  it('mapea nombre, avatar, privacidades y qué interacciones están bloqueadas', () => {
    expect(normalizarCreador(fixture.data)).toEqual({
      nombre: 'Ribs',
      avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
      privacidades: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      comentariosDeshabilitados: false,
      duoDeshabilitado: true,
      pegarDeshabilitado: false,
      maxDuracionSeg: 600,
    })
  })

  it('cae al username si no hay nickname, y filtra privacidades que no conoce', () => {
    expect(
      normalizarCreador({ ...fixture.data, creator_nickname: '', privacy_level_options: ['SELF_ONLY', 'RARA'] }),
    ).toMatchObject({ nombre: 'ribs', privacidades: ['SELF_ONLY'] })
  })

  it('sin privacidades no hay creador utilizable', () => {
    expect(normalizarCreador({ ...fixture.data, privacy_level_options: [] })).toBeNull()
    expect(normalizarCreador(null)).toBeNull()
    expect(normalizarCreador('x')).toBeNull()
  })
})

describe('consultarCreador', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respond(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
    )
  }

  it('devuelve el creador normalizado y llama al endpoint con el bearer', async () => {
    respond(200, fixture)
    const result = await consultarCreador('tok')
    expect(result).toEqual({ creador: normalizarCreador(fixture.data) })
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(call[0]).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/')
    expect((call[1] as RequestInit).method).toBe('POST')
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('un scope no autorizado pide reconectar', async () => {
    respond(401, { error: { code: 'scope_not_authorized', message: 'x', log_id: '1' } })
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_RECONECTAR })
  })

  it('cualquier otro tropiezo es ilegible, sin filtrar el texto de TikTok', async () => {
    respond(500, { error: { code: 'internal_error', message: 'boom', log_id: '1' } })
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
  })
})
```

- [ ] **Step 3: Corre el test y confirma que falla**

Run: `npx vitest run src/lib/social/publish/tiktok-creador.test.ts`
Expected: FAIL, `Failed to resolve import "./tiktok-creador"`.

- [ ] **Step 4: Escribe el módulo**

`src/lib/social/publish/tiktok-creador.ts`:

```ts
// `creator_info` es la consulta que TikTok exige antes de cada publicación directa: dice
// qué privacidades puede elegir el dueño hoy y qué interacciones tiene bloqueadas. La usa
// el compositor para armar el bloque, y el publisher (entrega 2) para confirmar antes de
// subir.
import { PRIVACIDADES_TIKTOK, type PrivacidadTikTok } from './opciones'

const API = 'https://open.tiktokapis.com/v2'

export type CreadorTikTok = {
  nombre: string
  avatarUrl: string | null
  privacidades: PrivacidadTikTok[]
  comentariosDeshabilitados: boolean
  duoDeshabilitado: boolean
  pegarDeshabilitado: boolean
  maxDuracionSeg: number | null
}

export const TIKTOK_RECONECTAR = 'Reconecta TikTok para autorizar la publicación.'
export const TIKTOK_CREADOR_ILEGIBLE = 'No pude leer tu cuenta de TikTok.'
export const TIKTOK_SIN_CUENTA = 'Conecta TikTok en Cuentas antes de programar.'

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Null si TikTok no devolvió ninguna privacidad elegible: sin eso no hay qué mostrar. */
export function normalizarCreador(data: unknown): CreadorTikTok | null {
  if (!esObjeto(data)) return null
  const opciones = Array.isArray(data.privacy_level_options) ? data.privacy_level_options : []
  const privacidades = opciones.filter((p): p is PrivacidadTikTok =>
    (PRIVACIDADES_TIKTOK as readonly unknown[]).includes(p),
  )
  if (privacidades.length === 0) return null
  const nickname = typeof data.creator_nickname === 'string' ? data.creator_nickname : ''
  const username = typeof data.creator_username === 'string' ? data.creator_username : ''
  return {
    nombre: nickname || username,
    avatarUrl: typeof data.creator_avatar_url === 'string' && data.creator_avatar_url ? data.creator_avatar_url : null,
    privacidades,
    comentariosDeshabilitados: data.comment_disabled === true,
    duoDeshabilitado: data.duet_disabled === true,
    pegarDeshabilitado: data.stitch_disabled === true,
    maxDuracionSeg: typeof data.max_video_post_duration_sec === 'number' ? data.max_video_post_duration_sec : null,
  }
}

export async function consultarCreador(token: string): Promise<{ creador: CreadorTikTok } | { error: string }> {
  let response: Response
  try {
    response = await fetch(`${API}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    })
  } catch (error) {
    console.error('TikTok creator_info:', String(error).slice(0, 300))
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }

  let body: { data?: unknown; error?: { code?: string; message?: string } } = {}
  try {
    body = (await response.json()) as typeof body
  } catch {
    // Sin JSON no hay código que leer; el status decide abajo.
  }
  const code = body.error?.code ?? 'ok'
  if (code === 'scope_not_authorized' || code === 'access_token_invalid') return { error: TIKTOK_RECONECTAR }
  if (!response.ok || code !== 'ok') {
    console.error('TikTok creator_info:', response.status, code, String(body.error?.message ?? '').slice(0, 300))
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }
  const creador = normalizarCreador(body.data)
  if (!creador) {
    console.error('TikTok creator_info sin privacidades:', JSON.stringify(body.data).slice(0, 300))
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }
  return { creador }
}
```

- [ ] **Step 5: Corre el test y confirma que pasa**

Run: `npx vitest run src/lib/social/publish/tiktok-creador.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: La acción de servidor**

En `src/app/admin/actions.ts`, junto a los imports existentes:

```ts
import { tiktokConnector } from '@/lib/social/tiktok'
import { cuentasPrimarias } from '@/lib/social/cuentas'
import { TIKTOK_SIN_CUENTA, consultarCreador, type CreadorTikTok } from '@/lib/social/publish/tiktok-creador'
```

(`socialAccounts` y `eq` ya están importados.) Y en la sección `scheduling`, antes de `createScheduledPost`:

```ts
/**
 * Lo que el bloque de TikTok del compositor necesita al abrirse: nombre, avatar y qué
 * privacidades puede elegir el dueño hoy. Por la cuenta primaria de TikTok, la misma a
 * la que `crearPostProgramado` va a apuntar el destino.
 */
export async function leerCreadorTikTok(): Promise<{ creador: CreadorTikTok } | { error: string }> {
  await requireAuth()
  const cuentas = await cuentasPrimarias(['tiktok'])
  const id = cuentas.get('tiktok')
  if (!id) return { error: TIKTOK_SIN_CUENTA }
  const [account] = await getDb().select().from(socialAccounts).where(eq(socialAccounts.id, id))
  const token = account ? await tiktokConnector.ensureCredential(account) : null
  if (!token) return { error: TIKTOK_SIN_CUENTA }
  return consultarCreador(token)
}
```

Si `ensureCredential` no existe como método directo en `tiktokConnector` (revisa `src/lib/social/tiktok.ts:57-106`: es un método del objeto `Connector`), llámalo como `tiktokConnector.ensureCredential!(account)` solo si el tipo lo declara opcional; si lo declara obligatorio, sin `!`.

- [ ] **Step 7: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add src/lib/social/publish/tiktok-creador.ts src/lib/social/publish/tiktok-creador.test.ts src/lib/social/fixtures/tiktok-creator-info.json src/app/admin/actions.ts
git commit -m "Consulta creator_info de TikTok para el compositor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 4: El compositor guarda las opciones

**Files:**
- Modify: `src/lib/social/publish/crear.ts`
- Modify: `src/app/admin/actions.ts:462-493` (`createScheduledPost`)

**Interfaces:**
- Consumes: `validarOpcionesPorRed`, `opcionesDesdeFormulario`, `OpcionesDestino` (Task 1); `extensionDe` (Task 2).
- Produces, de `crear.ts`: `crearPostProgramado(input: { caption; scheduledAt; media; networks; opciones?: Record<string, OpcionesDestino> })`.

- [ ] **Step 1: `crearPostProgramado` acepta y escribe opciones**

`src/lib/social/publish/crear.ts`:

```ts
import { getDb, scheduledPostMedia, scheduledPosts, scheduledPostTargets } from '@/db'
import { exigirCuentas } from '../cuentas'
import type { OpcionesDestino } from './opciones'

export type MediaSubida = { url: string; mediaType: 'image' | 'video' }

/**
 * Las tres inserciones de un post programado, en el orden que el resto del sistema
 * espera: el post, su media en posición de carrusel, y un target por red con lo que esa
 * red exigió elegir. Compartido por el compositor web y la ruta móvil para que ambos
 * escriban exactamente lo mismo. La media ya vive en el almacén: subirla es problema de
 * quien llama. Las opciones llegan ya validadas por `validarOpcionesPorRed`.
 *
 * Lanza `SinCuenta` si una red no tiene cuenta conectada; el llamador la traduce a su
 * frase.
 */
export async function crearPostProgramado(input: {
  caption: string
  scheduledAt: Date
  media: MediaSubida[]
  networks: string[]
  opciones?: Record<string, OpcionesDestino>
}): Promise<string> {
  const db = getDb()
  // Antes de escribir nada: un post sin cuenta a la que salir no debe quedar a medias.
  const cuentas = await exigirCuentas(input.networks)
  const [post] = await db
    .insert(scheduledPosts)
    .values({ caption: input.caption, scheduledAt: input.scheduledAt })
    .returning()
  if (input.media.length > 0) {
    await db.insert(scheduledPostMedia).values(
      input.media.map((m, position) => ({
        postId: post!.id,
        blobUrl: m.url,
        mediaType: m.mediaType,
        position,
      })),
    )
  }
  await db.insert(scheduledPostTargets).values(
    input.networks.map((network) => ({
      postId: post!.id,
      network,
      accountId: cuentas.get(network)!,
      opciones: input.opciones?.[network] ?? null,
    })),
  )
  return post!.id
}
```

- [ ] **Step 2: La acción lee, valida y pasa las opciones**

En `src/app/admin/actions.ts`, imports:

```ts
import { opcionesDesdeFormulario, validarOpcionesPorRed } from '@/lib/social/publish/opciones'
import { extensionDe } from '@/lib/social/publish/validate'
```

(Si `validateScheduleDraft` ya se importa de `@/lib/social/publish/validate`, súmale `extensionDe` al mismo import.)

`createScheduledPost` queda:

```ts
export async function createScheduledPost(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAuth()

  const caption = String(formData.get('caption') ?? '').trim()
  const networks = formData.getAll('networks').map(String)
  const scheduledAt = fromZonedInput(String(formData.get('scheduledAt') ?? ''), SITE_TIMEZONE)
  const files = formData.getAll('media').filter((f): f is File => f instanceof File && f.size > 0)

  const videoCount = files.filter((f) => f.type.startsWith('video/')).length
  const error = validateScheduleDraft(
    {
      caption,
      imageCount: files.length - videoCount,
      videoCount,
      networks,
      scheduledAt,
      formats: files.map((f) => extensionDe(f.name)),
    },
    new Date(),
  )
  if (error) return { error }

  // Lo que la red exige por destino, antes de subir nada: una privacidad sin elegir no
  // debe costar la subida de un video.
  const opcionesCheck = validarOpcionesPorRed(networks, opcionesDesdeFormulario(formData, networks))
  if ('error' in opcionesCheck) return { error: opcionesCheck.error }

  const uploaded: Array<{ url: string; mediaType: 'image' | 'video' }> = []
  for (const file of files) {
    // Público a propósito: la Graph API de Instagram descarga la media desde esta URL.
    const url = await guardar(`scheduled/${randomUUID()}-${file.name}`, file, tipoArchivo(file))
    uploaded.push({ url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
  }

  try {
    await crearPostProgramado({
      caption,
      scheduledAt: scheduledAt!,
      media: uploaded,
      networks,
      opciones: opcionesCheck.opciones,
    })
  } catch (error) {
    if (error instanceof SinCuenta) return { error: error.message }
    throw error
  }

  revalidatePath('/admin/schedule')
  return { ok: true }
}
```

- [ ] **Step 3: Typecheck, tests y commit**

Run: `npm run typecheck && npx vitest run src/lib/mobile-api.test.ts`
Expected: sin errores; la ruta móvil sigue llamando a `crearPostProgramado` sin `opciones` y compila porque es opcional.

```bash
git add src/lib/social/publish/crear.ts src/app/admin/actions.ts
git commit -m "Guarda las opciones de TikTok al programar desde el compositor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 5: El bloque de TikTok en el compositor

**Files:**
- Create: `src/app/admin/(dash)/schedule/tiktok-opciones.tsx`
- Modify: `src/app/admin/(dash)/schedule/composer.tsx`

**Interfaces:**
- Consumes: `leerCreadorTikTok` (Task 3), `ETIQUETA_PRIVACIDAD`, `PRIVACIDADES_TIKTOK`, `PrivacidadTikTok` (Task 1), `Toggle`, `Select`, `Field`, `GroupLabel` de `@/components/ui`.
- Produces: campos de formulario `tiktokModo`, `tiktokPrivacidad`, `tiktokComentarios`, `tiktokDuo`, `tiktokPegar`, `tiktokComercial`, exactamente los que `opcionesDesdeFormulario` lee.

- [ ] **Step 1: Escribe el bloque**

`src/app/admin/(dash)/schedule/tiktok-opciones.tsx`:

```tsx
'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { leerCreadorTikTok } from '@/app/admin/actions'
import { Field, GroupLabel, Select, Toggle } from '@/components/ui'
import type { CreadorTikTok } from '@/lib/social/publish/tiktok-creador'
import { ETIQUETA_PRIVACIDAD, PRIVACIDADES_TIKTOK, type PrivacidadTikTok } from '@/lib/social/publish/opciones'

const MUSIC_USAGE = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
const BRANDED_CONTENT = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

/**
 * Lo que TikTok obliga a preguntar antes de publicar directo, en el orden y con los
 * valores iniciales que su guía exige: privacidad sin elegir, interacciones apagadas,
 * comercial apagado. Cada campo lleva el nombre que `opcionesDesdeFormulario` lee.
 *
 * `soloFotos` esconde dúo y pegar: TikTok no los ofrece en carruseles.
 */
export function TikTokOpciones({ soloFotos }: { soloFotos: boolean }) {
  const [creador, setCreador] = useState<CreadorTikTok | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [borrador, setBorrador] = useState(false)
  const [privacidad, setPrivacidad] = useState<PrivacidadTikTok | ''>('')
  const [comercial, setComercial] = useState(false)
  const [tipoComercial, setTipoComercial] = useState<'marca_propia' | 'patrocinado'>('marca_propia')

  useEffect(() => {
    let vivo = true
    leerCreadorTikTok().then((r) => {
      if (!vivo) return
      if ('error' in r) setAviso(r.error)
      else setCreador(r.creador)
    })
    return () => {
      vivo = false
    }
  }, [])

  // Sin creator_info se ofrecen las cuatro: el cron vuelve a consultar antes de subir y
  // falla con frase propia si la elegida ya no está permitida.
  const privacidades = creador?.privacidades ?? PRIVACIDADES_TIKTOK
  const patrocinado = comercial && tipoComercial === 'patrocinado'
  const patrocinadoPrivado = patrocinado && privacidad === 'SELF_ONLY'

  return (
    <div className="space-y-4 rounded-xl bg-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        {creador?.avatarUrl ? (
          <Image src={creador.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full" />
        ) : null}
        <div>
          <GroupLabel>TikTok</GroupLabel>
          <p className="text-sm">
            {creador ? `Se publicará en la cuenta ${creador.nombre}` : aviso ?? 'Leyendo tu cuenta…'}
          </p>
        </div>
      </div>

      <input type="hidden" name="tiktokModo" value={borrador ? 'borrador' : 'directo'} />
      <Toggle
        label="Enviar como borrador a mi bandeja de TikTok"
        hint={borrador ? 'Te llegará una notificación en TikTok para terminar la publicación desde el teléfono.' : undefined}
        checked={borrador}
        onChange={setBorrador}
      />

      {borrador ? null : (
        <>
          <Field label="Quién puede verlo">
            <Select
              name="tiktokPrivacidad"
              required
              value={privacidad}
              onChange={(e) => setPrivacidad(e.target.value as PrivacidadTikTok | '')}
              className="max-w-[16rem]"
            >
              <option value="" disabled>
                Elige quién puede verlo
              </option>
              {privacidades.map((p) => (
                <option key={p} value={p} disabled={patrocinado && p === 'SELF_ONLY'}>
                  {ETIQUETA_PRIVACIDAD[p]}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <GroupLabel>Permitir</GroupLabel>
            <div className="flex flex-wrap gap-4 text-sm">
              <Casilla name="tiktokComentarios" label="Comentarios" bloqueada={creador?.comentariosDeshabilitados} />
              {soloFotos ? null : (
                <>
                  <Casilla name="tiktokDuo" label="Dúos" bloqueada={creador?.duoDeshabilitado} />
                  <Casilla name="tiktokPegar" label="Pegar (Stitch)" bloqueada={creador?.pegarDeshabilitado} />
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Toggle
              label="Este contenido promociona una marca"
              checked={comercial}
              onChange={setComercial}
            />
            <input type="hidden" name="tiktokComercial" value={comercial ? tipoComercial : 'no'} />
            {comercial ? (
              <div className="ml-12 space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tiktokTipoComercial"
                    checked={tipoComercial === 'marca_propia'}
                    onChange={() => setTipoComercial('marca_propia')}
                  />
                  Mi marca
                  <span className="text-xs text-fg-faint">Se etiquetará como Contenido promocional</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tiktokTipoComercial"
                    checked={tipoComercial === 'patrocinado'}
                    onChange={() => setTipoComercial('patrocinado')}
                  />
                  Contenido patrocinado
                  <span className="text-xs text-fg-faint">Se etiquetará como Colaboración pagada</span>
                </label>
                {patrocinadoPrivado ? (
                  <p className="text-xs text-negative">Un contenido patrocinado no puede ser privado. Elige otra privacidad.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="text-[0.72rem] text-fg-faint">
            {patrocinado ? (
              <>
                Al publicar aceptas la{' '}
                <a href={BRANDED_CONTENT} target="_blank" rel="noreferrer" className="underline">
                  Branded Content Policy
                </a>{' '}
                y la{' '}
                <a href={MUSIC_USAGE} target="_blank" rel="noreferrer" className="underline">
                  Music Usage Confirmation
                </a>{' '}
                de TikTok.
              </>
            ) : (
              <>
                Al publicar aceptas la{' '}
                <a href={MUSIC_USAGE} target="_blank" rel="noreferrer" className="underline">
                  Music Usage Confirmation
                </a>{' '}
                de TikTok.
              </>
            )}{' '}
            Después de publicar, TikTok puede tardar unos minutos en mostrarlo en tu perfil.
          </p>
        </>
      )}
    </div>
  )
}

/** Apagada al nacer; gris y sin enviar si creator_info dice que la cuenta la tiene bloqueada. */
function Casilla({ name, label, bloqueada }: { name: string; label: string; bloqueada?: boolean }) {
  return (
    <label className={bloqueada ? 'flex items-center gap-2 opacity-40' : 'flex items-center gap-2'}>
      <input type="checkbox" name={name} disabled={bloqueada} />
      {label}
    </label>
  )
}
```

`Toggle` de `@/components/ui` ya renderiza un hidden input cuando recibe `name`; aquí no se le pasa `name` porque el modo y el comercial viajan en sus propios hidden inputs con los valores que la validación entiende.

- [ ] **Step 2: Monta el bloque en el compositor**

`src/app/admin/(dash)/schedule/composer.tsx`:

```tsx
'use client'

import { useActionState, useId, useState } from 'react'
import { createScheduledPost } from '@/app/admin/actions'
import { Field, GroupLabel, Input, Submit, Textarea } from '@/components/ui'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'
import { TikTokOpciones } from './tiktok-opciones'

// Twin of PUBLISHABLE (publish/batch.ts) and NETWORKS (schedule/[id]/editor.tsx) —
// update together.
const ENABLED = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])

export function Composer() {
  const [state, action] = useActionState(createScheduledPost, {})
  const captionId = useId()
  const [tiktok, setTiktok] = useState(false)
  const [soloFotos, setSoloFotos] = useState(false)

  return (
    <details
      className="rounded-xl bg-white/[0.03] p-4"
      onToggle={(event) => {
        // `Textarea` solo acepta las props del `<textarea>`, así que no hay `ref` que
        // pasarle; y el campo ya está montado dentro del `<details>`, de modo que
        // `autoFocus` no se dispararía al abrirlo.
        if (event.currentTarget.open) document.getElementById(captionId)?.focus()
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">Programar una publicación</summary>

      <form action={action} className="mt-4 space-y-4">
        <Field label="Texto">
          <Textarea id={captionId} name="caption" rows={4} maxLength={2200} placeholder="Texto del post…" />
        </Field>

        <Field label="Archivos" hint="Imágenes o video, opcional">
          <Input
            type="file"
            name="media"
            multiple
            accept="image/*,video/*"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setSoloFotos(files.length > 0 && files.every((f) => f.type.startsWith('image/')))
            }}
          />
        </Field>

        <div>
          <GroupLabel>Redes</GroupLabel>
          <div className="flex flex-wrap gap-3">
            {SOCIAL_NETWORKS.map((network) => {
              const enabled = ENABLED.has(network)
              return (
                <label
                  key={network}
                  className={cn('flex items-center gap-2 text-sm', !enabled && 'opacity-40')}
                >
                  <input
                    type="checkbox"
                    name="networks"
                    value={network}
                    disabled={!enabled}
                    defaultChecked={network === 'instagram'}
                    onChange={network === 'tiktok' ? (e) => setTiktok(e.target.checked) : undefined}
                  />
                  {networkLabel(network)}
                  {!enabled && <span className="text-xs text-fg-faint">próximamente</span>}
                </label>
              )
            })}
          </div>
        </div>

        {tiktok ? <TikTokOpciones soloFotos={soloFotos} /> : null}

        <Field label="Fecha y hora">
          <Input type="datetime-local" name="scheduledAt" required className="max-w-[16rem]" />
        </Field>

        {state.error && <p className="text-sm text-negative">{state.error}</p>}
        {state.ok && <p className="text-sm text-positive">Programado.</p>}

        <Submit pendingLabel="Guardando…">Programar</Submit>
      </form>
    </details>
  )
}
```

- [ ] **Step 3: Compruébalo en el navegador**

Run: `npm run dev` y abre `/admin/schedule`. Marca TikTok: aparece el bloque con «Leyendo tu cuenta…» y luego el nombre (o la frase de conectar si no hay cuenta). El select nace en «Elige quién puede verlo», las casillas apagadas, el comercial apagado. Enciende «Enviar como borrador»: desaparece todo salvo el aviso. Intenta programar en modo directo sin privacidad: el navegador bloquea el envío por `required`. Elige «Contenido patrocinado» y «Solo yo»: aparece la advertencia y la opción queda gris. Sube solo fotos: dúo y pegar desaparecen.

Si `next/image` rechaza el dominio del avatar de TikTok, agrega `p16-sign*.tiktokcdn*.com` y `p16.tiktokcdn.com` a `images.remotePatterns` en `next.config.ts` con `hostname: '**.tiktokcdn.com'` y `hostname: '**.tiktokcdn-us.com'`; el conector de lectura ya trae portadas de ese CDN, así que revisa primero si el patrón ya existe.

- [ ] **Step 4: Lint, typecheck y commit**

Run: `npm run lint && npm run typecheck`
Expected: sin errores.

```bash
git add "src/app/admin/(dash)/schedule/tiktok-opciones.tsx" "src/app/admin/(dash)/schedule/composer.tsx"
git commit -m "Muestra el bloque de opciones de TikTok en el compositor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

Si tocaste `next.config.ts`, agrégalo al mismo commit.

---

### Task 6: El lote, el CSV y la API aceptan `opciones`

**Files:**
- Modify: `src/lib/social/publish/batch.ts`
- Modify: `src/lib/social/publish/csv.ts`
- Modify: `src/app/api/schedule/batch/route.ts`
- Test: `src/lib/social/publish/batch.test.ts`, `src/lib/social/publish/csv.test.ts`
- Modify: `public/docs/api-editor.md`, `README.md:505-515`

**Interfaces:**
- Consumes: `validarOpcionesPorRed`, `TIKTOK_SIN_PRIVACIDAD`, `OPCIONES_ERROR` (Task 1); `extensionDe`, `TIKTOK_MEDIA` (Task 2).
- Produces: `BatchItem.opciones?: unknown` (objeto por red: `{ "tiktok": { … } }`), `PUBLISHABLE` con `tiktok`, `csvToBatchItems` con sexta columna `opciones`.

- [ ] **Step 1: Escribe los tests que fallan**

Al final de `src/lib/social/publish/batch.test.ts` (y suma `TIKTOK_SIN_PRIVACIDAD`, `OPCIONES_ERROR` de `./opciones` y `TIKTOK_MEDIA` de `./validate` a los imports):

```ts
describe('opciones por red en el lote', () => {
  const directo = { modo: 'directo', privacidad: 'SELF_ONLY' }

  it('tiktok es publicable, pero exige sus opciones', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem(fila, now)).toBe(TIKTOK_SIN_PRIVACIDAD)
    expect(validateBatchItem({ ...fila, opciones: { tiktok: directo } }, now)).toBeNull()
    expect(validateBatchItem({ ...fila, opciones: { tiktok: { modo: 'borrador' } } }, now)).toBeNull()
  })

  it('las opciones malformadas caen con la frase de forma', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: 'directo' }, now)).toBe(OPCIONES_ERROR)
    expect(validateBatchItem({ ...fila, opciones: { tiktok: { modo: 'ya' } } }, now)).toBe(OPCIONES_ERROR)
  })

  it('una red que no pide opciones no las acepta', () => {
    expect(validateBatchItem({ ...base, opciones: { threads: { modo: 'directo' } } }, now)).toBe(OPCIONES_ERROR)
  })

  it('la media de tiktok se valida por extensión antes de descargar', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], opciones: { tiktok: directo }, media: [] }
    expect(validateBatchItem({ ...fila, media: ['https://ej.com/a.png'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateBatchItem({ ...fila, media: ['https://ej.com/a.mp4', 'https://ej.com/b.jpg'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateBatchItem({ ...fila, media: ['https://drive.google.com/uc?id=x'] }, now)).toBeNull()
  })
})
```

Ajusta el test existente `rechaza redes desconocidas o sin publisher`: `tiktok` ya no es un ejemplo de red sin publicación; deja solo `myspace` (o usa `linkedin`).

Al final de `src/lib/social/publish/csv.test.ts`:

```ts
describe('opciones en el CSV', () => {
  it('la sexta columna trae un JSON por red; celda vacía es sin opciones', () => {
    const text = [
      'fecha,texto,redes,media,portada,opciones',
      '2026-09-16 10:00,Directo,tiktok,https://ej.com/a.mp4,,"{""tiktok"":{""modo"":""directo"",""privacidad"":""SELF_ONLY""}}"',
      '2026-09-16 11:00,Sin opciones,threads,,,',
    ].join('\n')
    const result = csvToBatchItems(text)
    expect(result).toMatchObject({
      items: [
        { redes: ['tiktok'], opciones: { tiktok: { modo: 'directo', privacidad: 'SELF_ONLY' } } },
        { redes: ['threads'], opciones: undefined },
      ],
    })
  })

  it('un JSON roto viaja como texto para que la validación lo rechace con su frase', () => {
    const result = csvToBatchItems('fecha,texto,redes,media,portada,opciones\n2026-09-16 10:00,x,tiktok,,,{no es json')
    expect(result).toMatchObject({ items: [{ opciones: '{no es json' }] })
  })

  it('la sexta columna solo puede llamarse opciones, y solo después de portada', () => {
    expect(csvToBatchItems('fecha,texto,redes,media,portada,extra\n')).toEqual({ error: CSV_HEADER_ERROR })
    expect(csvToBatchItems('fecha,texto,redes,media,opciones\n')).toEqual({ error: CSV_HEADER_ERROR })
  })
})
```

- [ ] **Step 2: Corre los tests y confirma que fallan**

Run: `npx vitest run src/lib/social/publish/batch.test.ts src/lib/social/publish/csv.test.ts`
Expected: FAIL en los describes nuevos.

- [ ] **Step 3: El lote**

En `src/lib/social/publish/batch.ts`:

Imports nuevos:

```ts
import { extensionDe, validateScheduleDraft } from './validate'
import { validarOpcionesPorRed, type OpcionesDestino } from './opciones'
```

(reemplaza el import existente de `./validate`).

`BatchItem`:

```ts
export type BatchItem = {
  fecha: string
  texto: string
  redes: string[]
  media: string[]
  /** URL pública de imagen; vacía o ausente = sin portada. Solo válida con video. */
  portada?: string
  /** JSON plano libre del editor-LLM; se valida con validateAtributos. */
  atributos?: unknown
  /** Lo que cada red exige por destino, por red: `{ "tiktok": { … } }`. Se valida con validarOpcionesPorRed. */
  opciones?: unknown
}
```

`PUBLISHABLE`:

```ts
// The six networks with a publisher (TikTok's lands in the next delivery, same PR).
// Twin of ENABLED in the composer (schedule/composer.tsx) — update both together.
export const PUBLISHABLE = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])
```

Función nueva, junto a `validateBatchItem`:

```ts
/** Las opciones de la fila ya limpias, o la frase. Un valor que no es objeto se rechaza entero. */
function opcionesDeFila(item: BatchItem): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const raw = item.opciones
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return { error: OPCIONES_ERROR }
  }
  return validarOpcionesPorRed(item.redes, (raw ?? {}) as Record<string, unknown>)
}
```

(importa `OPCIONES_ERROR` de `./opciones` también). En `validateBatchItem`, después del chequeo de atributos:

```ts
  const atributosCheck = validateAtributos(item.atributos)
  if ('error' in atributosCheck) return atributosCheck.error

  const opcionesCheck = opcionesDeFila(item)
  if ('error' in opcionesCheck) return opcionesCheck.error

  return validateScheduleDraft(
    {
      caption: item.texto,
      imageCount,
      videoCount,
      networks: item.redes,
      scheduledAt,
      formats: item.media.map(extensionDe),
    },
    now,
  )
```

En `scheduleBatch`, la re-validación post-descarga también pasa formatos reales:

```ts
      const shapeError = validateScheduleDraft(
        {
          caption: item.texto,
          imageCount: uploaded.filter((m) => m.mediaType === 'image').length,
          videoCount: uploaded.filter((m) => m.mediaType === 'video').length,
          networks: item.redes,
          scheduledAt,
          formats: uploaded.map((m) => extensionDe(m.url)),
        },
        now,
      )
```

Y la inserción de targets:

```ts
      const opcionesCheck = opcionesDeFila(item)
      const opciones = 'error' in opcionesCheck ? {} : opcionesCheck.opciones

      await db.insert(scheduledPostTargets).values(
        item.redes.map((network) => ({
          postId: post!.id,
          network,
          accountId: cuentas.get(network)!,
          opciones: opciones[network] ?? null,
        })),
      )
```

- [ ] **Step 4: El CSV**

`src/lib/social/publish/csv.ts`:

```ts
export const CSV_HEADER_ERROR =
  'El encabezado del CSV debe ser exactamente: fecha,texto,redes,media — con portada opcional como quinta columna y opciones como sexta.'
```

`csvToBatchItems`:

```ts
const COLUMNAS = ['fecha', 'texto', 'redes', 'media', 'portada', 'opciones'] as const

/** La celda de opciones: JSON parseado, o el texto crudo para que la validación lo rechace, o nada. */
function opcionesDeCelda(cell: string): unknown {
  const text = cell.trim()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function csvToBatchItems(text: string): { items: BatchItem[] } | { error: string } {
  const rows = parseCsv(text)
  const header = rows[0]
  if (!header || header.length < 4 || header.length > COLUMNAS.length) return { error: CSV_HEADER_ERROR }
  for (const [i, name] of header.entries()) {
    if (name !== COLUMNAS[i]) return { error: CSV_HEADER_ERROR }
  }

  return {
    items: rows.slice(1).map((row) => ({
      fecha: (row[0] ?? '').trim(),
      texto: (row[1] ?? '').trim(),
      redes: splitPipe(row[2] ?? ''),
      media: splitPipe(row[3] ?? ''),
      portada: header.length >= 5 ? (row[4] ?? '').trim() : '',
      opciones: header.length === 6 ? opcionesDeCelda(row[5] ?? '') : undefined,
    })),
  }
}
```

Importa `type BatchItem` de `./batch` (es solo tipo: `import type { BatchItem } from './batch'`, sin ciclo en runtime). Si un test viejo del CSV compara con `toEqual` un item sin `opciones`, `undefined` en una propiedad hace que `toEqual` siga pasando.

- [ ] **Step 5: La ruta**

En `src/app/api/schedule/batch/route.ts`, en el mapeo:

```ts
        // Crudo a propósito: la validación con frase fija vive en validateBatchItem.
        atributos: p.atributos,
        opciones: p.opciones,
```

- [ ] **Step 6: Corre los tests y confirma que pasan**

Run: `npx vitest run src/lib/social/publish/batch.test.ts src/lib/social/publish/csv.test.ts src/lib/mobile-api.test.ts`
Expected: PASS. `mobile-api.test.ts` puede tener un test que use `tiktok` como red no publicable; cámbialo a `linkedin`.

- [ ] **Step 7: Documenta**

En `public/docs/api-editor.md`:

- Línea 15: `**Redes que publican hoy:** \`instagram\`, \`facebook\`, \`youtube\`, \`threads\`, \`x\`, \`tiktok\`.`
- En el ejemplo del cuerpo (línea ~45), agrega a un item: `"opciones": { "tiktok": { "modo": "directo", "privacidad": "SELF_ONLY", "comentarios": true, "comercial": "no" } }`.
- Después de la sección `### atributos (opcional)`, agrega:

```markdown
### `opciones` (obligatorio si `redes` incluye `tiktok`)

Lo que cada red exige elegir por destino. Hoy solo TikTok pide algo, así que el objeto
lleva una clave `tiktok`:

```json
"opciones": {
  "tiktok": {
    "modo": "directo",
    "privacidad": "SELF_ONLY",
    "comentarios": true,
    "duo": false,
    "pegar": false,
    "comercial": "no"
  }
}
```

- `modo`: `directo` publica en el perfil a la hora programada; `borrador` deja el video o las
  fotos en la bandeja de TikTok del dueño para terminarlos desde el teléfono. En `borrador`
  los demás campos se ignoran.
- `privacidad` (obligatoria en `directo`): `PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`,
  `FOLLOWER_OF_CREATOR` o `SELF_ONLY`. Mientras TikTok no audite la app, solo `SELF_ONLY`
  llega a publicarse.
- `comentarios`, `duo`, `pegar`: booleanos, ausentes valen `false`. `duo` y `pegar` no
  aplican a fotos.
- `comercial`: `no`, `marca_propia` (etiqueta «Contenido promocional») o `patrocinado`
  (etiqueta «Colaboración pagada»; no puede ir con `SELF_ONLY`).

Media de TikTok: **un solo video** (mp4, mov, webm) **o de 1 a 35 fotos** (jpg, webp),
nunca mezcla. En el CSV, `opciones` es la sexta columna, después de `portada`, con el mismo
JSON entre comillas dobles escapadas.
```

- En la tabla de errores, agrega:

```markdown
| `TikTok necesita que elijas la privacidad.` | `tiktok` en redes sin `opciones.tiktok`, o `directo` sin `privacidad` válida |
| `Un contenido patrocinado no puede ser privado.` | `comercial: patrocinado` con `SELF_ONLY` |
| `Las opciones de la red no se entendieron.` | `opciones` no es objeto, `modo` desconocido, casilla no booleana, u opciones para una red que no pide |
| `TikTok recibe un video, o hasta 35 fotos JPG o WebP.` | dos videos, mezcla, más de 35 fotos, png/gif, o video que no es mp4/mov/webm |
```

En `README.md`, en «Carga masiva por API» (línea ~512), tras la frase de `atributos`:

```markdown
Y `opciones`, obligatorio cuando la fila va a TikTok: el modo (directo o borrador), la
privacidad y las casillas que TikTok exige elegir por publicación. El detalle está en
`public/docs/api-editor.md`.
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/social/publish/batch.ts src/lib/social/publish/batch.test.ts src/lib/social/publish/csv.ts src/lib/social/publish/csv.test.ts src/app/api/schedule/batch/route.ts public/docs/api-editor.md README.md
git commit -m "Acepta las opciones de TikTok en el lote, el CSV y la API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

Si tocaste `src/lib/mobile-api.test.ts`, agrégalo al commit.

---

### Task 7: El editor muestra las opciones

**Files:**
- Modify: `src/app/admin/(dash)/schedule/[id]/page.tsx:40-50`
- Modify: `src/app/admin/(dash)/schedule/[id]/editor.tsx:14-36, 100-122`

**Interfaces:**
- Consumes: `resumenOpciones` (Task 1).
- Produces: nada que otra task consuma.

- [ ] **Step 1: La página pasa el resumen**

En `src/app/admin/(dash)/schedule/[id]/page.tsx`:

```ts
import { resumenOpciones } from '@/lib/social/publish/opciones'
```

y en el JSX:

```tsx
      targets={targets.map((t) => ({
        network: t.network,
        status: t.status,
        opciones: resumenOpciones(t.network, t.opciones),
      }))}
```

- [ ] **Step 2: El editor lo dibuja**

En `src/app/admin/(dash)/schedule/[id]/editor.tsx`, el tipo de la prop:

```ts
  targets: Array<{ network: string; status: string; opciones: string | null }>
```

`NETWORKS` **no** gana `tiktok` todavía (llega con el publisher en la entrega 2); pero un post que ya tiene un destino TikTok (creado desde el compositor o el lote) debe verse y conservarse. Cambia el cálculo de la lista dibujada y el bloque de redes:

```tsx
  const initialNetworks = new Set(targets.map((t) => t.network))
  // Un destino que ya existe se dibuja aunque su red aún no se pueda agregar desde aquí.
  const drawn = [...NETWORKS, ...targets.map((t) => t.network).filter((n) => !NETWORKS.includes(n))]
  const resumen = new Map(targets.map((t) => [t.network, t.opciones]))
```

y en el `map`:

```tsx
              {drawn.map((network) => {
                const locked = published.has(network)
                const linea = resumen.get(network)
                return (
                  <label key={network} className={cn('flex items-center gap-1.5 text-sm', locked && 'opacity-70')}>
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
                    {linea ? <span className="text-xs text-fg-faint">· {linea}</span> : null}
                  </label>
                )
              })}
```

Mantén el comentario existente sobre el hidden twin encima del `input hidden`.

- [ ] **Step 3: Compruébalo**

Run: `npm run dev`. Programa desde el compositor un post con TikTok en modo directo, ábrelo desde el calendario: bajo «Redes» aparece «TikTok · Directo · Solo yo · con comentarios · …». Guarda sin cambios: el destino de TikTok sigue ahí (no se borra, porque su checkbox viaja marcado).

- [ ] **Step 4: Typecheck, lint y commit**

Run: `npm run typecheck && npm run lint`
Expected: sin errores.

```bash
git add "src/app/admin/(dash)/schedule/[id]/page.tsx" "src/app/admin/(dash)/schedule/[id]/editor.tsx"
git commit -m "Muestra las opciones de TikTok de cada destino en el editor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 8: Cierre de la entrega

**Files:**
- Modify (solo si algo falla): los de las tasks anteriores.
- Modify: `docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md` (sección «Las entregas»).

- [ ] **Step 1: La suite completa**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde. Un `next build` que falle por `DATABASE_URL` ausente no cuenta como fallo de esta entrega si `main` falla igual sin `.env.local`; compáralo con `git stash`-free: corre el build en `main` con un worktree aparte si hace falta, nunca con checkout.

- [ ] **Step 2: Anota en la spec que las entregas 1 y 2 van juntas**

En la sección «Las entregas» de la spec, reemplaza la última línea («Cada entrega es un PR a `contenido-presentacion`…») por:

```markdown
Las entregas 1 y 2 se apilan en la rama `publicar-en-tiktok` y salen en **un solo PR a
`main`**: sin publisher, un destino de TikTok programado fallaría en el cron con
`NO_PUBLISH_TOKEN` y dispararía la alerta. La entrega 3 es su propio PR.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md
git commit -m "Aclara que las entregas 1 y 2 de TikTok salen en un solo PR

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

- [ ] **Step 4: Deja constancia**

`git log --oneline main..HEAD` debe listar ocho commits (spec + siete de este plan). No abras PR: la entrega 2 sigue en esta misma rama.
