# «La parrilla de verdad» — entrega 1: la parrilla

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el calendario del panel deje de ser una lista y pase a ser una parrilla: cada día una grilla con fuego debajo, cada post un corte cuya cocción dice el estado.

**Architecture:** Tres piezas separadas por responsabilidad. Los valores de cocción y el escalón de calor son TypeScript puro y testeado (`src/lib/parrilla.ts`), porque son reglas y no estilos. Las clases `.corte` y `.grilla` viven en `globals.css` como primitivas reutilizables. `calendar.tsx` solo las compone. Un test lee `globals.css` y comprueba que los hexes de ahí no se separaron de los de TypeScript.

**Tech Stack:** Next.js 16 App Router, Tailwind 4 con `@theme` en CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-parrilla-de-verdad-design.md`

## Global Constraints

- **Aditivo.** No se borra ni se redefine nada de «Fierro y humo». Los tokens `acero-*`, `--color-brasa`, `--font-titulo`, `.reja`, `.chapa` y `.acerado` quedan tal cual.
- **Nada de función cambia.** El calendario conserva las siete columnas, el ancho mínimo `52rem`, el scroll horizontal, los enlaces de semana, el enlace de cada post al editor con su `?volver=`, los tres casos de miniatura (imagen, `coverUrl`, primer cuadro del video) y el marcado del día de hoy.
- **La precedencia de estado no se toca:** un `failed` en cualquier destino gana; todos `published` es «a punto»; algún destino en curso es «sellada»; cualquier otra cosa es «cruda».
- **Vitest solo corre `src/**/*.test.ts`.** Los tests van ahí, con esa extensión.
- **Comentarios y copy en español.** El código en inglés donde el repo ya lo está.
- **Una sola animación en toda la entrega**, el humo del corte sellado, y va dentro del bloque `prefers-reduced-motion: reduce` que ya existe al final de `globals.css`.
- **Las marcas del fierro sobre la miniatura: 34% de negro como máximo.**

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/parrilla.ts` (nuevo) | `COCCION` (los ocho hexes), `calorDelDia()`, `coccionDe()`. Reglas puras, cero JSX. |
| `src/lib/parrilla.test.ts` (nuevo) | Escalones de calor, precedencia de cocción, contrastes y daltonismo, y el guardia contra la deriva con `globals.css`. |
| `src/app/globals.css` (modificar) | Tokens de carne en `@theme`; `.corte`, sus cuatro cocciones, `.grilla` y sus tres escalones en `@layer components`. |
| `src/app/admin/(dash)/schedule/calendar.tsx` (modificar) | Compone las clases. Único componente que cambia. |

---

### Task 1: Las reglas de la parrilla

**Files:**
- Create: `src/lib/parrilla.ts`
- Test: `src/lib/parrilla.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Coccion = 'cruda' | 'sellada' | 'punto' | 'quemada'`
  - `type Calor = 'apagada' | 'prendida' | 'llena'`
  - `calorDelDia(cortes: number): Calor`
  - `coccionDe(estados: readonly string[]): Coccion`
  - `COCCION: Record<Coccion, { claro: string; oscuro: string }>`
  - `GRASA: string`

- [ ] **Step 1: Escribe los tests que fallan**

```ts
// src/lib/parrilla.test.ts
import { describe, expect, it } from 'vitest'
import { COCCION, calorDelDia, coccionDe } from './parrilla'

describe('calorDelDia', () => {
  it('sin cortes la parrilla está apagada', () => {
    expect(calorDelDia(0)).toBe('apagada')
  })

  it('uno o dos cortes la dejan prendida', () => {
    expect(calorDelDia(1)).toBe('prendida')
    expect(calorDelDia(2)).toBe('prendida')
  })

  // El umbral sale de la promesa del producto: publicar a volumen. Tres es un día
  // de trabajo normal, no un trofeo. Los dos bordes van explícitos porque mover
  // este número es una decisión de producto, no un ajuste.
  it('tres cortes o más la dejan llena', () => {
    expect(calorDelDia(3)).toBe('llena')
    expect(calorDelDia(12)).toBe('llena')
  })
})

describe('coccionDe', () => {
  it('sin destinos queda cruda', () => {
    expect(coccionDe([])).toBe('cruda')
  })

  it('programada sin publicar queda cruda', () => {
    expect(coccionDe(['scheduled', 'scheduled'])).toBe('cruda')
  })

  it('algo en curso la sella', () => {
    expect(coccionDe(['scheduled', 'publishing'])).toBe('sellada')
  })

  it('todos publicados la dejan a punto', () => {
    expect(coccionDe(['published', 'published'])).toBe('punto')
  })

  it('publicados a medias no llegan a punto', () => {
    expect(coccionDe(['published', 'scheduled'])).toBe('cruda')
  })

  // Un fallo gana sobre todo lo demás porque es lo que necesita el ojo. Es la misma
  // precedencia que tenía calendar.tsx antes del rediseño.
  it('un fallo gana sobre publicado y sobre en curso', () => {
    expect(coccionDe(['published', 'failed'])).toBe('quemada')
    expect(coccionDe(['publishing', 'failed'])).toBe('quemada')
    expect(coccionDe(['failed', 'published', 'publishing'])).toBe('quemada')
  })
})
```

- [ ] **Step 2: Corre los tests y verifica que fallan**

Ejecuta: `npx vitest run src/lib/parrilla.test.ts`
Esperado: FAIL, «Failed to resolve import ./parrilla».

- [ ] **Step 3: Escribe la implementación**

```ts
// src/lib/parrilla.ts

/**
 * Las reglas de la parrilla: cuánto fuego tiene un día y qué tan cocido está un post.
 *
 * Están acá y no dentro de `calendar.tsx` porque son reglas, no estilos. El escalón de
 * calor lo va a querer también el resumen en la entrega siguiente, y un umbral mágico
 * escrito dentro de un `className` es exactamente el tipo de decisión que después nadie
 * encuentra.
 */

export type Coccion = 'cruda' | 'sellada' | 'punto' | 'quemada'
export type Calor = 'apagada' | 'prendida' | 'llena'

/**
 * Los dos extremos del degradado de cada cocción.
 *
 * Están ordenados de claro a oscuro y ese orden es la información: cruda es la más
 * clara y quemada la más oscura. Contar la cocción por luminosidad y no por tono es lo
 * que hace que la escala sobreviva a un daltonismo protán o deután, donde los cuatro
 * rojos se vuelven cuatro pardos pero siguen ordenados.
 *
 * `globals.css` repite estos mismos hexes como tokens. El test de este módulo lee el
 * CSS y comprueba que no se hayan separado.
 */
export const COCCION: Record<Coccion, { claro: string; oscuro: string }> = {
  cruda: { claro: '#a84c46', oscuro: '#8f453f' },
  sellada: { claro: '#8c3f36', oscuro: '#73342c' },
  punto: { claro: '#6e3128', oscuro: '#4e231c' },
  quemada: { claro: '#3a2a26', oscuro: '#241a17' },
}

/** El veteado de la grasa y las marcas de red sobre el corte. */
export const GRASA = '#e8d7b8'

/** De claro a oscuro. El test de luminosidad recorre este orden. */
export const ORDEN_COCCION: readonly Coccion[] = ['cruda', 'sellada', 'punto', 'quemada']

/**
 * Cuánto fuego tiene un día según cuántos cortes lleve.
 *
 * El tres de «llena» sale de la promesa del producto, que es publicar a volumen: tiene
 * que alcanzarse en un día de trabajo normal.
 */
export function calorDelDia(cortes: number): Calor {
  if (cortes <= 0) return 'apagada'
  if (cortes < 3) return 'prendida'
  return 'llena'
}

/**
 * La cocción de un post según el estado de sus destinos.
 *
 * Misma precedencia que tenía `calendar.tsx` antes del rediseño, solo que ahora vestida:
 * un fallo en cualquier destino gana sobre todo lo demás porque es lo que necesita el
 * ojo; todos publicados es «a punto»; algo en curso es «sellada»; el resto queda cruda.
 *
 * Un post sin destinos queda crudo y no «a punto»: `every` sobre una lista vacía devuelve
 * `true`, así que sin el largo explícito un post sin destinos se vería como publicado.
 */
export function coccionDe(estados: readonly string[]): Coccion {
  if (estados.some((estado) => estado === 'failed')) return 'quemada'
  if (estados.length > 0 && estados.every((estado) => estado === 'published')) return 'punto'
  if (estados.some((estado) => estado === 'publishing')) return 'sellada'
  return 'cruda'
}
```

- [ ] **Step 4: Corre los tests y verifica que pasan**

Ejecuta: `npx vitest run src/lib/parrilla.test.ts`
Esperado: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parrilla.ts src/lib/parrilla.test.ts
git commit -m "Saca a un módulo las reglas de calor y cocción de la parrilla"
```

---

### Task 2: Los colores de la carne, comprobados

**Files:**
- Modify: `src/lib/parrilla.test.ts` (agrega bloques, no toca los de la Task 1)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `COCCION`, `GRASA`, `ORDEN_COCCION` de la Task 1; `contraste()` y `simular()` de `src/components/charts/color.ts`.
- Produces: tokens `--color-carne-cruda|sellada|punto|quemada`, sus variantes `-honda`, y `--color-grasa` en `@theme`.

**Por qué el test antes que el CSS:** el spec anterior aprendió por las malas que una validación de color escrita en un comentario queda obsoleta en silencio. Acá se escribe como test.

- [ ] **Step 1: Escribe los tests de color que fallan**

Agrega al final de `src/lib/parrilla.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { contraste, simular } from '../components/charts/color'
import { GRASA, ORDEN_COCCION } from './parrilla'

// El texto del corte, que es el `--color-fg` de `.acerado`.
const TEXTO = '#f2ebe2'

describe('los colores de la carne', () => {
  // Se mide contra el extremo claro de cada degradado porque es el peor caso: si el
  // texto se lee ahí, se lee en todo el corte.
  it('el texto pasa AA sobre las cuatro cocciones', () => {
    for (const nombre of ORDEN_COCCION) {
      const ratio = contraste(TEXTO, COCCION[nombre].claro)
      expect(ratio, `${nombre} da ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('las cocciones van estrictamente de clara a oscura', () => {
    // `contraste` contra negro es una lectura directa de la luminosidad relativa.
    const luces = ORDEN_COCCION.map((n) => contraste(COCCION[n].claro, '#000000'))
    for (let i = 1; i < luces.length; i++) {
      expect(luces[i], `${ORDEN_COCCION[i]} no es más oscura que la anterior`).toBeLessThan(
        luces[i - 1],
      )
    }
  })

  it('cada cocción se distingue de su vecina', () => {
    for (let i = 1; i < ORDEN_COCCION.length; i++) {
      const ratio = contraste(COCCION[ORDEN_COCCION[i - 1]].claro, COCCION[ORDEN_COCCION[i]].claro)
      expect(ratio, `${ORDEN_COCCION[i - 1]} vs ${ORDEN_COCCION[i]}`).toBeGreaterThanOrEqual(1.25)
    }
  })

  it('la cruda y la quemada se separan de lejos', () => {
    expect(contraste(COCCION.cruda.claro, COCCION.quemada.claro)).toBeGreaterThanOrEqual(2)
  })

  /*
   * El umbral bajo daltonismo es más bajo que el de visión normal a propósito: la
   * simulación comprime los rojos hacia el pardo y achica todas las distancias. Lo que
   * tiene que sobrevivir es el orden de la escalera, no su tamaño — por eso el test
   * exige orden estricto y solo un piso mínimo de separación.
   */
  it.each(['protan', 'deutan'] as const)('la escalera sobrevive a %s', (tipo) => {
    const luces = ORDEN_COCCION.map((n) => contraste(simular(COCCION[n].claro, tipo), '#000000'))
    for (let i = 1; i < luces.length; i++) {
      expect(luces[i], `${ORDEN_COCCION[i]} bajo ${tipo}`).toBeLessThan(luces[i - 1])
      const vecinas = contraste(
        simular(COCCION[ORDEN_COCCION[i - 1]].claro, tipo),
        simular(COCCION[ORDEN_COCCION[i]].claro, tipo),
      )
      expect(vecinas, `${ORDEN_COCCION[i - 1]} vs ${ORDEN_COCCION[i]} bajo ${tipo}`)
        .toBeGreaterThanOrEqual(1.15)
    }
  })

  it('el veteado se lee sobre la cocción más clara', () => {
    expect(contraste(GRASA, COCCION.cruda.claro)).toBeGreaterThanOrEqual(3)
  })
})

/*
 * El guardia contra la deriva. `globals.css` repite estos hexes como tokens de Tailwind
 * porque las clases los necesitan, y dos copias de un valor se separan sola tarde o
 * temprano. Este test lee el CSS y compara.
 */
describe('los tokens del CSS no se separaron de TypeScript', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

  it.each(ORDEN_COCCION)('%s coincide en los dos lados', (nombre) => {
    expect(css).toContain(`--color-carne-${nombre}: ${COCCION[nombre].claro};`)
    expect(css).toContain(`--color-carne-${nombre}-honda: ${COCCION[nombre].oscuro};`)
  })

  it('la grasa coincide en los dos lados', () => {
    expect(css).toContain(`--color-grasa: ${GRASA};`)
  })
})
```

- [ ] **Step 2: Corre los tests y verifica que fallan**

Ejecuta: `npx vitest run src/lib/parrilla.test.ts`
Esperado: los de contraste y daltonismo PASAN (los hexes ya vienen elegidos para cumplir); los del guardia contra la deriva FALLAN porque `globals.css` todavía no tiene los tokens.

Si alguno de contraste o daltonismo falla, **no bajes el umbral**: oscurece el extremo `claro` de la cocción que falló y vuelve a correr. El techo lo pone el test de AA, el piso el de separación.

- [ ] **Step 3: Agrega los tokens a `globals.css`**

Dentro del bloque `@theme`, justo después de la línea `--font-titulo: var(--font-oswald), 'Arial Narrow', sans-serif;`:

```css
  /*
   * La carne. Cada cocción con su extremo claro y su extremo hondo, que son los dos
   * topes del degradado del corte. Ordenadas de clara a oscura: ese orden es la
   * información, y es lo que hace que la escala se siga leyendo con daltonismo.
   *
   * Los mismos valores viven en `src/lib/parrilla.ts` y un test compara los dos lados.
   */
  --color-carne-cruda: #a84c46;
  --color-carne-cruda-honda: #8f453f;
  --color-carne-sellada: #8c3f36;
  --color-carne-sellada-honda: #73342c;
  --color-carne-punto: #6e3128;
  --color-carne-punto-honda: #4e231c;
  --color-carne-quemada: #3a2a26;
  --color-carne-quemada-honda: #241a17;

  /* El veteado del corte y las marcas de red encima. */
  --color-grasa: #e8d7b8;
```

- [ ] **Step 4: Corre los tests y verifica que pasan**

Ejecuta: `npx vitest run src/lib/parrilla.test.ts`
Esperado: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parrilla.test.ts src/app/globals.css
git commit -m "Fija y comprueba los colores de la carne, con daltonismo incluido"
```

---

### Task 3: El corte y la grilla

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: los tokens de la Task 2.
- Produces: `.corte`, `.corte-cruda|sellada|punto|quemada`, `.corte-marcas`, `.grilla`, `.grilla-apagada|prendida|llena`, `.humo`.

- [ ] **Step 1: Agrega las clases dentro de `@layer components`**

Al final del bloque `@layer components` que ya existe en `globals.css`:

```css
  /*
   * ================= La parrilla =================
   * Ver docs/superpowers/specs/2026-09-18-parrilla-de-verdad-design.md
   */

  /*
   * Un día. El fuego es un degradado que sube de casi nada arriba a brasa abajo, y los
   * fierros son bandas negras dibujadas encima del fuego y debajo de los cortes. Ese
   * orden importa: con los fierros por encima de los cortes, las bandas de la grilla se
   * mezclan con las marcas del corte y el conjunto se ensucia.
   */
  .grilla {
    position: relative;
    border: 1px solid var(--color-acero-700);
    border-radius: 3px;
    overflow: hidden;
  }

  .grilla::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      rgb(0 0 0 / 0.44) 0 3px,
      transparent 3px 13px
    );
    pointer-events: none;
  }

  /* Los hijos se levantan sobre los fierros. */
  .grilla > * {
    position: relative;
  }

  /* `acero-900` y no un gris nuevo: es la superficie de panel que ya usa `.chapa`. */
  .grilla-apagada {
    background: var(--color-acero-900);
    border-style: dashed;
    border-color: var(--color-acero-700);
  }

  /* Sin fierros: una parrilla apagada no tiene nada encima que mirar. */
  .grilla-apagada::before {
    content: none;
  }

  .grilla-prendida {
    background: linear-gradient(
      to bottom,
      rgb(196 52 26 / 0.04),
      rgb(232 98 31 / 0.13) 62%,
      rgb(255 138 61 / 0.22)
    );
  }

  .grilla-llena {
    background: linear-gradient(
      to bottom,
      rgb(196 52 26 / 0.10),
      rgb(232 98 31 / 0.28) 58%,
      rgb(255 138 61 / 0.46)
    );
    border-color: rgb(232 98 31 / 0.40);
  }

  /*
   * Un corte. Las cuatro esquinas con radios distintos para que no se lea como una
   * pastilla redondeada más.
   */
  .corte {
    position: relative;
    border-radius: 13px 5px 14px 6px;
    border: 1px solid rgb(0 0 0 / 0.35);
    box-shadow:
      0 5px 12px rgb(0 0 0 / 0.5),
      inset 0 1px 0 rgb(255 255 255 / 0.10);
    overflow: hidden;
  }

  /* El veteado de la grasa: tres elipses difusas. Va debajo de las marcas del fierro. */
  .corte::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 22px 4px at 28% 34%, rgb(232 215 184 / 0.30), transparent 70%),
      radial-gradient(ellipse 16px 3px at 66% 62%, rgb(232 215 184 / 0.24), transparent 72%),
      radial-gradient(ellipse 12px 3px at 44% 76%, rgb(232 215 184 / 0.18), transparent 74%);
    pointer-events: none;
    z-index: 1;
  }

  /*
   * Las marcas del fierro, quemadas sobre todo el corte incluida la miniatura. El 34%
   * es el tope del spec: por encima de eso la foto deja de reconocerse, y reconocer el
   * post de un vistazo es justamente para lo que está la miniatura.
   */
  .corte::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      rgb(0 0 0 / 0.34) 0 3px,
      transparent 3px 14px
    );
    mix-blend-mode: multiply;
    pointer-events: none;
    z-index: 2;
  }

  /* El contenido por encima del veteado y de las marcas. */
  .corte > * {
    position: relative;
    z-index: 3;
  }

  .corte-cruda {
    background: linear-gradient(
      145deg,
      var(--color-carne-cruda),
      var(--color-carne-cruda-honda)
    );
  }

  /* La cruda casi no toca el fierro todavía: las marcas se insinúan. */
  .corte-cruda::after {
    opacity: 0.25;
  }

  .corte-sellada {
    background: linear-gradient(
      145deg,
      var(--color-carne-sellada),
      var(--color-carne-sellada-honda)
    );
  }

  .corte-punto {
    background: linear-gradient(
      145deg,
      var(--color-carne-punto),
      var(--color-carne-punto-honda)
    );
  }

  .corte-quemada {
    background: linear-gradient(
      145deg,
      var(--color-carne-quemada),
      var(--color-carne-quemada-honda)
    );
  }

  .corte-quemada::after {
    opacity: 0.9;
  }

  /*
   * El humo del corte sellado. Es la única animación de la entrega y es informativa:
   * dice que algo está saliendo en este momento. El bloque de `prefers-reduced-motion`
   * al final del archivo la apaga.
   */
  .humo {
    animation: humo 2.8s ease-in-out infinite;
  }
```

Y el fotograma, junto a los otros `@keyframes` del archivo:

```css
@keyframes humo {
  0%, 100% {
    opacity: 0.55;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
```

- [ ] **Step 2: Comprueba que nada se rompió**

Ejecuta: `npm run lint && npx tsc --noEmit && npm test`
Esperado: los tres limpios. Ningún test mira estas clases todavía; esto es la red de seguridad de que el CSS no rompió la compilación de Tailwind.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "Agrega el corte y la grilla como primitivas de CSS"
```

---

### Task 4: El calendario se vuelve parrilla

**Files:**
- Modify: `src/app/admin/(dash)/schedule/calendar.tsx`

**Interfaces:**
- Consumes: `calorDelDia`, `coccionDe`, `type Coccion` de `src/lib/parrilla.ts`; las clases de la Task 3.
- Produces: nada que otro consuma.

**Lo que hay que conservar sin excepción:** las siete columnas, `min-w-[52rem]`, el scroll horizontal, `prevHref`/`nextHref`/`weekLabel`, el `Link` de cada corte a `/admin/schedule/${post.id}?volver=...`, los tres casos de miniatura, y el marcado del día de hoy. El `DOT` y el tinte de fondo por estado desaparecen: los reemplaza la cocción.

- [ ] **Step 1: Reemplaza el mapa `DOT` por el rótulo de calor**

Borra el bloque `const DOT: Record<string, string> = {...}` entero y pon en su lugar:

```tsx
import { calorDelDia, coccionDe, type Coccion } from '@/lib/parrilla'

/** Lo que dice la grilla de cada día, arriba a la derecha. */
const ROTULO_CALOR = {
  apagada: 'Apagada',
  prendida: 'Prendida',
  llena: 'Parrilla llena',
} as const

const CLASE_COCCION: Record<Coccion, string> = {
  cruda: 'corte-cruda',
  sellada: 'corte-sellada',
  punto: 'corte-punto',
  quemada: 'corte-quemada',
}

/** Para el `title` y el lector de pantalla: el color nunca es la única señal. */
const NOMBRE_COCCION: Record<Coccion, string> = {
  cruda: 'Programada',
  sellada: 'Saliendo ahora',
  punto: 'Publicada',
  quemada: 'Falló',
}
```

- [ ] **Step 2: Reemplaza el cuerpo de la columna del día**

El `days.map(...)` completo pasa a:

```tsx
{days.map((day, index) => {
  const cortes = grouped.get(day) ?? []
  const calor = calorDelDia(cortes.length)
  return (
    <div key={day} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            'font-titulo text-[0.65rem] uppercase tracking-[0.14em]',
            day === today ? 'text-fg' : 'text-fg-faint',
          )}
        >
          {dayLabel(day, index)}
        </p>
        <span
          className={cn(
            'font-titulo text-[0.55rem] uppercase tracking-[0.12em]',
            calor === 'llena' ? 'text-brasa' : 'text-fg-faint',
          )}
        >
          {ROTULO_CALOR[calor]}
        </span>
      </div>

      <div
        className={cn(
          'flex min-h-[4.5rem] flex-col gap-2 p-2',
          calor === 'apagada' && 'grilla grilla-apagada justify-center',
          calor === 'prendida' && 'grilla grilla-prendida',
          calor === 'llena' && 'grilla grilla-llena',
          // El día de hoy se marca con el borde, no con el fondo: el fondo ya lo
          // está usando el fuego para contar el volumen.
          day === today && 'ring-1 ring-inset ring-white/25',
        )}
      >
        {cortes.length === 0 ? (
          <p className="text-center text-[0.72rem] italic text-fg-faint">
            No hay nada puesto. Prendela.
          </p>
        ) : (
          cortes.map(({ post, targets, media }) => {
            const coccion = coccionDe(targets.map((t) => t.status))
            return (
              <Link
                key={post.id}
                href={`/admin/schedule/${post.id}?volver=${encodeURIComponent(volver)}`}
                title={`${hourLabel(post.scheduledAt, zone)} — ${NOMBRE_COCCION[coccion]}`}
                className={cn(
                  'corte block p-2 transition-transform hover:-translate-y-0.5',
                  CLASE_COCCION[coccion],
                )}
              >
                <p className="font-titulo text-[0.6rem] tracking-[0.12em] text-fg/70">
                  {hourLabel(post.scheduledAt, zone)}
                  {coccion === 'sellada' ? (
                    <span className="humo ml-1.5 text-brasa">≈ saliendo</span>
                  ) : null}
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
                  ) : post.coverUrl ? (
                    // The designed cover IS the video's preview when there is one.
                    <Image
                      src={post.coverUrl}
                      alt=""
                      width={120}
                      height={64}
                      unoptimized
                      className="mt-1 h-16 w-full rounded object-cover"
                    />
                  ) : (
                    // No controls (the whole card is a link); preload="metadata"
                    // paints the first frame without pulling the file.
                    <video
                      src={media[0].blobUrl}
                      preload="metadata"
                      muted
                      playsInline
                      className="mt-1 h-16 w-full rounded bg-black object-cover"
                    />
                  )
                ) : null}
                <p className="mt-1 line-clamp-2 text-[0.75rem] leading-snug text-fg">
                  {post.caption || '(sin texto)'}
                </p>
                {/* El estado también en palabras: la cocción es la segunda señal, no la única. */}
                <span className="sr-only">{NOMBRE_COCCION[coccion]}</span>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
})}
```

- [ ] **Step 3: Limpia lo que quedó sin uso**

`ScheduledPostTarget` sigue usándose en el tipo `Item`. Comprueba que no quedaron importes muertos:

Ejecuta: `npm run lint && npx tsc --noEmit`
Esperado: los dos limpios. Si el linter marca `DOT` o algún icono sin usar, bórralo.

- [ ] **Step 4: Corre la suite entera**

Ejecuta: `npm test`
Esperado: PASS, todos. Ningún test existente mira este componente, así que una falla acá significa que tocaste algo que no era.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(dash)/schedule/calendar.tsx"
git commit -m "Convierte el calendario en una parrilla con cortes"
```

---

## Cómo se revisa al final

Mirando el preview del PR, contra la maqueta aprobada:

1. Un día con tres o más posts se ve caliente; uno vacío, apagado y punteado, con «No hay nada puesto. Prendela.».
2. Los cuatro estados se distinguen sin leer: cruda clara, quemada casi negra.
3. La miniatura del post **se sigue reconociendo** por debajo de las marcas del fierro. Si no, se baja el 34%, no se quitan las marcas.
4. El corte no parece un sticker. Si lo parece, se oscurece el veteado antes que agrandar el corte.
5. La semana sigue navegándose y cada corte sigue abriendo su editor.
