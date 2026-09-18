# Dirección visual 1: la base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todo el panel y la puerta de entrada se vean «Fierro y humo» —acero frío, brasa como único acento, Oswald en los títulos, la reja como separador— **sin cambiar ni un nombre de sección ni una sola estructura**. Al terminar, el panel es otro producto a la vista y sigue funcionando exactamente igual.

**Architecture:** El cambio es **aditivo**. Los tokens `ink-*`, las clases `.aurora` y `.surface` y la fuente Bricolage se quedan donde están porque los usa la página pública de cada creador, que está fuera de alcance; junto a ellos aparecen `acero-*`, `--color-brasa`, `--font-titulo`, `.reja` y `.chapa`. Como `body` pinta el fondo de todo el sitio, el panel, la puerta y las legales pasan a pintar el suyo en sus propios layouts, y así la página pública queda byte a byte igual. `ui.tsx` no lo importa ninguna pantalla pública, así que sus nueve controles se rehacen libres.

**Tech Stack:** Tailwind 4 con `@theme` en CSS, `next/font/google`, React 19, Recharts (los ocho gráficos), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-parrilla-direccion-visual-design.md`

Rama: `direccion-visual`, que ya trae la spec commiteada (76f291b) sobre `main`.

## Global Constraints

- **Nada se borra.** `--color-ink-*`, `.aurora`, `.aurora-contained`, `.surface`, `.surface-hover` y la fuente Bricolage siguen en el repo y siguen funcionando: los usa `src/components/profile-view.tsx` y `src/lib/serve-profile.tsx`, y `aurora` es además uno de los valores que `profiles.background_style` guarda en la base.
- **Ningún nombre de sección cambia en esta entrega.** Ni «Resumen», ni «Calendario», ni un botón. Eso es la entrega 2.
- **Ninguna estructura cambia.** No se mueven pantallas, no se crean ni se borran rutas.
- Paleta, valores exactos:

| Token | Valor |
|---|---|
| `--color-acero-950` | `#16181a` |
| `--color-acero-900` | `#1d2124` |
| `--color-acero-800` | `#242a2f` |
| `--color-acero-700` | `#2a2e33` |
| `--color-brasa` | `#e8621f` |
| `--color-fg` | `#f2ebe2` |
| `--color-fg-muted` | `#948a80` |
| `--color-fg-faint` | `#6b7076` |
| bien / atención / quemado | `#74bf6a` / `#e5a52a` / `#f0614f` |

- **La brasa solo para lo caliente o accionable**: botón primario, pestaña activa, foco del teclado, estado «en curso». Nunca decorativa.
- **Los semánticos no son el acento**: `positive`, `caution` y `negative` se reasignan a los tres valores de arriba y siguen siendo los únicos que hablan de bien/mal.
- La reja: `repeating-linear-gradient(90deg, var(--color-acero-700) 0 3px, transparent 3px 13px)`, 10 px de alto, **una sola vez por pantalla**, nunca de textura de fondo.
- Comentarios en el código solo para lo que el código no puede mostrar. Commits en español, presente, terminando con:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Git: nunca checkout/reset/rebase/stash; `git add` por archivo; heredoc para el mensaje.
- Verificación de cada tarea: `npm run typecheck`, `npm run lint`, `npx vitest run`. En la última tarea, además `npx next build`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/app/globals.css` | los tokens nuevos, `.reja`, `.chapa`; nada se quita |
| `src/app/layout.tsx` | suma Oswald como `--font-oswald` |
| `src/components/charts/theme.ts` | paleta de datos: el cian por el naranja, neutros de acero |
| `src/components/charts/color.ts` (nuevo) | matemática de color pura, para poder probar la paleta |
| `src/components/charts/color.test.ts` (nuevo) | contraste y separación de las ocho series |
| `src/components/ui.tsx` | los nueve controles |
| `src/components/charts/panel.tsx`, `stat-tile.tsx` | `.chapa` y acento nuevo |
| `src/components/filter-bar.tsx` | acento nuevo |
| `src/app/admin/(dash)/layout.tsx`, `error.tsx` | fondo propio, la reja en vez de la aurora |
| `src/app/ingresar/**`, `src/app/(legal)/layout.tsx` | lo mismo para la puerta |
| `docs/revision-visual.md` (nuevo) | la lista de revisión manual |

---

### Task 1: Los tokens, la reja y la chapa

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: las clases de Tailwind `bg-acero-950`, `bg-acero-900`, `bg-acero-800`, `border-acero-700`, `text-brasa`, `bg-brasa`, `font-titulo`, y las clases CSS `.reja` y `.chapa`.

- [ ] **Step 1: Los tokens**

En el bloque `@theme` de `src/app/globals.css`, **después** de los `--color-ink-*` (que se quedan), agrega:

```css
  /*
   * «Fierro y humo»: acero frío para el panel y la puerta. Los `ink-*` de arriba no se
   * tocan porque los usa la página pública de cada creador, que tiene su propia identidad.
   */
  --color-acero-950: #16181a;
  --color-acero-900: #1d2124;
  --color-acero-800: #242a2f;
  --color-acero-700: #2a2e33;

  /* La brasa: solo lo caliente o lo accionable. Nunca decorativa. */
  --color-brasa: #e8621f;

  --font-titulo: var(--font-oswald), 'Arial Narrow', sans-serif;
```

Y **reemplaza los valores** de estos tres, que ya existen:

```css
  --color-fg: #f2ebe2;
  --color-fg-muted: #948a80;
  --color-fg-faint: #6b7076;

  --color-positive: #74bf6a;
  --color-negative: #f0614f;
  --color-caution: #e5a52a;
```

- [ ] **Step 2: La reja y la chapa**

Al final del bloque `@layer components` de `globals.css`:

```css
  /*
   * La reja: las barras de una parrilla. Separa bloques mayores dentro de una pantalla,
   * una sola vez por pantalla. No es textura de fondo — repetida deja de significar nada.
   */
  .reja {
    height: 10px;
    border-radius: 2px;
    background: repeating-linear-gradient(90deg, var(--color-acero-700) 0 3px, transparent 3px 13px);
  }

  /*
   * Chapa: la superficie del panel. Acero mate, sin el desenfoque de `.surface`, que se
   * queda para la página pública. Sin blur además rinde mejor en listas largas.
   */
  .chapa {
    background: var(--color-acero-900);
    border: 1px solid var(--color-acero-700);
  }

  .chapa-hover {
    transition:
      border-color 180ms ease,
      background-color 180ms ease;
  }

  @media (hover: hover) {
    .chapa-hover:hover {
      background: var(--color-acero-800);
      border-color: var(--color-brasa);
    }
  }
```

- [ ] **Step 3: El foco del teclado**

En `@layer base`, la regla `:focus-visible` usa hoy `rgb(var(--accent) / 0.9)`, que es el violeta del perfil. Cámbiala a `var(--color-brasa)` y deja el resto igual. `::selection` se queda como está: vive también en la página pública.

- [ ] **Step 4: Oswald**

En `src/app/layout.tsx`, suma la fuente junto a las tres que ya hay:

```ts
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono, Oswald } from 'next/font/google'

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
})
```

y agrega `oswald.variable` a la lista de clases del `<html>` (o del `<body>`, donde estén las otras tres). **Bricolage se queda**: lo usa `profile-view.tsx`.

- [ ] **Step 5: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: los tres verdes. Nada cambia de aspecto todavía, porque ninguna pantalla usa aún las clases nuevas.

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -F - <<'EOF'
Suma la paleta de acero, la reja, la chapa y Oswald

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 2: La paleta de datos, medida

**Files:**
- Create: `src/components/charts/color.ts`
- Create: `src/components/charts/color.test.ts`
- Modify: `src/components/charts/theme.ts`

**Interfaces:**
- Produces, de `color.ts`: `contraste(a: string, b: string): number` (razón WCAG, 1 a 21) y `distancia(a: string, b: string): number` (ΔE CIE76 en Lab).
- Produces, de `theme.ts`: `SERIES` con el cian en el índice 1; `CHART.surface = '#1d2124'`.

**Por qué esta tarea lleva tests cuando el resto del plan no:** el archivo `theme.ts` documenta una validación hecha a mano (separación para daltonismo, piso de croma, contraste). Cambiar una serie invalida esa medición, y la spec exige rehacerla. Una función pura que la calcule deja la propiedad protegida para siempre en vez de en un comentario.

- [ ] **Step 1: Los tests que fallan**

`src/components/charts/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { contraste, distancia } from './color'
import { CHART, SERIES } from './theme'

describe('matemática de color', () => {
  it('el contraste conocido de blanco sobre negro es 21', () => {
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('un color contra sí mismo no tiene distancia', () => {
    expect(distancia('#3987e5', '#3987e5')).toBeCloseTo(0, 5)
  })

  it('el naranja viejo y el cian nuevo están lejos, y era el problema a resolver', () => {
    // El acento de marca es brasa; una serie naranja se confundía con «esto es interactivo».
    expect(distancia('#d95926', '#1f9aa8')).toBeGreaterThan(40)
  })
})

describe('la paleta de series sobre la superficie del panel', () => {
  it('las ocho se leen sobre la chapa', () => {
    for (const color of SERIES) {
      expect(contraste(color, CHART.surface), `${color} sobre ${CHART.surface}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('ninguna vecina se confunde con la siguiente', () => {
    for (let i = 1; i < SERIES.length; i++) {
      const previa = SERIES[i - 1]!
      const actual = SERIES[i]!
      expect(distancia(previa, actual), `${previa} junto a ${actual}`).toBeGreaterThan(15)
    }
  })

  it('ninguna serie se confunde con la brasa de la marca', () => {
    // Si una serie se parece al acento, el lector no distingue dato de control.
    for (const color of SERIES) {
      expect(distancia(color, '#e8621f'), `${color} contra la brasa`).toBeGreaterThan(20)
    }
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/components/charts/color.test.ts`
Expected: FAIL, `./color` no resuelve.

- [ ] **Step 3: La matemática**

`src/components/charts/color.ts`:

```ts
/**
 * Lo mínimo para poder afirmar en un test que la paleta de datos se lee.
 *
 * Existe porque `theme.ts` documentaba su validación en un comentario: al cambiar una
 * serie, ese comentario quedaba mintiendo y nadie se enteraba. Aquí la propiedad se mide.
 *
 * ΔE es CIE76, no CIEDE2000: para decidir «estos dos se confunden» a las distancias que
 * nos importan basta, y se puede leer de una sentada.
 */

function canal(hex: string, desde: number): number {
  return parseInt(hex.slice(desde, desde + 2), 16) / 255
}

function rgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  if (limpio.length !== 6) throw new Error(`Color no reconocido: ${hex}`)
  return [canal(limpio, 0), canal(limpio, 2), canal(limpio, 4)]
}

/** sRGB a lineal: el paso que casi todo el mundo se salta y que descuadra cualquier cálculo. */
const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map(lineal) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste WCAG: 1 es invisible, 21 es blanco sobre negro. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const oscuro = Math.min(la, lb)
  return (claro + 0.05) / (oscuro + 0.05)
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lineal) as [number, number, number]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** ΔE CIE76. Por debajo de 15, dos series se confunden en un gráfico apretado. */
export function distancia(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
```

- [ ] **Step 4: El tema**

En `src/components/charts/theme.ts`:

- Reemplaza `'#d95926', // orange` por `'#1f9aa8', // cian` y su comentario por: `// cian, no naranja: el naranja es la brasa de la marca y se confundía con lo accionable`.
- Reescribe el bloque `CHART`:

```ts
export const CHART = {
  surface: '#1d2124',
  grid: '#242a2f',
  axis: '#2a2e33',
  muted: '#6b7076',
  text: '#f2ebe2',
  secondary: '#948a80',
} as const
```

- Actualiza el comentario de cabecera: la validación ya no se afirma de palabra, se mide en `color.test.ts`, y la superficie de referencia es la de la chapa porque los gráficos viven dentro de un `Panel`.
- `SEQUENTIAL`, `ORDINAL`, `POSITIVE` y `NEGATIVE` **no se tocan** en esta tarea: son azules y verdes/rojos que no chocan con la brasa.

- [ ] **Step 5: Corre y commitea**

Run: `npx vitest run src/components/charts/color.test.ts && npm run typecheck && npm run lint`
Expected: PASS, 6 tests.

**Si algún test falla, no cambies el umbral para que pase.** Anota en tu reporte el valor medido y qué par lo produjo, y para ahí: elegir otro cian es una decisión de diseño, no de implementación.

```bash
git add src/components/charts/color.ts src/components/charts/color.test.ts src/components/charts/theme.ts
git commit -F - <<'EOF'
Cambia el naranja de los datos por cian y mide la paleta en vez de afirmarla

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 3: Los nueve controles

**Files:**
- Modify: `src/components/ui.tsx`

**Interfaces:** ninguna firma cambia. `GroupLabel`, `Field`, `Input`, `Textarea`, `Select`, `Button`, `Submit`, `Switch` y `Toggle` siguen recibiendo exactamente las mismas props.

Ninguna pantalla pública importa este archivo (comprobado: `profile-view.tsx` y `serve-profile.tsx` no lo usan), así que se puede rehacer sin miedo.

- [ ] **Step 1: La constante compartida**

`CONTROL` (línea 7) pasa a acero, conservando el `[color-scheme:dark]` que hace legibles los desplegables nativos:

```ts
const CONTROL =
  'w-full rounded-lg border border-acero-700 bg-acero-800 px-3 py-2 text-sm outline-none transition-colors [color-scheme:dark] placeholder:text-fg-faint focus:border-brasa'
```

El radio baja de `xl` a `lg`: «Fierro y humo» es herramienta, no burbuja.

- [ ] **Step 2: `GroupLabel` y `Field`**

Las etiquetas de grupo pasan a Oswald en mayúsculas, que es la voz de los títulos de esta dirección. En `GroupLabel`, reemplaza sus clases por:

```
'mb-2 block font-titulo text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-faint'
```

En `Field`, la etiqueta del campo usa las mismas clases y el `hint` se queda en `text-fg-faint`. No cambies la estructura de `<label>` ni los `id`.

- [ ] **Step 3: `Button`**

```ts
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-brasa text-acero-950 hover:brightness-110',
        variant === 'ghost' && 'border border-acero-700 text-fg-muted hover:bg-acero-800 hover:text-fg',
        variant === 'danger' && 'border border-negative/40 text-negative hover:bg-negative/10',
```

El primario pasa a brasa plena con texto oscuro: es la acción caliente. `Submit` hereda de `Button` — revisa que no traiga clases propias que lo contradigan, y si las trae, déjalas alineadas con esto.

- [ ] **Step 4: `Switch`**

Pista en acero, perilla encendida en brasa. **Conserva intacto** el arreglo de posición del 2026-09-17 (`left-0` y `translate-x-[1.125rem]`) y su comentario: sin eso la perilla se sale de la pista.

```ts
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-brasa/70' : 'bg-acero-700',
```

y la perilla: `'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-fg transition-transform'`.

- [ ] **Step 5: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`

```bash
git add src/components/ui.tsx
git commit -F - <<'EOF'
Viste los nueve controles con acero y brasa

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 4: Los paneles y los ocho gráficos

**Files:**
- Modify: `src/components/charts/panel.tsx`, `src/components/charts/stat-tile.tsx`, `src/components/filter-bar.tsx`
- Modify, revisando: `src/components/charts/bar-list.tsx`, `campaign-table.tsx`, `donut.tsx`, `funnel.tsx`, `heatmap.tsx`, `traffic-chart.tsx`

- [ ] **Step 1: `Panel` y `PanelSkeleton`**

Cambia `surface` por `chapa` y `rounded-2xl` por `rounded-xl` en los dos. Si el título del panel usa `font-display`, pásalo a `font-titulo` con `uppercase tracking-[0.08em]`.

- [ ] **Step 2: `StatTile`**

Igual con la superficie. Y aplica la regla del acento: **la brasa solo cuando la cifra es accionable**. En la práctica, el número va en `text-fg` y el delta sigue usando `positive`/`negative`; ninguna ficha lleva brasa de adorno.

- [ ] **Step 3: `FilterBar`**

La pestaña o el chip activo pasa a brasa (`bg-brasa text-acero-950` si hoy es un fondo, o `text-brasa border-brasa` si hoy es un borde); los inactivos a `text-fg-muted` con `border-acero-700`. Cualquier `rgb(var(--accent)…)` que encuentres aquí se reemplaza por brasa.

- [ ] **Step 4: Los seis gráficos restantes**

Recórrelos con `grep -n "accent\|ink-\|surface\|#" src/components/charts/*.tsx` y cambia solo lo que sea color literal o del acento viejo:
- `rgb(var(--accent) …)` y cualquier violeta → `var(--color-brasa)` si marca algo accionable o destacado; si marca un dato, va al token de `CHART` o a `seriesColor`.
- `surface` → `chapa`; `ink-*` → `acero-*` según la tabla de tokens.
- Lo que ya lee de `CHART` o `SERIES` **no se toca**: ya quedó actualizado en la Task 2.

- [ ] **Step 5: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Y `grep -rn "var(--accent)" src/components/charts src/components/filter-bar.tsx` no debe devolver nada.

```bash
git add src/components/charts src/components/filter-bar.tsx
git commit -F - <<'EOF'
Pasa los paneles y los gráficos a chapa, con la brasa solo donde hace falta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 5: El cromado del panel y de la puerta

**Files:**
- Modify: `src/app/admin/(dash)/layout.tsx`, `src/app/admin/(dash)/nav.tsx`, `src/app/admin/(dash)/error.tsx`
- Modify: `src/app/ingresar/page.tsx`, `src/app/ingresar/codigo/page.tsx`, `src/app/ingresar/formularios.tsx`, `src/app/ingresar/error.tsx`
- Modify: `src/app/(legal)/layout.tsx`

**Interfaces:** ninguna. Solo clases y el fondo.

- [ ] **Step 1: El panel pinta su propio fondo**

En `src/app/admin/(dash)/layout.tsx`:
- El `<div className="min-h-dvh">` que envuelve todo pasa a `min-h-dvh bg-acero-950`.
- **Borra el bloque de la aurora** (`<div className="aurora opacity-40" aria-hidden><span /></div>`) de esta pantalla. La clase sigue existiendo en el CSS para la página pública; aquí simplemente no se usa.
- La cabecera pegajosa pasa de `bg-ink-950/70` a `bg-acero-950/80`, y su borde inferior a `border-acero-700`.
- **Debajo de la cabecera, una sola reja**: `<div className="reja mx-auto max-w-6xl" aria-hidden />`. Es el único sitio del panel donde aparece.
- El botón «Salir» y el nombre del panel pasan a `font-titulo uppercase tracking-[0.1em]`.

- [ ] **Step 2: La navegación**

En `nav.tsx`, la pestaña activa pasa a `bg-brasa text-acero-950` y las inactivas a `text-fg-muted hover:text-fg`. **No cambies ni una etiqueta de `TABS`**: los nombres son la entrega 2. Conserva la prop `esAdmin` y la pestaña de usuarios tal como están.

- [ ] **Step 3: La puerta**

En `src/app/ingresar/page.tsx` y `codigo/page.tsx`: el `<main>` pasa a `bg-acero-950`, se borra el bloque de la aurora, y la tarjeta pasa de `surface` a `chapa`. El título usa `font-titulo uppercase tracking-[0.06em]`. La palabra «Parrilla» del encabezado, que hoy va en mono, pasa a `font-titulo`.

En `formularios.tsx`: el `CAMPO` local duplica las clases del control compartido; cámbialo a acero igual que `CONTROL` (`border-acero-700 bg-acero-800 focus:border-brasa`). El `Submit` **pierde el `style` del acento violeta del perfil**: ahora el primario ya es brasa, así que ese `style` sobra y hay que quitarlo junto con su comentario.

En los dos `error.tsx` y en `(legal)/layout.tsx`: mismo tratamiento, fondo propio, `chapa` en la tarjeta, sin aurora.

- [ ] **Step 4: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Y comprueba que la página pública sigue intacta: `git diff --stat` no debe mencionar `profile-view.tsx`, `serve-profile.tsx`, `src/app/page.tsx` ni `src/app/[slug]/`.

```bash
git add "src/app/admin/(dash)/layout.tsx" "src/app/admin/(dash)/nav.tsx" "src/app/admin/(dash)/error.tsx" src/app/ingresar "src/app/(legal)/layout.tsx"
git commit -F - <<'EOF'
Viste el panel y la puerta de acero, con una sola reja por pantalla

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 6: La lista de revisión y el cierre

**Files:**
- Create: `docs/revision-visual.md`

- [ ] **Step 1: La lista**

Escribe `docs/revision-visual.md` con la lista que la spec exige: por pantalla, a ancho de teléfono (~400 px) y de escritorio. Las pantallas son las nueve del panel (resumen, analítica, contenido, comentarios, cuentas, calendario, calendario de un post, perfiles, usuarios), las dos de la puerta, las dos legales y las dos de error. Por cada una, qué mirar:

- el texto se lee sobre la chapa y sobre el fondo;
- el foco del teclado se ve al tabular;
- ninguna pantalla muestra dos rejas;
- no queda ni un violeta: ni en bordes, ni en sombras, ni en gráficos;
- los ocho gráficos con datos reales, sin dos series confundibles;
- el interruptor tiene la perilla dentro de la pista, encendido y apagado;
- los desplegables se leen al abrirlos.

Y una sección corta al final: **qué NO debe haber cambiado**, con la página pública de un perfil en los dos fondos que ofrece (`aurora` y el otro), para confirmar que el cambio fue aditivo de verdad.

- [ ] **Step 2: Verificación completa**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: los cuatro verdes.

- [ ] **Step 3: Commit**

```bash
git add docs/revision-visual.md
git commit -F - <<'EOF'
Anota qué mirar para dar por buena la piel nueva

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

### Cierre (controlador)

1. Revisión final de toda la rama, con foco en que no quede violeta en el panel y en que la página pública no haya cambiado.
2. PR a `main`. La spec viaja en el mismo PR.
3. La entrega 2 (el vocabulario) parte de aquí.
