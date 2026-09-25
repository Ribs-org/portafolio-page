# La página de cada usuario — Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para ir marcando.

**Objetivo:** Que invitar a alguien le dé su página pública automáticamente, con una dirección sacada de su correo, y que cada dominio sirva solo lo que le corresponde.

**Arquitectura:** Un módulo puro decide direcciones (`src/lib/slugs.ts`); `invitar()` y `asegurarAdmin()` crean usuario y perfil en la misma operación, reintentando si la dirección choca; y `/[slug]` deja de servir páginas ajenas cuando el dominio no es el del producto.

**Stack:** Next.js App Router, Drizzle sobre `postgres-js`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-pagina-de-cada-usuario-design.md`

## Restricciones globales

- **Los comentarios y el texto de cara al usuario van en español.** El código y los nombres de símbolos siguen el estilo del archivo que se toca.
- **Sin `DOMINIO_PRODUCTO` configurada, nada cambia.** `esDominioDelProducto()` ya garantiza esto y no se toca.
- **Ningún perfil existente se mueve, se renombra ni se borra.**
- **TDD:** primero el test que falla, después el código mínimo.
- **Un commit por tarea**, con el pie de autoría que usa el repositorio.
- La dirección de una página se guarda en `profiles.slug`, que ya tiene restricción de unicidad global.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/slugs.ts` | **nuevo.** Puro, sin base de datos: qué direcciones están reservadas, cómo se saca una de un correo, y cómo se numera un desempate. |
| `src/lib/slugs.test.ts` | **nuevo.** Incluye la prueba que lee las rutas reales del disco. |
| `src/lib/usuarios.ts` | `invitar()` y `asegurarAdmin()` crean también el perfil, con reintento ante choque. |
| `src/lib/profiles.ts` | `getProfileBySlug` acepta un dueño opcional para acotar la búsqueda. |
| `src/app/[slug]/page.tsx` | Responde 404 si la página no es del dueño del dominio. |

`src/app/page.tsx` **no se toca**: su rama de perfil ya resuelve con `adminId()`, que es exactamente «el dueño de este dominio» mientras no existan dominios de terceros.

---

### Tarea 1: El módulo de direcciones

**Archivos:**
- Crear: `src/lib/slugs.ts`
- Crear: `src/lib/slugs.test.ts`

**Interfaces:**
- Consume: `slugify(raw: string): string` de `src/lib/utils.ts` (ya existe: quita tildes, baja a minúsculas, une con guiones, corta en 60).
- Produce, y lo usan las tareas 2 y 3:
  - `RESERVADOS: ReadonlySet<string>`
  - `esReservado(slug: string): boolean`
  - `direccionBase(correo: string): string`
  - `candidato(base: string, intento: number): string`

- [ ] **Paso 1: Escribir el test que falla**

Crear `src/lib/slugs.test.ts`:

```ts
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { candidato, direccionBase, esReservado, RESERVADOS } from './slugs'

describe('direccionBase', () => {
  it('toma lo que va antes de la arroba', () => {
    expect(direccionBase('juanito@gmail.com')).toBe('juanito')
  })

  it('pasa por slugify: tildes, mayúsculas y puntos', () => {
    expect(direccionBase('Juan.Pérez@empresa.cl')).toBe('juan-perez')
  })

  it('un correo sin parte usable cae en algo válido y nunca en cadena vacía', () => {
    expect(direccionBase('...@gmail.com')).toBe('pagina')
    expect(direccionBase('')).toBe('pagina')
  })
})

describe('esReservado', () => {
  it('protege las rutas que la app ya usa', () => {
    expect(esReservado('admin')).toBe(true)
    expect(esReservado('api')).toBe(true)
    expect(esReservado('ingresar')).toBe(true)
  })

  it('no distingue mayúsculas', () => {
    expect(esReservado('ADMIN')).toBe(true)
  })

  it('deja pasar una dirección normal', () => {
    expect(esReservado('juanito')).toBe(false)
  })
})

describe('candidato', () => {
  it('el primer intento es la base pelada', () => {
    expect(candidato('juanito', 1)).toBe('juanito')
  })

  it('a partir del segundo, numera', () => {
    expect(candidato('juanito', 2)).toBe('juanito-2')
    expect(candidato('juanito', 3)).toBe('juanito-3')
  })
})

/**
 * Esta es la que no envejece. Una lista escrita a mano se queda atrás: el día que alguien
 * agregue `/precios`, nadie se va a acordar de `RESERVADOS`, y el primer usuario con correo
 * `precios@` se encontraría con una página invisible y ningún error que se lo explique.
 * Por eso no se compara contra una lista fija: se leen del disco las rutas que existen.
 */
describe('la lista cubre las rutas reales', () => {
  const deApp = readdirSync('src/app', { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('('))
    .map((e) => e.name)

  // Solo lo que podría colisionar: `slugify` borra los puntos, así que una dirección
  // generada nunca contiene uno y un nombre con punto —los .svg, los .txt de TikTok— no
  // puede chocar con ninguna. Se filtran para que el test mida lo que importa.
  const sinPunto = (n: string) => !n.includes('.')
  const dePublic = readdirSync('public', { withFileTypes: true }).map((e) => e.name).filter(sinPunto)

  // Los grupos de rutas como `(legal)` no salen en la URL, pero sus hijos sí.
  const deGrupos = readdirSync('src/app', { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('('))
    .flatMap((g) =>
      readdirSync(`src/app/${g.name}`, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    )

  it.each([...deApp, ...deGrupos, ...dePublic])('«%s» está reservada', (ruta) => {
    expect(esReservado(ruta)).toBe(true)
  })
})
```

- [ ] **Paso 2: Correrlo y ver que falla**

Ejecutar: `npx vitest run src/lib/slugs.test.ts`
Esperado: FALLA con `Cannot find module './slugs'`.

- [ ] **Paso 3: Escribir el módulo**

Crear `src/lib/slugs.ts`:

```ts
import { slugify } from './utils'

/**
 * Las direcciones que la app ya ocupa.
 *
 * Hacen falta desde que la dirección de cada página se genera sola a partir del correo.
 * Alguien con correo `admin@unaempresa.cl` recibiría `admin`, y su página quedaría en
 * `/admin`, que es el panel: Next resuelve primero las rutas reales y la comodín `/[slug]`
 * pierde. Vería el panel en vez de su página, sin ningún mensaje que se lo explique.
 *
 * `slugs.test.ts` lee las rutas del disco y exige que todas estén acá, así que agregar una
 * ruta y olvidarse de esta lista rompe el test en vez de romper a un usuario.
 */
export const RESERVADOS: ReadonlySet<string> = new Set([
  // Rutas de `src/app`
  'admin',
  'api',
  'ingresar',
  'landing',
  'privacidad',
  'terminos',
  // Archivos servidos desde la raíz. Una dirección generada nunca los alcanza, porque
  // `slugify` borra los puntos; se reservan por si alguien escribe uno a mano en el panel.
  'icon.svg',
  'robots.txt',
  'sitemap.xml',
  // `public/`
  'docs',
  'file.svg',
  'globe.svg',
  'next.svg',
  'vercel.svg',
  'window.svg',
  // Del framework, nunca llegan a `/[slug]` pero se reservan igual
  '_next',
  'favicon.ico',
])

export function esReservado(slug: string): boolean {
  return RESERVADOS.has(slug.trim().toLowerCase())
}

/**
 * La dirección que le toca a un correo. `pagina` es el piso: un correo cuya parte local no
 * deja ninguna letra ni número —`...@gmail.com`— no puede terminar en cadena vacía, porque
 * la columna es única y una segunda cadena vacía haría fallar el alta sin explicar por qué.
 */
export function direccionBase(correo: string): string {
  const local = correo.split('@')[0] ?? ''
  return slugify(local) || 'pagina'
}

/** El intento 1 es la base pelada; del 2 en adelante se numera. */
export function candidato(base: string, intento: number): string {
  return intento <= 1 ? base : `${base}-${intento}`
}
```

- [ ] **Paso 4: Correr y ver que pasa**

Ejecutar: `npx vitest run src/lib/slugs.test.ts`
Esperado: PASA. Si alguna ruta del disco no está en `RESERVADOS`, el test dice cuál: agregarla a la lista.

- [ ] **Paso 5: Verificar el resto**

Ejecutar: `npm run typecheck && npm run lint`
Esperado: los dos sin salida de error.

- [ ] **Paso 6: Commitear**

```bash
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "$(printf 'Reserva las direcciones que la app ya ocupa\n\nDesde que la dirección de cada página sale del correo, alguien con correo\nadmin@ recibiría la dirección «admin» y su página quedaría en /admin, que es\nel panel: Next resuelve primero las rutas reales. Vería el panel en vez de su\npágina y sin ningún error que se lo explique.\n\nLa lista no se compara contra una copia escrita a mano: el test lee las rutas\nde src/app y public/ del disco y exige que todas estén reservadas, así que\nagregar una ruta y olvidar la lista rompe el test y no a un usuario.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

### Tarea 2: Elegir una dirección libre

El desempate necesita preguntarle a la base si una dirección quedó, pero esa pregunta es un
efecto y no lógica. Se separan: la lógica decide qué candidatos probar y en qué orden, y
recibe como argumento la función que intenta. Así se prueba entera sin base de datos, que
es lo que permite que corra en CI, donde no hay `DATABASE_URL`.

**Archivos:**
- Modificar: `src/lib/slugs.ts`
- Modificar: `src/lib/slugs.test.ts`

**Interfaces:**
- Consume: `esReservado`, `candidato`, `direccionBase` de la tarea 1.
- Produce, y la usa la tarea 3:
  `primeraDireccionLibre(base: string, intentar: (slug: string) => Promise<boolean>, tope?: number): Promise<string>`
  Devuelve la dirección que quedó. Lanza `Error` si se agota el tope.

- [ ] **Paso 1: Escribir el test que falla**

Agregar al final de `src/lib/slugs.test.ts`:

```ts
describe('primeraDireccionLibre', () => {
  it('si la base está libre, esa es', async () => {
    const intentados: string[] = []
    const dir = await primeraDireccionLibre('juanito', async (s) => {
      intentados.push(s)
      return true
    })
    expect(dir).toBe('juanito')
    expect(intentados).toEqual(['juanito'])
  })

  it('numera hasta encontrar una que quede', async () => {
    const tomadas = new Set(['juanito', 'juanito-2'])
    const dir = await primeraDireccionLibre('juanito', async (s) => !tomadas.has(s))
    expect(dir).toBe('juanito-3')
  })

  it('se saltea las reservadas sin siquiera intentarlas', async () => {
    const intentados: string[] = []
    const dir = await primeraDireccionLibre('admin', async (s) => {
      intentados.push(s)
      return true
    })
    // «admin» está reservada: no se intenta contra la base, se pasa directo al desempate.
    expect(intentados).toEqual(['admin-2'])
    expect(dir).toBe('admin-2')
  })

  it('se rinde con un error claro en vez de intentar para siempre', async () => {
    await expect(primeraDireccionLibre('juanito', async () => false, 3)).rejects.toThrow(
      /no se pudo elegir una dirección/i,
    )
  })
})
```

Y agregar `primeraDireccionLibre` al `import` de arriba del archivo.

- [ ] **Paso 2: Correrlo y ver que falla**

Ejecutar: `npx vitest run src/lib/slugs.test.ts`
Esperado: FALLA con `primeraDireccionLibre is not a function`.

- [ ] **Paso 3: Implementar**

Agregar al final de `src/lib/slugs.ts`:

```ts
/**
 * La primera dirección de la serie que quede.
 *
 * `intentar` es el efecto —en producción, insertar la fila— y devuelve si quedó. Está
 * inyectado a propósito: la única garantía real de unicidad es la restricción de la base,
 * porque dos invitaciones simultáneas pueden elegir el mismo número y solo una gana. Con
 * el efecto afuera, toda esta lógica se prueba sin base, que es lo que hace falta para que
 * corra en CI.
 */
export async function primeraDireccionLibre(
  base: string,
  intentar: (slug: string) => Promise<boolean>,
  tope = 20,
): Promise<string> {
  for (let intento = 1; intento <= tope; intento++) {
    const slug = candidato(base, intento)
    if (esReservado(slug)) continue
    if (await intentar(slug)) return slug
  }
  throw new Error(`No se pudo elegir una dirección para «${base}» en ${tope} intentos.`)
}
```

- [ ] **Paso 4: Correr y ver que pasa**

Ejecutar: `npx vitest run src/lib/slugs.test.ts`
Esperado: PASA, incluidos los de la tarea 1.

- [ ] **Paso 5: Verificar el resto**

Ejecutar: `npm run typecheck && npm run lint`

- [ ] **Paso 6: Commitear**

```bash
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "$(printf 'Elige la primera dirección libre, con el efecto afuera\n\nEl desempate necesita preguntarle a la base si una dirección quedó, pero esa\npregunta es un efecto y no lógica. Va inyectada: así la elección se prueba\nentera sin base, que es lo que permite correrla en CI, donde no hay\nDATABASE_URL.\n\nLa única garantía real de unicidad sigue siendo la restricción de la columna:\ndos invitaciones simultáneas pueden elegir el mismo número y solo una gana.\nPor eso «intentar» devuelve si quedó, en vez de consultar antes y confiar.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

---

### Tarea 3: La página nace con el usuario

**Archivos:**
- Modificar: `src/lib/usuarios.ts` (`asegurarAdmin` en la línea 35, `invitar` en la 72)

**Interfaces:**
- Consume: `direccionBase`, `primeraDireccionLibre` de las tareas 1 y 2.
- Produce: nada nuevo hacia afuera. `invitar()` mantiene su firma
  `(correoBruto: string, nombre: string | null) => Promise<{ usuario: Usuario } | { error: string }>`.

- [ ] **Paso 1: Agregar el ayudante que crea el perfil**

Agregar en `src/lib/usuarios.ts`, después de los `import` existentes:

```ts
import { direccionBase, primeraDireccionLibre } from './slugs'
```

Y esta función privada, antes de `asegurarAdmin`:

```ts
/**
 * Un choque con la restricción de unicidad, que Postgres reporta como 23505.
 *
 * Drizzle envuelve el error del driver y deja el original en `cause`, así que se mira en
 * los dos lugares: sin esto, un choque se confundiría con una falla real y la invitación
 * moriría en vez de probar el número siguiente.
 */
function esChoqueDeUnicidad(error: unknown): boolean {
  const propio = (error as { code?: string })?.code
  const debajo = (error as { cause?: { code?: string } })?.cause?.code
  return propio === '23505' || debajo === '23505'
}

/**
 * La página que acompaña a cada usuario desde que existe.
 *
 * Nace publicada y sin `noindex`: una página que nadie puede ver no le sirve a nadie. Y
 * nace acá y no en el primer ingreso para que el invariante sea simple: todo usuario tiene
 * exactamente una página, siempre, y ningún código aguas abajo tiene que resolver qué
 * hacer con un usuario sin ella.
 */
async function crearPaginaDe(usuario: Usuario): Promise<void> {
  const base = direccionBase(usuario.correo)
  const nombre = usuario.nombre?.trim() || base

  await primeraDireccionLibre(base, async (slug) => {
    try {
      await getDb().insert(profiles).values({
        ownerId: usuario.id,
        slug,
        displayName: nombre,
        isDefault: true,
        isPublished: true,
        noindex: false,
      })
      return true
    } catch (error) {
      if (esChoqueDeUnicidad(error)) return false
      throw error
    }
  })
}
```

Agregar `profiles` al `import` de `@/db` que ya existe en la primera línea del archivo.

- [ ] **Paso 2: Llamarla desde `invitar`**

Reemplazar el cuerpo de `invitar` por:

```ts
export async function invitar(correoBruto: string, nombre: string | null): Promise<{ usuario: Usuario } | { error: string }> {
  const correo = normalizarCorreo(correoBruto)
  if (!correo) return { error: CORREO_INVALIDO }
  if (await buscarPorCorreo(correo)) return { error: USUARIO_YA_INVITADO }
  const [usuario] = await getDb().insert(users).values({ correo, nombre: nombre?.trim() || null }).returning()
  await crearPaginaDe(usuario!)
  return { usuario: usuario! }
}
```

- [ ] **Paso 3: Llamarla desde `asegurarAdmin`**

`asegurarAdmin` es idempotente y corre en cada despliegue, así que solo debe crear la
página la primera vez. Reemplazar su cuerpo por:

```ts
export async function asegurarAdmin(): Promise<Usuario> {
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) throw new Error('ADMIN_EMAIL no está configurada o no es un correo')
  const db = getDb()
  const [fila] = await db
    .insert(users)
    .values({ correo, rol: 'admin' })
    .onConflictDoUpdate({ target: users.correo, set: { rol: 'admin', updatedAt: new Date() } })
    .returning()

  // Solo la primera vez. Esta función corre en cada build, y el dueño ya tiene sus
  // páginas: crear otra en cada despliegue sería una fila nueva por despliegue.
  const [tiene] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, fila!.id)).limit(1)
  if (!tiene) await crearPaginaDe(fila!)

  return fila!
}
```

- [ ] **Paso 4: Verificar que nada se rompió**

Ejecutar: `npm run test && npm run typecheck && npm run lint`
Esperado: los 676 tests que ya había siguen pasando, más los nuevos de las tareas 1 y 2.

> No se escribe un test automático de `invitar` contra la base: el CI corre sin
> `DATABASE_URL` a propósito, y la lógica que podía equivocarse —elegir la dirección,
> saltear reservadas, desempatar, rendirse— ya está probada entera en la tarea 2. Lo que
> queda sin cubrir es que las piezas se toquen, y eso se verifica a mano en el paso 6.

- [ ] **Paso 5: Commitear**

```bash
git add src/lib/usuarios.ts
git commit -m "$(printf 'Le da su página a cada usuario desde que existe\n\nInvitar a alguien creaba su fila y nada más: entraba al panel y no tenía\npágina, porque los perfiles se crean a mano o los siembra el script. Un\nproducto donde cada creador tiene su página no puede empezar pidiéndole que\nla cree.\n\nNace con el usuario y no en su primer ingreso para que el invariante sea\nsimple: todo usuario tiene exactamente una página, siempre. Publicada y sin\nnoindex, porque una página que nadie puede ver no le sirve a nadie.\n\nUn choque de unicidad se reconoce por el código 23505 y en los dos lugares\ndonde puede venir, porque Drizzle envuelve el error del driver: sin eso, un\nchoque se confundiría con una falla real y la invitación moriría en vez de\nprobar el número siguiente.\n\nasegurarAdmin corre en cada build, así que solo crea la página si el dueño no\ntiene ninguna.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Paso 6: Probarlo a mano en un preview**

Esta es la única prueba de que las piezas se tocan. En el preview del PR:

1. Entrar al panel como admin, ir a Usuarios e invitar un correo nuevo, por ejemplo `prueba.nueva@gmail.com`.
2. Verificar que la lista lo muestre sin error.
3. Abrir `<preview>/prueba-nueva` y ver una página vacía pero viva, con ese nombre.
4. Invitar `prueba.nueva@otrodominio.cl` y verificar que su página quede en `/prueba-nueva-2`.

---

### Tarea 4: Cada dominio sirve lo suyo

Hoy `/[slug]` busca en toda la tabla, así que `vicente-pareja.cl/juanito` muestra la página
de Juanito en el dominio personal del dueño. La regla de la spec: **un dominio sirve las
páginas de su dueño; el del producto las sirve todas.**

El perfil de «círculo cercano» del dueño, que se comparte por dirección secreta desde su
propio dominio, **tiene que seguir funcionando**. Por eso la regla es por dueño y no
«los slugs solo viven en el dominio del producto», que lo habría roto sin avisar.

**Archivos:**
- Modificar: `src/lib/profiles.ts` (`getProfileBySlug`, línea 6)
- Modificar: `src/app/[slug]/page.tsx`

**Interfaces:**
- Consume: `esDominioDelProducto(host)` de `src/lib/dominios.ts`, `adminId()` de `src/lib/usuarios.ts`.
- Produce: `getProfileBySlug(slug: string, ownerId?: string): Promise<Profile | null>` — con
  `ownerId`, solo devuelve la fila si es de ese dueño.

- [ ] **Paso 1: Acotar la búsqueda por dueño**

En `src/lib/profiles.ts`, reemplazar `getProfileBySlug` por:

```ts
/**
 * La página de esa dirección, y con `ownerId`, solo si es de ese dueño.
 *
 * El filtro va en el SQL y no después en memoria: una página ajena no debe salir de la
 * base para que alguien la descarte más tarde, que es como se filtran los datos sin querer.
 */
export async function getProfileBySlug(slug: string, ownerId?: string): Promise<Profile | null> {
  const [row] = await getDb()
    .select()
    .from(profiles)
    .where(ownerId ? and(eq(profiles.slug, slug), eq(profiles.ownerId, ownerId)) : eq(profiles.slug, slug))
    .limit(1)
  return row ?? null
}
```

`and` y `eq` ya están importados en ese archivo.

- [ ] **Paso 2: Usar el host en la ruta**

Reemplazar `src/app/[slug]/page.tsx` por:

```tsx
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { esDominioDelProducto } from '@/lib/dominios'
import { getProfileBySlug } from '@/lib/profiles'
import { profileMetadata, renderProfile, type SearchParams } from '@/lib/serve-profile'
import { adminId } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

/**
 * Un dominio sirve las páginas de su dueño; el del producto las sirve todas.
 *
 * «El dueño del dominio» hoy es siempre el admin, porque no existe una tabla que relacione
 * dominios con usuarios. Es deliberado: la regla queda escrita y el día que haya dominios
 * de terceros se reemplaza solo esta resolución.
 */
async function duenoDelDominio(): Promise<string | undefined> {
  const host = (await headers()).get('host')
  return esDominioDelProducto(host) ? undefined : await adminId()
}

async function load(slug: string) {
  try {
    const profile = await getProfileBySlug(slug, await duenoDelDominio())
    return profile?.isPublished ? profile : null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const profile = await load((await params).slug)
  return profile ? profileMetadata(profile) : { title: 'No encontrado' }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const profile = await load((await params).slug)
  if (!profile) notFound()
  return renderProfile(profile, await searchParams)
}
```

- [ ] **Paso 3: Verificar**

Ejecutar: `npm run test && npm run typecheck && npm run lint && npm run build`
Esperado: todo verde.

- [ ] **Paso 4: Commitear**

```bash
git add src/lib/profiles.ts "src/app/[slug]/page.tsx"
git commit -m "$(printf 'Hace que cada dominio sirva solo lo suyo\n\n/[slug] buscaba en toda la tabla, así que la página de cualquier usuario se\nveía desde el dominio personal del dueño. Ahora un dominio sirve las páginas\nde su dueño, y el del producto las sirve todas.\n\nLa regla es por dueño y no «los slugs solo viven en el dominio del producto»\nporque el dueño comparte un perfil de círculo cercano por dirección secreta\ndesde su propio dominio: la regla simple lo habría roto sin avisar. Y esta\ngeneraliza sola el día que haya dominios de terceros.\n\nEl filtro va en el SQL y no después en memoria: una página ajena no debe salir\nde la base para que alguien la descarte más tarde.\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Paso 5: Probarlo a mano**

En el preview, que **no** es el dominio del producto, así que se comporta como el dominio
del dueño:

1. Abrir `<preview>/<slug del dueño>` → se ve.
2. Abrir `<preview>/prueba-nueva` (la del usuario invitado en la tarea 3) → **404**.
3. Con `DOMINIO_PRODUCTO` puesta en Preview al host del preview, repetir el punto 2 → ahora sí se ve.

---

## Cabos que este plan no cierra

- **El dueño tiene más de un perfil y la regla nueva dice uno por usuario.** Ninguno se
  toca y nada se rompe, pero el panel sigue dejando crear más desde `/admin/profiles`. Es
  una decisión del dueño, anotada en la spec y no resuelta acá.
- **Cambiar la dirección desde el panel** ya funciona: `updateProfile` acepta el slug. No
  valida contra `RESERVADOS`, así que alguien podría escribir `admin` a mano. Vale una
  entrega chica aparte.
