# Panel con poco a priori — entrega 2: un logo por corte

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada corte de la parrilla y de la cola muestre el logo de cada red a la que va, teñido por su estado, para leer la parrilla de un vistazo sin pasar el cursor.

**Architecture:** un componente `Redes` (`src/app/admin/(dash)/schedule/redes.tsx`) recibe los destinos de un corte y dibuja una fila de iconos, uno por destino, con el color decidido por una función pura (`colorDeDestino`, en `etiqueta.ts`, junto a las que ya nombran el destino). El texto que hoy vive en los chips no se pierde: pasa al `title` de cada icono y a un `sr-only` de la fila. La parrilla y la cola lo montan; el compositor y el editor no.

**Tech Stack:** Next.js (App Router), React, Tailwind, Vitest. Los iconos de las seis redes ya existen en `src/components/icon.tsx` (`<Icon name="instagram" />`, etc.).

**Spec:** `docs/superpowers/specs/2026-09-29-panel-poco-a-priori-design.md`, sección 5. Ante un conflicto, manda la spec.

## Restricciones globales

- **El color del corte lo sigue poniendo la cocción.** Los iconos van en gris (`text-fg-muted`); solo un destino `failed` se tiñe de `negative` y uno `published` de `positive`.
- **Con dos cuentas de la misma red, dos iconos iguales**, cada uno con su handle en `title`.
- **Nada se pierde para el lector de pantalla:** lo que decía el chip («Instagram · vicente: Programado») sigue diciéndose, en `sr-only`.
- **No va en el compositor ni en el editor de un corte**: ahí la red se elige, no se lee.
- **Las frases de error no se tocan.**
- **Comentarios en español; código en inglés y en llano**, con el estilo del archivo que se toca (`calendar.tsx` y `queue.tsx` mezclan; `etiqueta.ts` comenta en español).
- **TDD** en lo puro; un commit por tarea con el pie de autoría del repositorio.
- **La documentación va con la tarea que hace cierto el cambio.**
- **La suite pasa, typecheck, lint y build limpios al final de cada tarea.**

---

### Tarea 1: `colorDeDestino` y el componente `Redes`

**Files:**
- Modify: `src/app/admin/(dash)/schedule/etiqueta.ts`
- Create: `src/app/admin/(dash)/schedule/redes.tsx`
- Test: `src/app/admin/(dash)/schedule/etiqueta.test.ts` (existe; si no, créalo junto a los otros tests de esa carpeta)

**Interfaces:**
- Consumes: `nombreDestino`, `etiquetaDestino` (ya existen en `etiqueta.ts`); `Icon` (`@/components/icon`).
- Produces: `colorDeDestino(status: string): 'gris' | 'positivo' | 'negativo'`; `Redes({ targets, detalle? })`.

- [ ] **Step 1: Escribir el test que falla**

En `etiqueta.test.ts`:

```ts
import { colorDeDestino } from './etiqueta'

describe('colorDeDestino', () => {
  it('solo el fallo y el éxito tiñen; lo demás queda en gris y deja hablar a la cocción', () => {
    expect(colorDeDestino('failed')).toBe('negativo')
    expect(colorDeDestino('published')).toBe('positivo')
    expect(colorDeDestino('scheduled')).toBe('gris')
    expect(colorDeDestino('publishing')).toBe('gris')
    expect(colorDeDestino('lo-que-sea')).toBe('gris')
  })
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run "src/app/admin/(dash)/schedule/etiqueta.test.ts"`

- [ ] **Step 3: La función y el componente**

En `etiqueta.ts`, al final:

```ts
/**
 * Qué tiñe el icono de un destino. Solo dos cosas: que se quemó (rojo) o que ya salió
 * (verde). Programado y publicando quedan en gris a propósito: el color del corte lo pone
 * la cocción, y un icono de colores encima competiría con ella.
 */
export function colorDeDestino(status: string): 'gris' | 'positivo' | 'negativo' {
  if (status === 'failed') return 'negativo'
  if (status === 'published') return 'positivo'
  return 'gris'
}
```

`src/app/admin/(dash)/schedule/redes.tsx`:

```tsx
import { Icon } from '@/components/icon'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { cn } from '@/lib/utils'
import { colorDeDestino, etiquetaDestino, nombreDestino } from './etiqueta'

type Destino = { network: string; handle: string | null; status: string; externalId: string | null; opciones: unknown }

/**
 * Los logos de un corte: un icono por destino, en el orden de los destinos, teñido solo si
 * se quemó o si ya salió. Con `detalle`, cada icono lleva al lado el handle y el estado en
 * palabras (la cola); sin él, solo los iconos (la parrilla, El Fuego). Lo que decía el chip
 * de texto sigue diciéndose: en el `title` de cada icono y en un `sr-only` de la fila, para
 * que el lector de pantalla no pierda nada por haber ganado el logo.
 */
export function Redes({ targets, detalle = false }: { targets: Destino[]; detalle?: boolean }) {
  if (targets.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {targets.map((t, i) => {
        const color = colorDeDestino(t.status)
        const texto = `${nombreDestino(t)}: ${etiquetaDestino(t)}`
        return (
          <span
            key={`${t.network}-${t.handle ?? ''}-${i}`}
            title={texto}
            className={cn('inline-flex items-center gap-1', color === 'gris' && 'text-fg-muted')}
            style={color === 'negativo' ? { color: NEGATIVE } : color === 'positivo' ? { color: POSITIVE } : undefined}
          >
            <Icon name={t.network} className="h-3.5 w-3.5 shrink-0" />
            {detalle ? (
              <span className="text-xs">
                {t.handle ?? nombreDestino(t)}
                <span className="text-fg-faint"> · {etiquetaDestino(t)}</span>
              </span>
            ) : null}
          </span>
        )
      })}
      <span className="sr-only">{targets.map((t) => `${nombreDestino(t)}: ${etiquetaDestino(t)}`).join(', ')}</span>
    </span>
  )
}
```

Comprueba que `NEGATIVE` y `POSITIVE` se exportan de `@/components/charts/theme` (los usa `cuentas.tsx`). `Icon` recibe `className` y dibuja el svg con `fill="currentColor"`, así que el color del contenedor lo tiñe.

- [ ] **Step 4: Correr y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`.

Documentación: `Redes` todavía no se monta en ninguna pantalla; nada que actualizar. Dilo en el informe.

```bash
git add "src/app/admin/(dash)/schedule/etiqueta.ts" "src/app/admin/(dash)/schedule/etiqueta.test.ts" "src/app/admin/(dash)/schedule/redes.tsx"
git commit -m "Los logos de un corte: colorDeDestino y el componente Redes"
```

---

### Tarea 2: La parrilla

**Files:**
- Modify: `src/app/admin/(dash)/schedule/calendar.tsx`

**Interfaces:**
- Consumes: `Redes` (Tarea 1).

- [ ] **Step 1: Montar los logos bajo la hora**

En la celda de un corte (`calendar.tsx`, el `<Link className="corte …">`), justo después del
`<p>` de la hora y antes de la miniatura:

```tsx
                          <Redes targets={targets} />
```

con su import. `targets` ya está a mano en ese sitio (es lo que arma el `title` y el
`sr-only`).

- [ ] **Step 2: No decir dos veces lo mismo**

La celda ya tiene un `<span className="sr-only">` que dice «{cocción} en {destinos}». `Redes`
trae ahora su propio `sr-only` con los destinos, así que el de la celda pasa a decir **solo
la cocción**: `{NOMBRE_COCCION[coccion]}`. Y el `title` del `<Link>` —que también listaba los
destinos— se queda: es lo que se lee al pasar el cursor por la tarjeta entera, y no compite
con los `title` de cada icono porque el navegador muestra el más interno.

- [ ] **Step 3: Mirar, verificar y commitear**

`npm run dev` y `/admin/schedule` en vista calendario, con un corte que tenga dos o más
destinos y otro con un destino fallido: los iconos están bajo la hora, el fallido en rojo,
y la celda no creció más de una línea. Run: `npx vitest run`, `npm run typecheck`, `npm run lint`,
`npm run build`.

Documentación: `README.md` describe cómo se lee un destino en el calendario
(`grep -n "se leen la red\|Instagram · @" README.md`, alrededor de la línea 294): ahora se lee
también con su logo. Corrige esa frase.

```bash
git add "src/app/admin/(dash)/schedule/calendar.tsx" README.md
git commit -m "La parrilla muestra el logo de cada red bajo la hora del corte"
```

---

### Tarea 3: La cola

**Files:**
- Modify: `src/app/admin/(dash)/schedule/queue.tsx`

**Interfaces:**
- Consumes: `Redes` con `detalle` (Tarea 1).

- [ ] **Step 1: El chip de texto pasa a icono + handle + estado**

En `queue.tsx`, el bloque `targets.map((target) => <span … className="rounded-full …">` dibuja
un chip por destino con `{nombreDestino(target)}: {etiquetaDestino(target)}`, y en el fallido,
el motivo y el botón «Reprogramar». Cambia el contenido de cada chip por:

```tsx
                <Redes targets={[target]} detalle />
                {target.status === 'failed' && target.lastError && ` — ${target.lastError}`}
                {/* …el botón Reprogramar, tal cual está… */}
```

Las clases de color del chip (`bg-positive/15 text-positive`, etc.) se quedan: el fondo del
chip y el icono teñido dicen lo mismo, y con los dos la fila se lee aunque uno falle.

- [ ] **Step 2: Mirar, verificar y commitear**

`npm run dev` y `/admin/schedule` en vista cola: cada destino con su logo, su handle y su
estado; un fallido con el motivo y el botón como antes. Run: `npx vitest run`,
`npm run typecheck`, `npm run lint`, `npm run build`.

Documentación: revisa `README.md` con `grep -n "cola" README.md` por si describe el chip de la
cola; si no, dilo en el informe.

```bash
git add "src/app/admin/(dash)/schedule/queue.tsx"
git commit -m "La cola nombra cada destino con su logo"
```

---

## Lo que ningún test comprueba

Que la parrilla se lea de un vistazo. Eso se mira con el dueño, en pantalla, al desplegar.
