# Panel con poco a priori — entrega 1: navegación, Ajustes y vocabulario

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la barra del panel pase de siete u ocho pestañas planas a cinco más un engranaje de Ajustes, con los nombres de la dirección visual y un subtítulo en llano en cada pantalla, sin cambiar ninguna ruta.

**Architecture:** el vocabulario vive en un solo módulo de presentación (`src/lib/vocabulario.ts`): una tabla de pantallas con ruta, nombre, subtítulo y grupo, y tres funciones puras que la leen. La barra (`nav.tsx`) y un componente de encabezado (`Encabezado` en `ui.tsx`) consumen esa tabla; ninguna pantalla vuelve a escribir su propio título a mano. El engranaje es un `<details>` sin estado.

**Tech Stack:** Next.js (App Router), React, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-panel-poco-a-priori-design.md`, secciones 4 y 10. Ante un conflicto, manda la spec.

## Restricciones globales

- **Ninguna ruta cambia.** `/admin`, `/admin/schedule`, `/admin/accounts`… siguen siendo lo que son; un enlace guardado sigue funcionando.
- **Cada pantalla lleva su subtítulo en llano** en `text-fg-faint`, bajo el título. Es la red de seguridad de la dirección visual, obligatoria.
- **El vocabulario vive en un solo módulo.** Ningún archivo fuera de `src/lib/vocabulario.ts` escribe «El Fuego», «Los Fierros», etc.; los demás lo importan.
- **`/admin` sigue siendo el Resumen en esta entrega.** El Fuego llega en la entrega 3; ponerle ese nombre hoy a una página de números sería mentir. La tabla lo dice como es hoy y la entrega 3 la cambia.
- **Las frases de error no se tocan** (tienen tests letra por letra).
- **Comentarios y texto de cara al usuario en español**; el código en inglés y en llano, con el estilo del archivo que se toca.
- **TDD** donde hay lógica; un commit por tarea con el pie de autoría del repositorio.
- **La documentación va con la tarea que hace cierto el cambio**, no al final.
- **La suite pasa, typecheck, lint y build limpios al final de cada tarea.**

---

### Tarea 1: El vocabulario

**Files:**
- Create: `src/lib/vocabulario.ts`
- Test: `src/lib/vocabulario.test.ts`

**Interfaces:**
- Produces: `type Pantalla = { ruta: string; nombre: string; subtitulo: string; grupo: 'pestana' | 'ajustes'; soloAdmin?: true }`; `PANTALLAS: readonly Pantalla[]`; `pestanas(esAdmin: boolean): Pantalla[]`; `ajustes(esAdmin: boolean): Pantalla[]`; `pantallaDe(pathname: string): Pantalla | null`.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/vocabulario.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PANTALLAS, ajustes, pantallaDe, pestanas } from './vocabulario'

describe('el vocabulario del panel', () => {
  it('cada pantalla apunta a una ruta que existe de verdad bajo (dash)', () => {
    // La tabla es de presentación: si alguien renombra una carpeta y no la tabla, la
    // pestaña llevaría a un 404 y ningún typecheck lo vería. El sistema de archivos sí.
    const base = join(process.cwd(), 'src', 'app', 'admin', '(dash)')
    for (const p of PANTALLAS) {
      const carpeta = p.ruta === '/admin' ? base : join(base, p.ruta.replace('/admin/', ''))
      expect(existsSync(join(carpeta, 'page.tsx')), `${p.ruta} no tiene page.tsx`).toBe(true)
    }
  })

  it('no hay dos pantallas con la misma ruta ni con el mismo nombre', () => {
    const rutas = PANTALLAS.map((p) => p.ruta)
    const nombres = PANTALLAS.map((p) => p.nombre)
    expect(new Set(rutas).size).toBe(rutas.length)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it('cinco pestañas, y Ajustes con dos entradas para un usuario y tres para el admin', () => {
    expect(pestanas(false).map((p) => p.ruta)).toEqual([
      '/admin',
      '/admin/schedule',
      '/admin/content',
      '/admin/comments',
      '/admin/analytics',
    ])
    expect(pestanas(true)).toEqual(pestanas(false))
    expect(ajustes(false).map((p) => p.ruta)).toEqual(['/admin/accounts', '/admin/profiles'])
    expect(ajustes(true).map((p) => p.ruta)).toEqual(['/admin/accounts', '/admin/profiles', '/admin/usuarios'])
  })

  it('pantallaDe resuelve por prefijo, y /admin solo exacto', () => {
    expect(pantallaDe('/admin')?.ruta).toBe('/admin')
    expect(pantallaDe('/admin/schedule/abc')?.ruta).toBe('/admin/schedule')
    expect(pantallaDe('/admin/accounts/elegir')?.ruta).toBe('/admin/accounts')
    expect(pantallaDe('/admin/profiles/xyz')?.ruta).toBe('/admin/profiles')
    // Un prefijo de texto que no es un segmento no cuenta: /admin/scheduleX no es la parrilla.
    expect(pantallaDe('/admin/scheduleX')).toBeNull()
    expect(pantallaDe('/ingresar')).toBeNull()
  })

  it('todas llevan subtítulo en llano: es la red de seguridad de los nombres', () => {
    for (const p of PANTALLAS) expect(p.subtitulo.length).toBeGreaterThan(8)
  })
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/vocabulario.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: El módulo**

`src/lib/vocabulario.ts`:

```ts
// El vocabulario del panel, en un solo sitio. La dirección visual (docs/superpowers/specs/
// 2026-09-18-parrilla-direccion-visual-design.md, §2) bautizó cada pantalla con el nombre del
// asado y le exigió un subtítulo en llano debajo, para que a los seis meses se siga
// encontrando todo. Las rutas no cambian nunca: son las de siempre, y esta tabla solo les
// pone nombre. Nadie fuera de este archivo escribe «Los Fierros».
//
// `/admin` se llama Resumen mientras sea la página de números que es hoy; la entrega 3 de
// «el panel con poco a priori» la reemplaza por El Fuego y cambia esta fila, no otra cosa.

export type Pantalla = {
  ruta: string
  nombre: string
  subtitulo: string
  /** Pestaña de la barra, o entrada del engranaje de Ajustes. */
  grupo: 'pestana' | 'ajustes'
  soloAdmin?: true
}

export const PANTALLAS: readonly Pantalla[] = [
  { ruta: '/admin', nombre: 'Resumen', subtitulo: 'tus números de un vistazo', grupo: 'pestana' },
  { ruta: '/admin/schedule', nombre: 'La Parrilla', subtitulo: 'lo que viene y cómo salió lo que ya se fue', grupo: 'pestana' },
  { ruta: '/admin/content', nombre: 'Los Cortes', subtitulo: 'cada publicación y lo que trajo', grupo: 'pestana' },
  { ruta: '/admin/comments', nombre: 'La Mesa', subtitulo: 'lo que te responden y tus respuestas', grupo: 'pestana' },
  { ruta: '/admin/analytics', nombre: 'Los Números', subtitulo: 'visitas, clics y de dónde vienen', grupo: 'pestana' },
  { ruta: '/admin/accounts', nombre: 'Los Fierros', subtitulo: 'tus redes conectadas', grupo: 'ajustes' },
  { ruta: '/admin/profiles', nombre: 'La Vitrina', subtitulo: 'tus páginas públicas', grupo: 'ajustes' },
  { ruta: '/admin/usuarios', nombre: 'Los Maestros', subtitulo: 'quién puede entrar', grupo: 'ajustes', soloAdmin: true },
]

function visibles(esAdmin: boolean): Pantalla[] {
  return PANTALLAS.filter((p) => !p.soloAdmin || esAdmin)
}

export function pestanas(esAdmin: boolean): Pantalla[] {
  return visibles(esAdmin).filter((p) => p.grupo === 'pestana')
}

export function ajustes(esAdmin: boolean): Pantalla[] {
  return visibles(esAdmin).filter((p) => p.grupo === 'ajustes')
}

/**
 * La pantalla a la que pertenece una ruta: `/admin` solo exacta; las demás, por segmento
 * (`/admin/schedule/abc` es La Parrilla, `/admin/scheduleX` no es nada). Devuelve todas las
 * pantallas, incluida la de admin, porque decide qué se marca activo, no qué se muestra.
 */
export function pantallaDe(pathname: string): Pantalla | null {
  if (pathname === '/admin') return PANTALLAS[0]!
  return PANTALLAS.find((p) => p.ruta !== '/admin' && (pathname === p.ruta || pathname.startsWith(`${p.ruta}/`))) ?? null
}
```

- [ ] **Step 4: Correr y verlos pasar, y commitear**

Run: `npx vitest run src/lib/vocabulario.test.ts`, `npm run typecheck`, `npm run lint`.

Documentación: nada que actualizar todavía —la tabla no se ve en pantalla hasta la Tarea 2—; dilo en el informe.

```bash
git add src/lib/vocabulario.ts src/lib/vocabulario.test.ts
git commit -m "El vocabulario del panel vive en un solo módulo"
```

---

### Tarea 2: La barra: cinco pestañas y el engranaje

**Files:**
- Modify: `src/app/admin/(dash)/nav.tsx`
- Modify: `src/app/admin/(dash)/layout.tsx`

**Interfaces:**
- Consumes: `pestanas`, `ajustes`, `pantallaDe` (Tarea 1).

**Por qué un `<details>` y no un menú con estado:** funciona sin JavaScript, el teclado lo abre con Enter y lo cierra con Escape (comportamiento nativo), y se cierra solo al navegar porque la página cambia. Un menú «controlado» reharía todo eso a mano.

- [ ] **Step 1: La barra**

`src/app/admin/(dash)/nav.tsx` entero:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ajustes, pantallaDe, pestanas } from '@/lib/vocabulario'
import { cn } from '@/lib/utils'

/**
 * Cinco pestañas y un engranaje. Lo que no pide una acción todos los días —las cuentas, las
 * páginas públicas, quién entra— va dentro de Ajustes: sigue a un clic, pero ya no ocupa la
 * barra. Los nombres y las rutas salen del vocabulario; acá no se escribe ninguno.
 */
export function AdminNav({ esAdmin }: { esAdmin?: boolean }) {
  const pathname = usePathname()
  const actual = pantallaDe(pathname)
  const enAjustes = actual?.grupo === 'ajustes'

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Secciones del panel">
      <div className="flex items-center gap-1 overflow-x-auto">
        {pestanas(Boolean(esAdmin)).map((p) => {
          const active = actual?.ruta === p.ruta
          return (
            <Link
              key={p.ruta}
              href={p.ruta}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                active ? 'bg-brasa text-acero-950' : 'text-fg-muted hover:text-fg',
              )}
            >
              {p.nombre}
            </Link>
          )
        })}
      </div>

      {/*
        Un `<details>`: sin estado, sin JavaScript, con teclado. Se cierra solo al navegar
        porque la página cambia. Una ruta de Ajustes activa marca el engranaje, no una
        pestaña — el usuario tiene que poder ver dónde está aunque el menú esté cerrado.
      */}
      <details className="relative ml-auto">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors [&::-webkit-details-marker]:hidden',
            enAjustes ? 'bg-brasa text-acero-950' : 'text-fg-muted hover:text-fg',
          )}
          aria-label="Ajustes"
        >
          <Settings className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Ajustes</span>
        </summary>
        <ul className="chapa absolute right-0 z-40 mt-2 w-64 rounded-xl p-2">
          {ajustes(Boolean(esAdmin)).map((p) => {
            const active = actual?.ruta === p.ruta
            return (
              <li key={p.ruta}>
                <Link
                  href={p.ruta}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-2 transition-colors',
                    active ? 'bg-brasa text-acero-950' : 'hover:bg-white/[0.06]',
                  )}
                >
                  <span className="block text-sm">{p.nombre}</span>
                  <span className={cn('block text-[0.72rem]', active ? 'text-acero-950/80' : 'text-fg-faint')}>
                    {p.subtitulo}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </details>
    </nav>
  )
}
```

Comprueba que `lucide-react` exporta `Settings` (el proyecto ya usa `lucide-react` en `cuentas.tsx`; si el nombre difiere en la versión instalada, usa el equivalente y dilo).

- [ ] **Step 2: El layout**

En `layout.tsx`, la fila del `header` hoy es `[Panel] [nav] [Salir a la derecha]`. Con el
engranaje dentro de `nav` con `ml-auto`, «Salir» tiene que seguir a la derecha del
engranaje: quita el `ml-auto` del `<form>` y deja que `nav` (que ahora es `flex-1`) empuje.
Comprueba a ancho de teléfono (375 px) con `npm run dev` que las cinco pestañas y el
engranaje caben en una fila y que «Salir» no se corta; si las pestañas necesitan
desplazarse, el `overflow-x-auto` del contenedor interno lo permite.

- [ ] **Step 3: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. Y a mano en
`npm run dev`: abrir `/admin/accounts` y ver el engranaje marcado; abrir el menú con el
teclado (Tab hasta el engranaje, Enter); un usuario no admin (si tienes cómo) no ve Los
Maestros.

Documentación: `README.md` describe el panel con sus pestañas en varios sitios
(`grep -n "pestaña\|Analítica\|Cuentas\*\*" README.md`). En esta tarea las pantallas todavía
se titulan como antes (la Tarea 3 les pone el nombre nuevo), así que **espera a la Tarea 3
para reescribir el README**, y dilo en el informe.

```bash
git add "src/app/admin/(dash)/nav.tsx" "src/app/admin/(dash)/layout.tsx"
git commit -m "La barra del panel: cinco pestañas y un engranaje de Ajustes"
```

---

### Tarea 3: El encabezado con subtítulo, en cada pantalla

**Files:**
- Modify: `src/components/ui.tsx` (nuevo `Encabezado`)
- Modify: las ocho páginas de `src/app/admin/(dash)/`: `page.tsx`, `schedule/page.tsx`, `content/page.tsx`, `comments/page.tsx`, `analytics/page.tsx`, `accounts/page.tsx`, `profiles/page.tsx`, `usuarios/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `pantallaDe` (Tarea 1).
- Produces: `Encabezado({ ruta, children? })`.

**Lo que hay hoy:** las ocho páginas repiten el mismo `<h1 className="font-titulo text-2xl font-semibold uppercase tracking-[0.03em]">Nombre</h1>`, a veces dentro de un `div` con algo a la derecha (un selector de período, un botón). El encabezado nuevo reemplaza el `h1` y **conserva lo que había a su derecha**: se pasa como `children`.

- [ ] **Step 1: El componente**

En `src/components/ui.tsx`:

```tsx
import { pantallaDe } from '@/lib/vocabulario'

/**
 * El título de una pantalla del panel, con su subtítulo en llano debajo: la red de
 * seguridad de los nombres del asado (dirección visual, §2). Sale del vocabulario, así que
 * una pantalla no puede llamarse distinto en la barra y en su título. `children` es lo que
 * la pantalla quiera a la derecha —un selector, un botón— y se alinea con el título.
 */
export function Encabezado({ ruta, children }: { ruta: string; children?: React.ReactNode }) {
  const pantalla = pantallaDe(ruta)
  if (!pantalla) throw new Error(`Encabezado: ${ruta} no está en el vocabulario`)
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-titulo text-2xl font-semibold uppercase tracking-[0.03em]">{pantalla.nombre}</h1>
        <p className="mt-0.5 text-[0.78rem] text-fg-faint">{pantalla.subtitulo}</p>
      </div>
      {children}
    </div>
  )
}
```

Si `ui.tsx` es un módulo cliente (`'use client'` arriba) y `vocabulario.ts` es puro, el
import es válido en los dos mundos. Si `ui.tsx` no tiene `'use client'`, tampoco pasa nada:
`Encabezado` no usa hooks.

- [ ] **Step 2: Cada página**

En cada una de las ocho páginas, reemplaza el bloque del `h1` por
`<Encabezado ruta="/admin/…">` con el mismo `ruta` que la página. Lo que estaba al lado del
`h1` (mira cada archivo: `analytics/page.tsx` tiene un selector, `schedule/page.tsx` un
conmutador de vista, otras un botón) pasa dentro como `children`. Lo que estaba **debajo**
del `h1` como texto de ayuda propio de la página se queda donde estaba: el subtítulo en llano
es adicional, no lo reemplaza. `profiles/[id]/page.tsx` no se toca: su `h1` es el nombre del
perfil, no el de una pantalla.

Comprueba con `grep -rn "text-2xl font-semibold uppercase" "src/app/admin/(dash)"` que
solo queda la de `profiles/[id]`.

- [ ] **Step 3: El README**

`README.md` nombra las pestañas por su nombre viejo en varios sitios. Busca, no recuerdes:
`grep -n "pestaña\|Resumen\|Analítica\|Contenido\*\|Comentarios\*\|Cuentas\*\*\|Perfiles\|Usuarios" README.md`.
Dos cosas:

1. En la sección que describe el panel (la primera vez que aparecen las pestañas), un
   párrafo con el mapa: cinco pestañas —El Resumen (los números de un vistazo, hasta que lo
   reemplace El Fuego), La Parrilla (Calendario), Los Cortes (Contenido), La Mesa
   (Comentarios), Los Números (Analítica)— y el engranaje de Ajustes con Los Fierros
   (Cuentas), La Vitrina (Perfiles) y Los Maestros (Usuarios, solo el admin). Las rutas no
   cambiaron. Cada pantalla lleva su subtítulo en llano por si el nombre no dice nada.
2. Donde el README **instruye** a ir a una pestaña («entra a la pestaña **Cuentas**»), pon el
   nombre nuevo con el viejo entre paréntesis y dónde está: «entra a **Los Fierros** (Cuentas,
   dentro de Ajustes)». Donde solo la menciona de pasada, déjalo.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano: cada una de
las ocho pantallas muestra el nombre nuevo y su subtítulo; nada de lo que había a la derecha
del título se perdió.

```bash
git add src/components/ui.tsx "src/app/admin/(dash)" README.md
git commit -m "Cada pantalla del panel lleva su nombre y su subtítulo en llano"
```

---

## Qué queda para las entregas 2 y 3

- Entrega 2: el componente `Redes` (logos por corte) en la parrilla y la cola.
- Entrega 3: El Fuego en `/admin` —cambia la primera fila del vocabulario—, y la mudanza de
  los cinco paneles del Resumen a Los Números.
