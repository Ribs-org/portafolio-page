# Usuarios 2: dueño en todo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las seis tablas raíz tengan dueño, que ninguna consulta a una tabla con dueño salga sin su filtro, que OAuth guarde cada cuenta a nombre de quien la conectó, que el destino de un post sea siempre una cuenta del mismo dueño, y que las filas que ya existen queden a nombre del admin sin perder nada ni reconectar nada. Al terminar, dos usuarios en la misma base no se ven.

**Architecture:** Una migración aditiva agrega `owner_id` **nulable** a `profiles`, `social_accounts`, `scheduled_posts`, `source_authors`, `social_posts` y `ajustes`; las demás tablas heredan por clave foránea. El paso de migrado en el despliegue adopta las filas sin dueño a nombre del admin. Después, el dueño se enhebra por capas: cada función de `src/lib/` que toca una tabla con dueño recibe `ownerId` como **primer argumento**, y cada quien lo consigue donde ya tiene identidad (`requireUser()` en el panel, `requireMobileUser()` en el teléfono, `asegurarAdmin()` en lo que corre con llave de API, y **la fila misma** en los crons, que siguen recorriendo todas las cuentas).

**Tech Stack:** Next.js 16 App Router (server actions, páginas server), Drizzle ORM sobre Neon (driver HTTP, sin transacciones entre consultas), Vitest, `jose` para el `state` de OAuth.

**Spec:** `docs/superpowers/specs/2026-09-16-usuarios-e-inquilinos-design.md`, secciones «1. Datos» (`owner_id`, únicas, coherencia post ↔ destino, migraciones), «6. El usuario en cada consulta», «7. OAuth atado al usuario», «8. Migración del dueño y despliegue», «Testing» y «Las entregas» punto 2.

Rama: `dueno-en-todo`, nacida de `usuarios` (entrega 1, PR #87). Mientras el #87 no esté en `main`, esta rama lo contiene entero.

## Decisiones de este plan (desviaciones y huecos que la spec no cerraba)

1. **El admin no puede nacer en el SQL.** La spec pedía que la migración insertara al dueño; el SQL generado no lee `ADMIN_EMAIL`. En la entrega 1 lo resolvió `asegurarAdmin()` en el primer uso. Aquí el relleno no puede depender de que alguien entre: `scripts/migrar.ts` gana un paso posterior a las migraciones que, si hay `ADMIN_EMAIL`, crea al admin y adopta a su nombre toda fila con `owner_id IS NULL` en las seis tablas. Es idempotente y corre en cada despliegue, así que la entrega 3 podrá poner `NOT NULL` sin sorpresas.
2. **`owner_id` queda nulable en esta entrega.** `NOT NULL` y las únicas nuevas son la entrega 3, cuando ya nada escribe sin dueño. Por eso ningún tipo de TypeScript vuelve obligatorio el campo al leer.
3. **`usuarioAdmin()` no existe: se usa `asegurarAdmin()`.** Ya es idempotente y ya devuelve la fila. Un nombre menos.
4. **El cupo de lecturas de X sigue siendo del despliegue, no de cada usuario.** `CLAVE_TOPE` y `CLAVE_CONTADOR` miden una llave de API compartida: si fueran por usuario, cinco usuarios gastarían cinco veces el mismo cupo. Viven en la fila del admin. Lo que sí pasa a ser por usuario es la voz: `CLAVE_INSTRUCCIONES` y `CLAVE_TEXTO_PRIVADO`.
5. **La página pública sigue resolviendo por slug, sin dueño.** El slug es único en toda la base y lo seguirá siendo; un visitante que pide `/mi-slug` no tiene sesión que filtrar. Lo único que cambia es `/`, que hoy sirve «el perfil por defecto» y pasa a servir el del admin. La página pública por usuario es el subproyecto 3.
6. **Las balizas de visita y clic no cambian.** Escriben en `visits` y `clicks`, que heredan el dueño de `profiles` por `profile_id`.
7. **El refresco de credenciales de cada red no cambia.** `ensureCredential` y sus hermanas actualizan `social_accounts` por `id`, y ese id llegó de una consulta ya filtrada.
8. **Los scripts de reparación histórica no se tocan** (`backfill-cuentas`, `reparar-ids-facebook`, `marcar-bots-historicos`, `reset-analytics`, `verify`, `demo-data`): son herramientas de una vez, las corre el dueño a mano y operan sobre filas que ya existen. `seed.ts` sí siembra a nombre del admin, porque crea perfiles nuevos.

## Global Constraints

- **La regla, literal:** toda consulta a `profiles`, `social_accounts`, `scheduled_posts`, `source_authors`, `social_posts` o `ajustes` lleva `eq(tabla.ownerId, ownerId)` en su `where`. Toda consulta a una tabla hija (`links`, `visits`, `clicks`, `post_metrics`, `account_metrics`, `post_comments`, `scheduled_post_targets`, `scheduled_post_media`, `reglas_clave`, `source_posts`) llega por un join que ya filtró al padre, o filtra por un `account_id`/`post_id`/`profile_id` que se obtuvo filtrado. Una escritura sobre una tabla con dueño lleva `ownerId` en sus valores.
- **`ownerId: string` es siempre el primer parámetro** de las funciones de `src/lib/` que tocan esas tablas, y siempre se llama `ownerId`.
- De dónde sale el dueño, por contexto, y de ningún otro lado:
  - páginas y acciones del panel → `const { id: ownerId } = await requireUser()`
  - rutas del teléfono → `const usuario = await requireMobileUser(request)`
  - rutas con `SCHEDULE_API_KEY` y `/api/metrics/posts` → `const { id: ownerId } = await asegurarAdmin()`
  - crons → **la fila que se está procesando** (`cuenta.ownerId`, `post.ownerId`). Nunca un parámetro, nunca el admin.
  - página pública → no lleva dueño, salvo `/`, que usa el admin.
- **Un destino tiene que ser una cuenta del mismo dueño que su post.** Como no hay CHECK que cruce tablas, el guardián es que toda cuenta destino salga de `cuentasPrimarias(ownerId, …)`.
- `owner_id`: `uuid('owner_id').references(() => users.id, { onDelete: 'restrict' })`, **sin `.notNull()`** en esta entrega, más un índice por tabla llamado `<tabla>_owner_idx`.
- Las únicas **no** cambian en esta entrega (son la 3). Mientras tanto, dos usuarios no pueden conectar la misma cuenta de la misma red: la única vieja `(network, external_id)` lo impide. Es una limitación conocida de la beta, no un fallo.
- Ninguna tarea corre `db:migrate*`, `db:baseline` ni nada que toque una base. La migración se genera con `npm run db:generate` y la aplica Vercel al desplegar.
- Verificación de cada tarea: `npm run typecheck`, `npm run lint` y `npx vitest run` deben quedar verdes **al terminar la tarea**; una tarea que cambia una firma cambia también a todos sus llamadores, no los deja rotos para la siguiente.
- Commits en español, presente, con footer exacto:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Git: nunca checkout/reset/rebase/stash; `git add` por archivo; heredoc para el mensaje.

---

### Task 1: La columna, la migración y la adopción al desplegar

**Files:**
- Modify: `src/db/schema.ts` (las seis tablas)
- Modify: `scripts/migrar.ts`
- Create (generados): `drizzle/0002_*.sql`, `drizzle/meta/0002_snapshot.json`, `_journal.json`

**Interfaces:**
- Produces: `ownerId` en `profiles`, `socialAccounts`, `scheduledPosts`, `sourceAuthors`, `socialPosts`, `ajustes`; la función `adoptarHuerfanas(sql, adminId)` exportada desde `scripts/migrar.ts` no hace falta: vive dentro del script.

- [ ] **Step 1: La columna en las seis tablas**

En `src/db/schema.ts`, a cada una de las seis tablas agrégale, justo después de `id` (o de la primera columna en `ajustes`):

```ts
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'restrict' }),
```

y a su lista de índices `index('<tabla>_owner_idx').on(t.ownerId)`, con `<tabla>` en snake_case: `profiles_owner_idx`, `social_accounts_owner_idx`, `scheduled_posts_owner_idx`, `source_authors_owner_idx`, `social_posts_owner_idx`, `ajustes_owner_idx`. Las tablas declaradas sin segundo argumento (`profiles`, `scheduledPosts`, `ajustes`) lo ganan: `pgTable('profiles', { … }, (t) => [index('profiles_owner_idx').on(t.ownerId)])`.

`users` se declara **antes** que las seis en el archivo, o la referencia no resuelve: si `users` está al final, muévela arriba de `profiles` junto con `codigosIngreso` y `ROLES`/`Rol`, sin cambiar nada de su contenido.

Comentario, una sola vez, sobre la columna de `profiles`:

```ts
  /**
   * Quién es dueño de esta fila. Nulable solo mientras dure la transición: el paso de
   * migrado adopta a nombre del admin lo que venga de antes, y la entrega 3 lo pone
   * NOT NULL. Las tablas hijas no la llevan: heredan por su clave foránea.
   */
```

- [ ] **Step 2: Genera la migración**

Run: `npm run db:generate`
Expected: `drizzle/0002_<nombre>.sql` con seis `ALTER TABLE … ADD COLUMN "owner_id" uuid`, sus seis `ADD CONSTRAINT … FOREIGN KEY … ON DELETE restrict` y seis `CREATE INDEX`. Ningún `NOT NULL`, ningún `DROP`. Si aparece un `DROP` o un `NOT NULL`, para y repórtalo: significa que el esquema se desvió.

- [ ] **Step 3: La adopción en el despliegue**

`scripts/migrar.ts` hoy es corto: decide con `decidirMigracion`, y si toca migrar hace `const db = drizzle(neon(process.env.DATABASE_URL!))` y `await migrate(db, { migrationsFolder: 'drizzle' })`. Agrega el paso justo después del `migrate`, dentro del mismo `else`, reutilizando el cliente `neon` (guárdalo en una variable `sql` antes de pasárselo a `drizzle`):

```ts
/**
 * Adopta a nombre del admin toda fila que venga de antes de que existieran los dueños.
 * No puede vivir en el SQL de la migración porque ADMIN_EMAIL es una variable de entorno,
 * y no puede esperar a que alguien entre al panel: la entrega 3 pone la columna NOT NULL.
 * Idempotente: en un despliegue sin huérfanas no escribe nada.
 */
const CON_DUENO = ['profiles', 'social_accounts', 'scheduled_posts', 'source_authors', 'social_posts', 'ajustes']

async function adoptarHuerfanas(sql: ReturnType<typeof neon>): Promise<void> {
  const correo = process.env.ADMIN_EMAIL?.replace(/^﻿/, '').trim().toLowerCase()
  if (!correo) {
    console.warn('[migraciones] sin ADMIN_EMAIL: quedan filas sin dueño')
    return
  }
  const filas = await sql`
    insert into users (correo, rol) values (${correo}, 'admin')
    on conflict (correo) do update set rol = 'admin'
    returning id`
  const adminId = (filas[0] as { id: string }).id
  for (const tabla of CON_DUENO) {
    // El nombre de la tabla sale de esta lista literal, nunca de una entrada; el id va como parámetro.
    await sql.query(`update ${tabla} set owner_id = $1 where owner_id is null`, [adminId])
  }
  console.log('[migraciones] filas sin dueño adoptadas por', correo)
}
```

Comprueba cómo se llama en esta versión de `@neondatabase/serverless` (1.1.0) el método para una consulta con parámetros —`sql.query(texto, params)` o `sql(texto, params)`— mirando sus tipos en `node_modules/@neondatabase/serverless`, y usa el que exista. Envuelve la llamada en try/catch que registre el error y **no** tumbe el build: si las migraciones ya se aplicaron, un fallo aquí se reintenta solo en el próximo despliegue.

- [ ] **Step 4: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: todo verde. Nada lee `ownerId` todavía, así que el comportamiento no cambia.

```bash
git add src/db/schema.ts scripts/migrar.ts drizzle
git commit -F - <<'EOF'
Agrega el dueño a las seis tablas raíz y adopta lo que venía de antes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 2: Las cuentas sociales y OAuth

**Files:**
- Modify: `src/lib/social/cuentas.ts`, `src/lib/social/conectar.ts`, `src/lib/social/oauth-state.ts`
- Modify: `src/app/api/social/[network]/connect/route.ts`, `src/app/api/social/[network]/callback/route.ts`
- Modify: `src/app/admin/(dash)/accounts/elegir/page.tsx`, y en `src/app/admin/actions.ts` solo `conectarElegidas` y `disconnectAccount`
- Test: `src/lib/social/oauth-state.test.ts` (créalo si no existe)

**Interfaces:**
- Produces: `cuentasPrimarias(ownerId: string, networks: string[])`, `exigirCuentas(ownerId: string, networks: string[])`, `guardarCuenta(ownerId: string, …resto igual…)`, `signOAuthState(network: string, ownerId: string)`, `oauthStateMatches(state: string, network: string, ownerId: string)`.
- Consumes: `ownerId` de Task 1.

- [ ] **Step 1: Test que falla**

`src/lib/social/oauth-state.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { oauthStateMatches, signOAuthState } from './oauth-state'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
})

describe('state de OAuth', () => {
  it('vale para su red y su dueño', async () => {
    const state = await signOAuthState('instagram', 'u1')
    expect(await oauthStateMatches(state, 'instagram', 'u1')).toBe(true)
  })

  it('no vale para otra red ni para otro dueño', async () => {
    const state = await signOAuthState('instagram', 'u1')
    expect(await oauthStateMatches(state, 'tiktok', 'u1')).toBe(false)
    // Lo que impide que alguien termine tu conexión a medias con su propia sesión.
    expect(await oauthStateMatches(state, 'instagram', 'u2')).toBe(false)
    expect(await oauthStateMatches('', 'instagram', 'u1')).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/social/oauth-state.test.ts` → FAIL (la firma vieja no toma dueño).

- [ ] **Step 2: `oauth-state.ts`**

`signOAuthState` pasa a `(network: string, ownerId: string)` y firma `{ purpose, network, sub: ownerId }` (usa `.setSubject(ownerId)`). `oauthStateMatches` pasa a `(state, network, ownerId)` y exige los tres: propósito, `network` y `sub === ownerId`. Conserva la vigencia de diez minutos y el resto del archivo. Ajusta su comentario de cabecera para decir que el `state` ata la vuelta a **este usuario y esta red**.

- [ ] **Step 3: `cuentas.ts` y `conectar.ts`**

En `cuentasPrimarias`, `ownerId` como primer parámetro y `eq(socialAccounts.ownerId, ownerId)` dentro del `and(...)` que ya existe. Igual en `exigirCuentas`, que solo se lo pasa a la anterior. Actualiza el comentario de `cuentasPrimarias`: «la más antigua **del dueño**».

En `guardarCuenta` (`conectar.ts`), `ownerId` primero y `ownerId` entre los `values` del insert. El `onConflictDoUpdate` sigue apuntando a la única vieja `(network, externalId)`: **no la cambies** (es la entrega 3). Agrega el comentario:

```ts
  // El target sigue siendo (network, external_id) hasta la entrega 3: mientras tanto dos
  // usuarios no pueden conectar la misma cuenta, y es preferible a que uno pise al otro.
```

- [ ] **Step 4: Las rutas y la pantalla de elegir**

- `connect/route.ts`: cambia `if (!(await usuarioActual())) …` por `const usuario = await usuarioActual(); if (!usuario) …` y pasa `usuario.id` a `signOAuthState`.
- `callback/route.ts`: igual al principio; pasa `usuario.id` a `oauthStateMatches` y a `guardarCuenta`. La cookie de conexión pendiente (`COOKIE_PENDIENTE`) lleva el dueño dentro de su payload firmado: agrega `sub: usuario.id` donde se firma y compruébalo donde se lee.
- `accounts/elegir/page.tsx`: `const { id: ownerId } = await requireUser()` y filtra su consulta a `socialAccounts` por `ownerId`; si la cookie pendiente trae un `sub` distinto del de la sesión, trata la conexión como ajena y muestra el mismo mensaje que cuando no hay nada pendiente.
- En `actions.ts`, solo estas dos: `conectarElegidas` pasa `ownerId` a `guardarCuenta` y compara el `sub` de la cookie; `disconnectAccount` agrega `eq(socialAccounts.ownerId, ownerId)` a su `where`, para que nadie desconecte la cuenta de otro con un id adivinado.

- [ ] **Step 5: Los otros llamadores de `cuentasPrimarias`**

Búscalos con `grep -rn "cuentasPrimarias\|exigirCuentas" src`. Son cinco: `actions.ts`, `crear.ts`, `batch.ts`, y las rutas móviles de calendario. En esta tarea, **pásales el dueño solo donde ya lo tienen a mano**; si un llamador todavía no sabe quién es (porque su tarea viene después), pásale `(await asegurarAdmin()).id` con este comentario y déjalo anotado en tu reporte:

```ts
  // TRANSICIÓN: el dueño real llega en la tarea de esta capa; hasta entonces, el admin.
```

Ninguno de esos `TRANSICIÓN` puede sobrevivir a la Task 7: la Task 8 verifica que no quede ninguno.

- [ ] **Step 6: Verifica y commitea**

Run: `npx vitest run && npm run typecheck && npm run lint`

```bash
git commit -F - <<'EOF'
Ata cada cuenta social y su vuelta de OAuth al usuario que la conecta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 3: Los ajustes, por dueño

**Files:**
- Modify: `src/lib/ajustes.ts`
- Modify: `src/app/admin/(dash)/comments/page.tsx`, `src/app/admin/actions.ts` (solo `guardarInstruccionesComentarios`), `src/lib/social/comentarios/redaccion.ts` (2 sitios), `src/lib/social/comentarios/responder.ts` (1 sitio), `src/lib/social/fuentes/run.ts` (3 sitios)

**Interfaces:**
- Produces: `leerAjuste(ownerId: string, clave: string)`, `guardarAjuste(ownerId: string, clave: string, valor: string)`.

- [ ] **Step 1: `ajustes.ts`**

Ambas funciones ganan `ownerId` primero. `leerAjuste` filtra por `and(eq(ajustes.ownerId, ownerId), eq(ajustes.clave, clave))`. `guardarAjuste` mete `ownerId` en los `values`; su `onConflictDoUpdate` sigue apuntando a `ajustes.clave` hasta la entrega 3 (la PK compuesta es de allá), **pero** agrega `where` al conflicto para no pisar el ajuste de otro: si Drizzle lo complica, haz `update … where (owner_id, clave)` y, si no afectó filas, `insert`. Elige el camino que deje el código más simple y explícalo en un comentario de dos líneas.

Comentario de cabecera del archivo:

```ts
/**
 * Los ajustes de cada usuario: su voz para los borradores, su texto de privado. El cupo de
 * lecturas de X no vive aquí por usuario sino en la fila del admin, porque mide una llave
 * de API compartida por todo el despliegue: repartirla por persona la gastaría N veces.
 */
```

- [ ] **Step 2: Los llamadores**

- `comments/page.tsx`: ya tiene `requireUser()` en el layout; llama `const { id: ownerId } = await requireUser()` en la página y pásalo.
- `actions.ts` → `guardarInstruccionesComentarios`: usa el `ownerId` del `requireUser()` que ya hace.
- `redaccion.ts`: las dos lecturas de `CLAVE_INSTRUCCIONES` están dentro de funciones que procesan comentarios de una cuenta. El dueño sale **de la cuenta o del post**, no de un parámetro nuevo: si la función ya tiene la fila de `socialAccounts` o de `socialPosts` a mano, usa su `ownerId`; si no, agrégale `ownerId: string` como primer parámetro y que se lo pase quien la llama (el cron, que sí tiene la cuenta). Anota en tu reporte cuál de los dos caminos tomaste en cada una.
- `responder.ts` → `CLAVE_TEXTO_PRIVADO`: mismo criterio; la función ya lee la cuenta en la línea ~31.
- `fuentes/run.ts`: las tres lecturas/escrituras son del cupo de X. Usa `const { id: adminId } = await asegurarAdmin()` una vez al principio de `traerIdeas` y pásalo a las tres. Comentario: `// El cupo es de la llave de X, que es una para todo el despliegue: vive en el admin.`

- [ ] **Step 3: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`

```bash
git commit -F - <<'EOF'
Hace que cada usuario tenga sus propios ajustes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 4: Lo que el panel lee

**Files:**
- Modify: `src/lib/analytics.ts` (10 sitios), `src/lib/posts.ts` (8), `src/lib/profiles.ts` (5), `src/lib/comentarios-cola.ts` (2), `src/lib/post-attributes.ts` (1), `src/lib/posts-kpis.ts` (si toca tablas; revísalo)
- Modify: las páginas que las llaman: `src/app/admin/(dash)/page.tsx`, `analytics/page.tsx`, `content/page.tsx`, `accounts/page.tsx`, `comments/page.tsx`, `profiles/page.tsx`, `profiles/[id]/page.tsx`
- Modify: `src/app/page.tsx` (la raíz pública), `src/app/api/metrics/posts/route.ts`
- Test: `src/lib/analytics.test.ts` si existe; si no, no crees uno (estas funciones necesitan base)

**Interfaces:**
- Produces: `Filters` de `analytics.ts` gana `ownerId: string` **obligatorio**; `getPostRows(ownerId, …)`, `getPostSeries(ownerId, …)`, `getCuentas(ownerId)`, `getCampaignPosts(ownerId, …)`, `getAllProfiles(ownerId)`, `getAllLinks(ownerId)`, `getDefaultProfile(ownerId)`, `getCola(ownerId, …)`, `contarPendientes(ownerId)`, `attributesFor(ownerId, …)`.
- `getProfileBySlug(slug)` y `getVisibleLinks(profileId)` **no cambian**: son el sitio público, que resuelve por slug.

- [ ] **Step 1: `analytics.ts`**

`Filters` gana `ownerId: string`. Las consultas de `visits` y `clicks` llegan a su dueño por `profiles`: agrega a cada `where` la condición de que el perfil sea del dueño. Donde ya hay join con `profiles`, basta `eq(profiles.ownerId, f.ownerId)`; donde no lo hay, usa una subconsulta:

```ts
  conds.push(
    // La visita no tiene dueño propio: lo hereda del perfil que se estaba mirando.
    inArray(visits.profileId, db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, f.ownerId))),
  )
```

o un `innerJoin` con `profiles` si la consulta ya selecciona de una sola tabla y el join no cambia el conteo (ojo con los `count`: un join que multiplique filas rompe la cifra; prefiere la subconsulta cuando haya cualquier duda). En el SQL crudo de `getTimeSeries` y de `getPostSeries`, agrega la misma condición como `and p.owner_id = ${ownerId}` sobre el join que corresponda, **nunca** interpolando el id fuera de un parámetro.

- [ ] **Step 2: `posts.ts`, `profiles.ts`, `comentarios-cola.ts`, `post-attributes.ts`**

Patrón, en todas: `ownerId` primero, `eq(tabla.ownerId, ownerId)` en la tabla raíz de cada consulta, y las hijas por join o por id ya filtrado. En concreto:
- `getPostRows`: `socialPosts` filtra por dueño; `postMetrics` llega por `post_id` de esa lista; `visits`/`clicks` por los perfiles del dueño, igual que en analytics.
- `getCuentas`: `socialAccounts` por dueño.
- `getCampaignPosts`: `socialPosts` por dueño.
- `getAllProfiles` / `getAllLinks`: `profiles` por dueño; los links por `profile_id` de esa lista.
- `getDefaultProfile(ownerId)`: `and(eq(profiles.ownerId, ownerId), eq(profiles.isDefault, true))`.
- `getCola` / `contarPendientes`: `postComments` llega por `account_id`; filtra con los ids de `socialAccounts` del dueño, o agrega la condición al join que ya existe con `socialAccounts`.
- `attributesFor`: el join con `scheduledPosts` gana `eq(scheduledPosts.ownerId, ownerId)`.

- [ ] **Step 3: Los llamadores**

Cada página del panel empieza con `const { id: ownerId } = await requireUser()` y lo pasa. `src/app/page.tsx` (la raíz pública) usa `const { id } = await asegurarAdmin()` y llama `getDefaultProfile(id)`, con el comentario: `// La raíz sirve el perfil del dueño del despliegue; la página por usuario es el subproyecto 3.` `/api/metrics/posts` usa `asegurarAdmin()`.

- [ ] **Step 4: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`

```bash
git commit -F - <<'EOF'
Filtra por dueño todo lo que el panel lee

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 5: Las acciones del panel

**Files:**
- Modify: `src/app/admin/actions.ts` (los 33 sitios del inventario, menos los cuatro que ya tocaron las tareas 2 y 3)

- [ ] **Step 1: El dueño en cada acción**

Cada función exportada que hoy hace `await requireUser()` pasa a `const { id: ownerId } = await requireUser()`. Después, una por una:

- **Perfiles y links** (`createProfile`, `updateProfile`, `makeDefault`, `deleteProfile`, `rotateSlug`, `createLink`, `updateLink`, `toggleLink`, `deleteLink`, `reorderLinks`): el insert de `profiles` lleva `ownerId`; todo `update`/`delete`/`select` sobre `profiles` lleva `eq(profiles.ownerId, ownerId)` en su `where`. Los de `links` van por `profile_id`, y ese perfil tiene que haberse comprobado del dueño antes: donde una acción recibe un `linkId` suelto, el `where` cruza con los perfiles del dueño (subconsulta `inArray(links.profileId, …)`).
- **`makeDefault`**: sus dos updates (quitar el anterior, poner el nuevo) llevan el filtro; el «por defecto» es uno por dueño, no uno global.
- **Cuentas y posts** (`updatePostCampaign`, `leerCreadorTikTok`): por dueño. `updatePostCampaign` toca `socialPosts`, cuya única de `campaign` sigue siendo global: si choca, la frase de error que ya existe sirve igual.
- **Calendario** (`updateScheduledPost`, `rescheduleTarget`, `deleteScheduledPost`): la consulta de `scheduledPosts` lleva el filtro, y **todas** las de `scheduled_post_targets`, `scheduled_post_media` y `reglas_clave` se atan a un post que ya se comprobó del dueño. En `updateScheduledPost`, las cuentas destino salen de `cuentasPrimarias(ownerId, …)`: ahí se cumple la coherencia post ↔ destino.
- Si una acción no encuentra la fila porque es de otro dueño, devuelve **la misma frase** que cuando la fila no existe. No inventes un «no es tuyo»: revela que existe.

- [ ] **Step 2: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Además: `grep -n "requireUser()" src/app/admin/actions.ts | wc -l` y compáralo con el número de funciones exportadas; si alguna exportada no lo llama, es un agujero: repórtalo.

```bash
git commit -F - <<'EOF'
Ata a su dueño cada acción del panel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 6: Programar: compositor, lote, teléfono y API

**Files:**
- Modify: `src/lib/social/publish/crear.ts`, `src/lib/social/publish/batch.ts`, `src/lib/mobile-api.ts`
- Modify: `src/app/admin/(dash)/schedule/page.tsx`, `src/app/admin/(dash)/schedule/[id]/page.tsx`
- Modify: las seis rutas de `src/app/api/mobile/*` que consultan, y `src/app/api/schedule/batch/route.ts`, `src/app/api/schedule/posts/route.ts`

**Interfaces:**
- Produces: `crearPostProgramado(ownerId, …)`, `scheduleBatch(ownerId, …)`; las funciones de `mobile-api.ts` que consultan ganan `ownerId` primero.

- [ ] **Step 1: Las dos funciones que crean posts**

`crearPostProgramado` y `scheduleBatch` reciben `ownerId` primero; el insert de `scheduledPosts` lo lleva en sus valores; los destinos salen de `cuentasPrimarias(ownerId, …)` (quita el `TRANSICIÓN` que dejó la Task 2). `reglas_clave` y `scheduled_post_media` cuelgan del post, no llevan columna.

- [ ] **Step 2: Los llamadores**

- `createScheduledPost` y `uploadBatch` en `actions.ts`: el `ownerId` del `requireUser()`.
- `POST /api/mobile/schedule` y `POST /api/mobile/schedule/check`: el usuario de `requireMobileUser`.
- `POST /api/schedule/batch` y `GET /api/schedule/posts`: `asegurarAdmin()`, con el comentario `// La llave de API es del despliegue, no de una persona: lo que entra por ahí es del admin.`
- Las páginas del calendario y las rutas de lectura del teléfono (`overview`, `posts`, `accounts`, `schedule`): filtran `scheduledPosts` (y `socialPosts`, `accountMetrics` por sus cuentas) por el dueño que ya tienen.

- [ ] **Step 3: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`

```bash
git commit -F - <<'EOF'
Programa siempre a nombre de quien programa, desde el panel, el lote y el teléfono

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 7: Los crons, donde el dueño viaja en la fila

**Files:**
- Modify: `src/lib/social/publish/run.ts`, `src/lib/social/publish/alert.ts`, `src/lib/social/sync.ts`, `src/lib/social/comentarios/run.ts`, `src/lib/social/comentarios/redaccion.ts`, `src/lib/social/comentarios/automatico.ts`, `src/lib/social/comentarios/responder.ts`, `src/lib/social/fuentes/run.ts`, `src/lib/storage-gc.ts`

**Interfaces:** ninguna función de cron gana un parámetro de dueño. El dueño sale de la fila que se procesa.

- [ ] **Step 1: La regla en los crons**

`publishDue`, `syncAll`, `sondearComentarios`, `traerIdeas` y `barrerHuerfanos` siguen recorriendo **todas** las filas de la base: eso no cambia en esta entrega (los crons por inquilino son el subproyecto 4). Lo que cambia es que cada fila creada a partir de otra hereda su dueño:

- `sync.ts`: `insertOrUpdatePost` escribe `socialPosts` con el `ownerId` **de la cuenta** que está sincronizando; `ensureYouTubeAccount` crea la cuenta a nombre del admin (`asegurarAdmin()`), con el comentario `// La cuenta que nace de YOUTUBE_CHANNEL_ID es del despliegue: la entrega 3 la ata mejor.`; `post_metrics` y `account_metrics` no llevan columna.
- `publish/run.ts`: la consulta de destinos ya trae el post; pasa `post.ownerId` a lo que cree filas y a `cuentasPrimarias` si lo usa.
- `comentarios/run.ts` y `automatico.ts`: los comentarios cuelgan de la cuenta; nada nuevo que escribir, pero cualquier lectura de `socialPosts`/`scheduledPosts` dentro del bucle se filtra por el dueño de la cuenta que se está sondeando, para no cruzar datos entre usuarios al buscar el caption o la regla.
- `redaccion.ts` y `responder.ts`: los ajustes que leen (Task 3) usan el dueño de la cuenta o del post.
- `fuentes/run.ts`: `sourcePosts` cuelga del autor; el autor ya tiene dueño.
- `storage-gc.ts`: `urlsReferenciadas` recorre las cuatro tablas **sin filtrar**, y así tiene que seguir: barre el bucket entero, que es uno para todo el despliegue. Ponle este comentario para que nadie «lo arregle» después:

```ts
  // A propósito sin dueño: el bucket es uno solo, así que lo referenciado por cualquier
  // usuario protege el archivo. Filtrar por dueño aquí borraría los archivos de los demás.
```

- [ ] **Step 2: La alerta va al dueño**

`sendFailureAlert` gana el correo del destinatario como parámetro (`para: string`), y `publish/run.ts` se lo pasa buscando el correo del dueño del post. Si el dueño no tiene correo por lo que sea, cae en `PUBLISH_ALERT_TO` como hasta ahora. Comentario: `// Al dueño del post, no al del despliegue: el fallo es de su publicación.`

- [ ] **Step 3: Verifica y commitea**

Run: `npm run typecheck && npm run lint && npx vitest run`
Además: `grep -rn "TRANSICIÓN" src` no debe devolver nada.

```bash
git commit -F - <<'EOF'
Hace que los crons hereden el dueño de cada fila y avisen a quien corresponde

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

---

### Task 8: La prueba de que no se ven, y el cierre

**Files:**
- Create: `src/lib/aislamiento.test.ts`
- Modify: `scripts/seed.ts`, `README.md`

- [ ] **Step 1: La prueba de aislamiento**

La spec la pide contra una rama de Neon, pero **este test no puede necesitar una base**: `npm test` corre en el CI sin `DATABASE_URL`. Escríbelo como una prueba del SQL generado, no de su resultado: Drizzle sabe imprimir la consulta con `.toSQL()`, sin conexión.

```ts
import { describe, expect, it } from 'vitest'
// … arma una consulta por cada función que deba filtrar y comprueba que su SQL
// menciona owner_id. Ejemplo del molde:
// const { sql, params } = db.select().from(profiles).where(eq(profiles.ownerId, 'u1')).toSQL()
// expect(sql).toContain('owner_id')
```

Si `getDb()` exige `DATABASE_URL` para construirse, crea el cliente del test con `drizzle(neon('postgres://x/y'))` sin conectarlo: `.toSQL()` no viaja a la red. Cubre al menos una función por módulo tocado: analytics, posts, profiles, comentarios-cola, cuentas, ajustes.

Si al intentarlo descubres que no se puede sin base, **no falsees el test**: bórralo, dilo en tu reporte y deja en su lugar un archivo `docs/aislamiento.md` de media página que explique cómo comprobarlo a mano contra una rama de Neon.

- [ ] **Step 2: `seed.ts` y README**

`seed.ts` crea sus perfiles a nombre del admin (`asegurarAdmin()` o la consulta equivalente que el script pueda hacer con su propio cliente). En el README, en la sección del esquema o en la de variables, tres o cuatro frases nuevas: que cada fila tiene dueño, que los crons siguen recorriendo todo el despliegue, que la llave de API y la raíz pública son del admin, y que dos usuarios todavía no pueden conectar la misma cuenta de la misma red hasta la entrega 3.

- [ ] **Step 3: Verificación completa**

Run: `npm test && npm run typecheck && npm run lint && npx next build`

```bash
git commit -F - <<'EOF'
Comprueba el aislamiento por dueño y lo documenta

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw
EOF
```

### Cierre (controlador)

1. Revisión final de toda la rama en el modelo más capaz, con foco en consultas que quedaran sin filtro.
2. PR a `main`, **después** de que el #87 esté fusionado. El preview migra su rama de Neon con la `0002` y adopta las filas huérfanas.
3. La entrega 3 pone `NOT NULL`, cambia las únicas y suelta los slugs reservados.
