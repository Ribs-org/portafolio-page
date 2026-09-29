# Panel con poco a priori — entrega 3: El Fuego

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `/admin` sea El Fuego —la barra de días cargados, lo que sale hoy, lo que se quemó, el botón de poner al fuego y una línea con lo de ayer— y nada más; y que nada del Resumen actual se pierda.

**Architecture:** la selección (qué es «hoy», qué «se quemó», qué dice el pie) es pura y vive en `src/lib/fuego.ts`, probada con fixtures. La lectura de cortes entre dos instantes se comparte con el calendario en una función atada al dueño, vigilada por el arnés de aislamiento. La página es un componente de servidor que compone piezas que ya existen: `Termometro`, `Redes` (entrega 2), y un `Reprogramar` extraído de la cola.

**Tech Stack:** Next.js (App Router), Drizzle, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-panel-poco-a-priori-design.md`, secciones 3 y 6. Ante un conflicto, manda la spec.

**Requiere:** la entrega 2 (`Redes`) fusionada, y la 1 (el vocabulario, `Encabezado`).

## Restricciones globales

- **El Fuego muestra solo lo que pide una acción hoy.** Nada de tráfico, links, embudo ni perfiles: eso está en Los Números y en La Vitrina, y esta entrega comprueba que esté antes de quitar el Resumen.
- **El pie no inventa un cero:** «miradas» solo si el sync ya trajo métricas de los cortes de ayer; si no, se omite.
- **Toda lectura de la base va atada al dueño en el `where`**, y el arnés de aislamiento (`src/lib/aislamiento.test.ts`) lo comprueba para la función nueva.
- **La primera fila del vocabulario cambia, y solo esa:** `/admin` pasa a llamarse El Fuego con el subtítulo «qué se está cocinando ahora».
- **Las rutas no cambian; las frases de error no se tocan.**
- **Comentarios en español; código en inglés y en llano**, con el estilo del archivo.
- **TDD** en lo puro; un commit por tarea con el pie de autoría del repositorio; documentación con la tarea.
- **La suite pasa, typecheck, lint y build limpios al final de cada tarea.**

---

### Tarea 1: La selección, pura

**Files:**
- Create: `src/lib/fuego.ts`
- Test: `src/lib/fuego.test.ts`

**Interfaces:**
- Consumes: `dayKey(date, zone)` de `src/lib/schedule-week.ts`.
- Produces: `type Corte = { post: { id: string; caption: string; scheduledAt: Date }; targets: Array<{ id: string; network: string; handle: string | null; status: string; externalId: string | null; opciones: unknown; lastError: string | null }> }`; `cortesDeHoy(cortes, now, zone)`; `siguienteCorte(cortes, now)`; `quemados(cortes)`; `pieDeAyer(servidos: number, miradas: number | null): string`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { cortesDeHoy, pieDeAyer, quemados, siguienteCorte, type Corte } from './fuego'

const ZONE = 'America/Santiago'
// 29 de septiembre de 2026, 15:00 en Chile (UTC-3 en horario de verano).
const AHORA = new Date('2026-09-29T18:00:00Z')

function corte(id: string, iso: string, targets: Corte['targets'] = []): Corte {
  return { post: { id, caption: `Corte ${id}`, scheduledAt: new Date(iso) }, targets }
}
const destino = (status: string, lastError: string | null = null): Corte['targets'][number] => ({
  id: `t-${status}`,
  network: 'instagram',
  handle: 'vicente',
  status,
  externalId: null,
  opciones: null,
  lastError,
})

describe('cortesDeHoy', () => {
  it('es lo programado para el día de hoy en la zona del sitio, en orden de hora, salido o no', () => {
    const manana = corte('m', '2026-09-30T12:00:00Z')
    const tarde = corte('t', '2026-09-29T22:00:00Z') // 19:00 en Chile
    const ya = corte('y', '2026-09-29T13:00:00Z') // 10:00 en Chile, ya pasó
    const ayerNoche = corte('a', '2026-09-29T02:30:00Z') // 23:30 del 28 en Chile
    expect(cortesDeHoy([manana, tarde, ya, ayerNoche], AHORA, ZONE).map((c) => c.post.id)).toEqual(['y', 't'])
  })
})

describe('siguienteCorte', () => {
  it('el primero después de ahora, o null si la parrilla está fría hacia adelante', () => {
    const pasado = corte('p', '2026-09-29T13:00:00Z')
    const proximo = corte('n', '2026-10-02T12:00:00Z')
    const lejano = corte('l', '2026-10-05T12:00:00Z')
    expect(siguienteCorte([lejano, pasado, proximo], AHORA)?.post.id).toBe('n')
    expect(siguienteCorte([pasado], AHORA)).toBeNull()
  })
})

describe('quemados', () => {
  it('cada destino fallido con su corte, y nada más', () => {
    const conFallo = corte('f', '2026-09-28T12:00:00Z', [destino('published'), destino('failed', 'Instagram rechazó la publicación.')])
    const sano = corte('s', '2026-09-28T12:00:00Z', [destino('published')])
    const q = quemados([sano, conFallo])
    expect(q).toHaveLength(1)
    expect(q[0]!.corte.post.id).toBe('f')
    expect(q[0]!.destino.status).toBe('failed')
  })
})

describe('pieDeAyer', () => {
  it('cuenta los cortes servidos y solo suma las miradas cuando existen', () => {
    expect(pieDeAyer(6, 1234)).toBe('Ayer: 6 cortes servidos · 1.2k miradas')
    expect(pieDeAyer(1, null)).toBe('Ayer: 1 corte servido')
    expect(pieDeAyer(0, null)).toBe('Ayer no salió nada.')
  })
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/fuego.test.ts`

- [ ] **Step 3: El módulo**

```ts
import { dayKey } from '@/lib/schedule-week'
import { formatNumber } from '@/lib/utils'

// Lo que El Fuego decide, sin tocar la base: qué es «hoy», cuál es el siguiente corte, qué
// se quemó, y qué dice el pie. La página solo compone; esto se prueba con fixtures.

export type Corte = {
  post: { id: string; caption: string; scheduledAt: Date }
  targets: Array<{
    id: string
    network: string
    handle: string | null
    status: string
    externalId: string | null
    opciones: unknown
    lastError: string | null
  }>
}

/** Lo programado para hoy en la zona del sitio, salido o no, en orden de hora. */
export function cortesDeHoy(cortes: Corte[], now: Date, zone: string): Corte[] {
  const hoy = dayKey(now, zone)
  return cortes
    .filter((c) => dayKey(c.post.scheduledAt, zone) === hoy)
    .sort((a, b) => a.post.scheduledAt.getTime() - b.post.scheduledAt.getTime())
}

/** El primer corte después de ahora, o null: «la parrilla está fría» hacia adelante. */
export function siguienteCorte(cortes: Corte[], now: Date): Corte | null {
  const futuros = cortes
    .filter((c) => c.post.scheduledAt.getTime() > now.getTime())
    .sort((a, b) => a.post.scheduledAt.getTime() - b.post.scheduledAt.getTime())
  return futuros[0] ?? null
}

/** Cada destino que se quemó, con su corte: es lo único de El Fuego que pide una acción. */
export function quemados(cortes: Corte[]): Array<{ corte: Corte; destino: Corte['targets'][number] }> {
  return cortes.flatMap((corte) =>
    corte.targets.filter((t) => t.status === 'failed').map((destino) => ({ corte, destino })),
  )
}

/**
 * El pie de la pantalla. Las miradas solo cuando el sync ya las trajo: un cero inventado
 * diría «nadie miró» cuando lo cierto es «todavía no se sabe».
 */
export function pieDeAyer(servidos: number, miradas: number | null): string {
  if (servidos === 0) return 'Ayer no salió nada.'
  const cortes = servidos === 1 ? '1 corte servido' : `${servidos} cortes servidos`
  return miradas === null ? `Ayer: ${cortes}` : `Ayer: ${cortes} · ${formatNumber(miradas)} miradas`
}
```

Comprueba que `formatNumber(1234)` da `1.2k` en este proyecto (`src/lib/utils.ts`); si su formato es otro, ajusta la expectativa del test al formato real, no la función.

- [ ] **Step 4: Correr, verlos pasar y commitear**

```bash
git add src/lib/fuego.ts src/lib/fuego.test.ts
git commit -m "La selección de El Fuego, pura"
```

---

### Tarea 2: Las lecturas, atadas al dueño

**Files:**
- Create: `src/lib/social/publish/cortes.ts`
- Modify: `src/app/admin/(dash)/schedule/page.tsx` (usa la función compartida)
- Test: `src/lib/aislamiento.test.ts`

**Interfaces:**
- Produces: `cortesEntre(ownerId, desde: Date, hasta: Date): Promise<Corte[]>` (cortes con `scheduledAt` en `[desde, hasta)`, con sus destinos y el handle de cada cuenta por `leftJoin`); `quemadosDe(ownerId): Promise<Corte[]>` (los cortes con algún destino `failed`); `servidosAyer(ownerId, now, zone): Promise<{ servidos: number; miradas: number | null }>`.

- [ ] **Step 1: Mira cómo lee el calendario**

`src/app/admin/(dash)/schedule/page.tsx` carga la semana con una consulta propia (posts +
targets + handle). Léela entera antes de escribir: `cortesEntre` tiene que devolver **la misma
forma** que esa página ya usa, y esa página pasa a llamarla. Si la consulta del calendario ya
está extraída en `src/lib/…`, reutilízala y no crees otra; si está inline, muévela a
`cortes.ts` y haz que la página la importe. El `leftJoin` con `socialAccounts` es a propósito
(un destino cuya cuenta ya no exista no debe desaparecer): consérvalo, y **el dueño va en el
`where`, nunca en el `on` del join** — es lo que el arnés vigila.

- [ ] **Step 2: Los tests de aislamiento**

En `src/lib/aislamiento.test.ts`, tres casos con el molde de los que ya hay (busca
`consultasEncadenadas` y `esperarFiltradoPorDueno`): `cortesEntre`, `quemadosDe` y
`servidosAyer` atan cada consulta al dueño. Escríbelos primero; verlos fallar es la prueba de
que el arnés los alcanza.

- [ ] **Step 3: Las tres funciones**

`servidosAyer`: los destinos `published` de cortes cuyo `scheduledAt` cae en el día de ayer
(zona del sitio; usa `dayKey`/`addDays` de `schedule-week`); `miradas` es la suma de
`post_metrics.views` del último día disponible para los `social_posts` cuyo `external_id`
coincide con el `externalId` de esos destinos (`src/lib/post-attributes.ts` ya hace ese cruce:
copia el patrón). Si ninguno de los cortes de ayer tiene métricas todavía, `miradas: null`.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano: el
calendario se ve igual que antes.

```bash
git add src/lib/social/publish/cortes.ts "src/app/admin/(dash)/schedule/page.tsx" src/lib/aislamiento.test.ts
git commit -m "Las lecturas de El Fuego, compartidas con el calendario y atadas al dueño"
```

---

### Tarea 3: `Reprogramar` sale de la cola, y el compositor se abre por URL

**Files:**
- Create: `src/app/admin/(dash)/schedule/reprogramar.tsx`
- Modify: `src/app/admin/(dash)/schedule/queue.tsx`
- Modify: `src/app/admin/(dash)/schedule/composer.tsx` y/o `schedule/page.tsx`

- [ ] **Step 1: Extraer**

La cola tiene, dentro de cada destino fallido, un botón «Reprogramar» que abre un
`<Input type="datetime-local">` y llama a `rescheduleTarget(targetId, localDatetime)`. Extrae
ese par (botón + campo + llamada + estado `pending`/error) a `Reprogramar({ targetId })`, un
componente cliente, y haz que la cola lo use. Comportamiento idéntico: a mano, un destino
fallido de la cola se reprograma igual que antes.

- [ ] **Step 2: `?componer=1`**

El compositor es un `<details>`. Que `schedule/page.tsx` lea `searchParams.componer` y se lo
pase para que nazca abierto (`open` en el `<details>`) cuando vale `1`. Es lo que va a usar
el botón «Poner al fuego» de El Fuego.

- [ ] **Step 3: Verificar y commitear**

```bash
git add "src/app/admin/(dash)/schedule/reprogramar.tsx" "src/app/admin/(dash)/schedule/queue.tsx" "src/app/admin/(dash)/schedule/composer.tsx" "src/app/admin/(dash)/schedule/page.tsx"
git commit -m "Reprogramar sale de la cola, y el compositor se abre por URL"
```

---

### Tarea 4: La pantalla

**Files:**
- Modify: `src/app/admin/(dash)/page.tsx` (deja de ser el Resumen)
- Modify: `src/lib/vocabulario.ts` (la primera fila) y `src/lib/vocabulario.test.ts` si afirma el nombre
- Modify: `src/app/admin/(dash)/analytics/page.tsx` **solo si** falta un panel (Step 1)
- Modify: `README.md`

**Interfaces:**
- Consumes: `Termometro` (existe), `Redes` (entrega 2), `Reprogramar` (Tarea 3), `cortesDeHoy`/`siguienteCorte`/`quemados`/`pieDeAyer` (Tarea 1), `cortesEntre`/`quemadosDe`/`servidosAyer` (Tarea 2), `cargaPorDia` y `getCuentas` (`src/lib/posts.ts`), `Encabezado` (entrega 1).

- [ ] **Step 1: Que nada se pierda antes de quitar el Resumen**

El Resumen tiene cinco paneles: Tráfico, Links más clickeados, Embudo, Contenido que trae
tráfico, Tus perfiles. Comprueba, con `grep -n 'title="' "src/app/admin/(dash)/analytics/"*.tsx`
y leyendo, que Los Números ya tiene los tres primeros (los tiene: «Tráfico en el tiempo»,
«Links más clickeados», «Embudo») y **si «Contenido que trae tráfico» (`CampaignTable` con
`getCampaigns(filters, 8)`) no está en Los Números, añádelo ahí** como un `Panel` más, con
el mismo `hint`. «Tus perfiles» es La Vitrina (`/admin/profiles`): no se duplica. Escribe en
el informe qué encontraste y qué añadiste.

- [ ] **Step 2: La pantalla**

`page.tsx` pasa a ser El Fuego. Servidor, sin `searchParams`. De arriba abajo, con
`<Encabezado ruta="/admin" />` primero:

1. `<Termometro carga={carga} zone={SITE_TIMEZONE} />`, con `carga` de `cargaPorDia` como hoy.
2. **Ahora en la parrilla:** `cortesDeHoy(cortesEntre(ownerId, inicioDeHoy, inicioDeManana), now, zone)`.
   Cada fila: la hora (`hourLabel`), `<Redes targets={corte.targets} />`, el texto en una
   línea (`line-clamp-1`), y la cocción en palabras (`NOMBRE_COCCION[coccionDe(estados)]`,
   de `calendar.tsx`/`parrilla.ts`). Cada fila enlaza a `/admin/schedule/${id}`. Si no hay
   ninguno: «La parrilla está fría hoy.» y, si `siguienteCorte` da algo, «El siguiente sale
   el {día} a las {hora}.»
3. **Se quemó:** solo si `quemados(quemadosDe(ownerId))` no está vacío. Cada fila: la hora, el
   `Redes` con ese solo destino, el texto en una línea, `destino.lastError` en llano, y
   `<Reprogramar targetId={destino.id} />`.
4. **Poner al fuego:** un enlace con el estilo del botón primario a `/admin/schedule?componer=1`.
5. **El pie**, en mono y `text-fg-faint`: `pieDeAyer(servidos, miradas)` de `servidosAyer`.

**El primer día:** si `getCuentas(ownerId)` no tiene ninguna con `connected`, la página no
dibuja nada de lo anterior: una sola tarjeta `chapa` con el título «Conecta tu primera red»,
una línea —«Sin una red conectada no hay nada que poner al fuego.»— y un enlace-botón a
`/admin/accounts` que diga «Ir a Los Fierros →».

- [ ] **Step 3: La primera fila del vocabulario**

En `src/lib/vocabulario.ts`, `/admin` pasa a `nombre: 'El Fuego', subtitulo: 'qué se está cocinando ahora'`, y el comentario de cabecera que decía que se llamaría Resumen «hasta la entrega 3» se borra: ya llegó. Si `vocabulario.test.ts` afirma el nombre viejo, corrígelo.

- [ ] **Step 4: Mirar, verificar y commitear**

`npm run dev`: `/admin` con cortes hoy; sin cortes hoy; con un destino fallido; sin ninguna
cuenta (desconecta todas en un entorno de prueba, no en producción). Run: `npx vitest run`,
`npm run typecheck`, `npm run lint`, `npm run build`.

Documentación: `README.md` describe el panel y el Resumen (`grep -n "Resumen\|termómetro\|días cargados" README.md`): El Fuego es la entrada, qué muestra y qué no, y que los números viven en Los Números. Y el mapa de pestañas que escribió la entrega 1 pasa a nombrar El Fuego.

```bash
git add "src/app/admin/(dash)/page.tsx" src/lib/vocabulario.ts src/lib/vocabulario.test.ts "src/app/admin/(dash)/analytics/page.tsx" README.md
git commit -m "El Fuego es la entrada del panel"
```

---

## Lo que ningún test comprueba

Que al entrar se vea poco y se entienda de un vistazo. Eso se mira con el dueño, en pantalla.
