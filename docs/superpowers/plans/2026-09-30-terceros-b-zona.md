# Terceros — entrega B: la zona horaria de cada usuario

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada usuario programe, lea y mida en su propia zona horaria, en vez de en la única del sitio.

**Architecture:** `users.zona` (con default `America/Santiago`) llega a todo el panel y a la API dentro del objeto de sesión `Usuario`, que ya sale de `select().from(users)`; una pantalla nueva del grupo Ajustes («Tu Cuenta», `/admin/cuenta`) la edita. `SITE_TIMEZONE` se queda solo como default de los usuarios nuevos y del sitio público. Las funciones que hoy leen la constante por dentro (`lib/analytics.ts`, `lib/posts.ts`) reciben la zona: `Filters` gana `zone`, y `parseFilters` la exige.

**Tech Stack:** Next.js (App Router), Drizzle, `Intl`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-terceros-codigo-design.md`, §3. Ante conflicto, manda la spec.

## Restricciones globales

- **Toda lectura de la base va atada al dueño**; el arnés (`src/lib/aislamiento.test.ts`) alcanza a la acción nueva y a cualquier función que cambie de firma (ajusta sus llamadas en el arnés, no lo aflojes).
- **Las rutas del panel no cambian.** Lo nuevo: `/admin/cuenta`.
- **Las frases de error existentes no se tocan.** Nueva: `ZONA_INVALIDA = 'Esa zona horaria no existe.'`, con test letra por letra.
- **`SITE_TIMEZONE` no se borra:** es el default de `users.zona` y del sitio público (`/` sin dueño, `docs/`). Tras esta entrega, `grep -rn SITE_TIMEZONE src` solo debe dar `lib/analytics.ts` (definición), `lib/zona.ts` (default), y usos sin dueño a mano (justificados en un comentario).
- **Comentarios en español; código en inglés y en llano**, con el estilo del archivo que se toca.
- **TDD** en lo puro; un commit por tarea con el pie de autoría del repositorio; documentación con la tarea que hace cierto el cambio.
- **La suite pasa, typecheck, lint y build limpios al final de cada tarea.** La migración se genera con `npx drizzle-kit generate --name <nombre>` y se aplica en DEV con `npm run db:migrate:local`.

---

### Tarea 1: `users.zona`, y `lib/zona.ts` puro

**Files:**
- Modify: `src/db/schema.ts` (`users`)
- Create: `drizzle/0007_<nombre>.sql` (generada)
- Create: `src/lib/zona.ts`, `src/lib/zona.test.ts`

**Interfaces:**
- Produces: `users.zona: string` (not null, default `'America/Santiago'`); `Usuario.zona` (sale solo del `$inferSelect`); `ZONA_INVALIDA`; `esZonaValida(zona: string): boolean`; `zonasDisponibles(): string[]`; `horaEn(zona: string, now: Date): string` («14:05»).

- [ ] **Step 1: El test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { ZONA_INVALIDA, ZONA_POR_DEFECTO, esZonaValida, horaEn, zonasDisponibles } from './zona'

describe('zona', () => {
  it('la frase, letra por letra', () => {
    expect(ZONA_INVALIDA).toBe('Esa zona horaria no existe.')
    expect(ZONA_POR_DEFECTO).toBe('America/Santiago')
  })
  it('acepta las zonas IANA y rechaza lo demás', () => {
    expect(esZonaValida('America/Santiago')).toBe(true)
    expect(esZonaValida('Europe/Madrid')).toBe(true)
    expect(esZonaValida('UTC')).toBe(true)
    expect(esZonaValida('America/Santiagoo')).toBe(false)
    expect(esZonaValida('')).toBe(false)
    expect(esZonaValida('  ')).toBe(false)
  })
  it('la lista trae las de siempre y la de por defecto', () => {
    const zonas = zonasDisponibles()
    expect(zonas).toContain('America/Santiago')
    expect(zonas).toContain('Europe/Madrid')
    expect(zonas.length).toBeGreaterThan(300)
  })
  it('la hora en una zona, en 24 h', () => {
    const t = new Date('2026-09-30T18:05:00Z')
    expect(horaEn('America/Santiago', t)).toBe('15:05')
    expect(horaEn('Europe/Madrid', t)).toBe('20:05')
    expect(horaEn('UTC', new Date('2026-09-30T00:07:00Z'))).toBe('00:07')
  })
})
```

- [ ] **Step 2: Correr y verlo fallar**

- [ ] **Step 3: El módulo y el esquema**

```ts
import { SITE_TIMEZONE } from '@/lib/analytics'

// La zona de cada usuario. `SITE_TIMEZONE` es solo el default: la de los usuarios nuevos y
// la del sitio público, donde no hay un dueño a mano.

export const ZONA_POR_DEFECTO = SITE_TIMEZONE
export const ZONA_INVALIDA = 'Esa zona horaria no existe.'

/** Válida si `Intl` la conoce: es la misma lista que usa el resto de la app para formatear. */
export function esZonaValida(zona: string): boolean {
  if (zona.trim() === '' || zona !== zona.trim()) return false
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona })
    return true
  } catch {
    return false
  }
}

/** Las zonas IANA que el runtime conoce, para el selector. */
export function zonasDisponibles(): string[] {
  return Intl.supportedValuesOf('timeZone')
}

/** «HH:MM» en esa zona, para decir «ahora son las…» al lado del selector. */
export function horaEn(zona: string, now: Date): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona }).format(now)
}
```

Comprueba que `ZONA_POR_DEFECTO` sea `'America/Santiago'` en el test: si `.env.local` define `SITE_TIMEZONE` con otro valor, el test fallaría; en ese caso afirma contra `SITE_TIMEZONE` y dilo. Si `SITE_TIMEZONE` en `lib/analytics.ts` importa `server-only` transitivamente y rompe el test, mueve la derivación `env('SITE_TIMEZONE') ?? 'America/Santiago'` a `zona.ts` y que `analytics.ts` la reexporte de ahí (la definición cambia de archivo, el nombre no).

En `users`: `zona: text('zona').notNull().default('America/Santiago'),` después de `rol`. `npx drizzle-kit generate --name zona_por_usuario`; lee el SQL (solo `ALTER TABLE "users" ADD COLUMN "zona" text DEFAULT 'America/Santiago' NOT NULL`); `npm run db:migrate:local`.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`. Documentación: nada visible todavía; `.env.example` y README no cambian en esta tarea. Dilo en el informe.

```bash
git add src/db/schema.ts drizzle src/lib/zona.ts src/lib/zona.test.ts
git commit -m "Cada usuario tiene una zona horaria; por ahora, la del sitio"
```

---

### Tarea 2: La pantalla «Tu Cuenta»

**Files:**
- Modify: `src/lib/vocabulario.ts` (fila nueva), `src/lib/vocabulario.test.ts` si enumera rutas
- Create: `src/app/admin/(dash)/cuenta/page.tsx`, `src/app/admin/(dash)/cuenta/formulario.tsx`
- Modify: `src/app/admin/actions.ts` (`guardarCuenta`), `src/app/admin/actions.test.ts`, `src/lib/aislamiento.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `esZonaValida`, `zonasDisponibles`, `horaEn`, `ZONA_INVALIDA` (Tarea 1); `Encabezado` (`@/components/ui`); el molde de formulario con acción de `profiles/[id]` o de `usuarios`.
- Produces: `guardarCuenta(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: La fila del vocabulario**

En `PANTALLAS`, después de Los Maestros:
`{ ruta: '/admin/cuenta', nombre: 'Tu Cuenta', subtitulo: 'tu nombre y tu hora', grupo: 'ajustes' }`
(sin `soloAdmin`). `vocabulario.test.ts` comprueba que cada ruta tiene `page.tsx`: créalo antes de correrlo.

- [ ] **Step 2: La acción, con test primero**

En `actions.test.ts` (molde: el test de `updateProfile` o el de `makeDefault`): `guardarCuenta` con zona inválida devuelve `{ ok: false, error: ZONA_INVALIDA }` y no escribe; con zona válida hace un `update` de `users` **por `id` del usuario de la sesión** con `nombre` (recortado; vacío → `null`) y `zona`, y revalida `/admin` y `/admin/cuenta`. En `aislamiento.test.ts`, un caso: `guardarCuenta` ata su consulta al usuario (`users.id = $` cuenta como el dueño: es su propia fila — si `esperarFiltradoPorDueno` exige `owner_id` literal, escribe una comprobación propia de `"id" = $` con `DUENO` en `params` y explica en un comentario por qué acá el dueño es `id`).

- [ ] **Step 3: La página y el formulario**

`page.tsx` (servidor): `requireUser()`, `<Encabezado ruta="/admin/cuenta" />`, y el formulario con `nombre`, un `<select name="zona">` con `zonasDisponibles()` (la del usuario seleccionada) y, debajo, «Ahora son las {horaEn(usuario.zona, new Date())} en {usuario.zona}.» — calculado en el servidor, sin JS. El botón «Guardar». `formulario.tsx` cliente solo si hace falta `useActionState` para mostrar `ZONA_INVALIDA`; si el proyecto ya tiene un patrón para errores de acción en formularios, cópialo. Tras guardar, la hora de abajo tiene que ser la de la zona nueva (el `revalidatePath` la trae).

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano (`next dev -p 3001`): cambiar la zona a `Europe/Madrid`, ver la hora cambiar; poner una inválida por `curl` o editando el HTML y ver `ZONA_INVALIDA`. Documentación: README, sección del panel donde enumera Ajustes (`grep -n "Los Maestros" README.md`): Tu Cuenta, qué se cambia ahí; tabla de URLs si lista las pantallas del panel.

```bash
git add src/lib/vocabulario.ts src/lib/vocabulario.test.ts "src/app/admin/(dash)/cuenta" src/app/admin/actions.ts src/app/admin/actions.test.ts src/lib/aislamiento.test.ts README.md
git commit -m "Tu Cuenta: el nombre y la zona horaria, en Ajustes"
```

---

### Tarea 3: La zona del usuario en el panel y en las acciones

**Files:**
- Modify: `src/app/admin/(dash)/page.tsx`, `schedule/page.tsx`, `schedule/[id]/page.tsx`, `profiles/[id]/page.tsx`
- Modify: `src/app/admin/actions.ts` (los cuatro `fromZonedInput(…, SITE_TIMEZONE)`: links de perfil ×2, crear corte, editar corte, `rescheduleTarget`)
- Modify: `src/lib/posts.ts` (`cargaPorDia` ya recibe `zone`: comprueba que la página le pase la del usuario)

**Interfaces:**
- Consumes: `usuario.zona` (Tarea 1).

- [ ] **Step 1: Reemplazar, sitio por sitio**

En cada página, `const { id: ownerId, zona } = await requireUser()` y `zona` donde iba `SITE_TIMEZONE`. En `actions.ts`, la acción ya tiene `usuario` de `requireUser()` en cada caso: usa `usuario.zona`. Quita el import de `SITE_TIMEZONE` de cada archivo que quede sin usos. El comentario de `queue.tsx:50` («La zona llega por prop, como al calendario: `SITE_TIMEZONE`…») pasa a decir que llega la del usuario.

- [ ] **Step 2: Los tests que fijaban la zona**

`actions.test.ts` y los de las páginas (si los hay) que afirmaban instantes calculados con `America/Santiago`: siguen valiendo mientras el usuario doblado tenga `zona: 'America/Santiago'` — añade `zona` al `USUARIO` de los dobles (`aislamiento.test.ts`, `actions.test.ts`, y cualquier `vi.mock('@/lib/auth')`). Un test nuevo en `actions.test.ts`: con un usuario en `Europe/Madrid`, `rescheduleTarget(id, '2026-10-01T19:00')` escribe `2026-10-01T17:00:00Z`.

- [ ] **Step 3: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano: con la zona en `Europe/Madrid`, programar un corte a las 19:00 y verlo en la parrilla a las 19:00, y en El Fuego «hoy» según Madrid. `grep -rn "SITE_TIMEZONE" "src/app/admin"` tiene que dar solo `analytics/page.tsx` (lo toma la Tarea 4). Documentación: nada nuevo visible; dilo.

```bash
git add "src/app/admin/(dash)" src/app/admin/actions.ts src/app/admin/actions.test.ts src/lib/aislamiento.test.ts
git commit -m "El panel y las acciones hablan en la zona del usuario"
```

---

### Tarea 4: La zona en la API, el lote y Los Números

**Files:**
- Modify: `src/lib/analytics.ts` (`Filters.zone`; `localDay`, `describe`, `granularityFor`, `getTimeSeries`, `getHeatmap` reciben la zona), `src/lib/filters.ts` (`parseFilters(params, ownerId, zone)`), `src/lib/posts.ts` (`PUBLISHED`, `getPostSeries`, `getPostRows`), `src/lib/posts-kpis.ts`
- Modify: `src/app/admin/(dash)/analytics/page.tsx`, `content/page.tsx`
- Modify: `src/app/api/metrics/posts/route.ts`, `src/app/api/schedule/posts/route.ts`, `src/app/api/mobile/overview/route.ts`, `src/app/api/mobile/posts/route.ts`, `src/app/api/mobile/schedule/route.ts`
- Modify: `src/lib/social/publish/batch.ts` (`ZONE` local desaparece; la zona es la del dueño, con `buscarPorId`)
- Modify: tests de `analytics`, `posts`, `filters`, `aislamiento` (firmas), `batch`; `README.md`, `.env.example`

**Interfaces:**
- Consumes: `usuario.zona`, `buscarPorId` (`@/lib/usuarios`).
- Produces: `Filters.zone: string`; `localDay(date, zone)`; `parseFilters(params, ownerId, zone)`.

- [ ] **Step 1: `Filters.zone` y las funciones de `analytics.ts`**

`localDay(date: Date, zone: string)` (sin default: que el typecheck encuentre cada llamada). `describe`, `granularityFor`, `getTimeSeries`, `getHeatmap` y `previousPeriod` toman la zona de `f.zone`. `parseFilters(params, ownerId, zone)` la pone en el objeto. Las páginas pasan `usuario.zona`; `api/metrics/posts` la del dueño de la llave (mira cómo resuelve al dueño; si la llave no trae usuario, `buscarPorId(ownerId)`).

- [ ] **Step 2: `posts.ts` y `posts-kpis.ts`**

`PUBLISHED` deja de ser una constante con `timeZone` fija: pasa a una función `publishedLabel(date, zone)` (o un `Map` de formateadores por zona, que es lo barato) y `getPostRows`/`getPostSeries` usan `f.zone`. El comentario largo de `posts.ts:40-46` sigue siendo cierto salvo «SITE_TIMEZONE»: que diga «la zona del dueño».

- [ ] **Step 3: La API del teléfono, la de la agenda y el lote**

`api/mobile/*`: `usuario.zona` de `requireMobileUser`. `api/schedule/posts`: la zona del dueño de la llave. `batch.ts`: la zona del dueño del lote (`buscarPorId(ownerId)` una vez por lote; si el dueño no existe, `ZONA_POR_DEFECTO`); quita `ZONE` y su comentario de derivación duplicada. En `api-editor.md`/`api-llm.md` (`public/docs/`), si dicen «hora de Chile» o «America/Santiago» para los campos `cuando`/`scheduledAt`: ahora es «la zona horaria del dueño (la de Tu Cuenta)». `docs-api.test.ts` puede afirmar frases de esos documentos: córrelo.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. `grep -rn "SITE_TIMEZONE" src` debe dar solo la definición, `zona.ts`, y usos del sitio público sin dueño, cada uno con un comentario que diga por qué. Documentación: README tabla de variables (`SITE_TIMEZONE`: «zona por defecto de los usuarios nuevos y del sitio público; cada usuario cambia la suya en Tu Cuenta»), `.env.example` (mismo texto en el comentario), y `docs/deuda-tecnica.md` si menciona la zona única como deuda (`grep -n "zona" docs/deuda-tecnica.md`): ciérrala o corrígela.

```bash
git add src/lib src/app/api "src/app/admin/(dash)/analytics" "src/app/admin/(dash)/content" public/docs README.md .env.example docs/deuda-tecnica.md
git commit -m "La API, el lote y Los Números usan la zona del dueño"
```

---

## Lo que ningún test comprueba

Que un usuario en Madrid vea lo mismo que ve el dueño en Chile, cada uno a su hora: se prueba con dos usuarios reales en la beta.
