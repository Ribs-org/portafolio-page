# Terceros — entrega A: los callbacks de baja y borrado de Meta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la app de Meta pueda entrar a App Review: dos rutas públicas que reciben el `signed_request` de Meta, una que deja sin credencial las cuentas del usuario que quitó la app y otra que borra lo que vino de Meta y responde con un código y una URL de estado.

**Architecture:** una función pura verifica la firma (`meta-firma.ts`); un módulo con los pasos de SQL hace la baja y el borrado por `meta_user_id` (`meta-bajas.ts`, con `pasosDeBorrado` probado sin base como `fusion.ts`); dos rutas y una página de estado los exponen. Para poder buscar por usuario, `fetchCredential` guarda el id de usuario de Meta al conectar en una columna nueva.

**Tech Stack:** Next.js (App Router), Drizzle/postgres-js, `node:crypto`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-terceros-codigo-design.md`, §2. Ante conflicto, manda la spec.

## Restricciones globales

- **Toda lectura de la base va atada al dueño**, salvo `meta-bajas.ts`, que busca por `meta_user_id` a propósito (Meta no sabe quién es nuestro dueño); la excepción se escribe en el código y en `docs/deuda-tecnica.md`.
- **Las frases de error existentes no se tocan.** Las nuevas son constantes exportadas con test letra por letra.
- **Las rutas del panel no cambian.** Lo nuevo: `POST /api/social/meta/baja`, `POST /api/social/meta/borrado`, `GET /borrado/[codigo]`.
- **Comentarios en español; código en inglés y en llano**, con el estilo del archivo que se toca.
- **TDD** en lo puro; un commit por tarea con el pie de autoría del repositorio; documentación con la tarea que hace cierto el cambio.
- **La suite pasa, typecheck, lint y build limpios al final de cada tarea.** La migración se genera con `npx drizzle-kit generate --name <nombre>` y se aplica en DEV con `npm run db:migrate:local`.

---

### Tarea 1: `leerSignedRequest`, pura

**Files:**
- Create: `src/lib/social/meta-firma.ts`
- Test: `src/lib/social/meta-firma.test.ts`

**Interfaces:**
- Produces: `leerSignedRequest(raw: string, secret: string): { userId: string; issuedAt: number } | null`.

- [ ] **Step 1: El test que falla**

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { leerSignedRequest } from './meta-firma'

const SECRETO = 'secreto-de-prueba'
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
function firmar(payload: object, secreto = SECRETO): string {
  const cuerpo = b64url(JSON.stringify(payload))
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url')
  return `${firma}.${cuerpo}`
}
const PAYLOAD = { algorithm: 'HMAC-SHA256', user_id: '10201234567890', issued_at: 1790000000 }

describe('leerSignedRequest', () => {
  it('con la firma correcta devuelve el usuario y la fecha', () => {
    expect(leerSignedRequest(firmar(PAYLOAD), SECRETO)).toEqual({ userId: '10201234567890', issuedAt: 1790000000 })
  })
  it('rechaza otra firma, otro secreto, otro algoritmo, sin punto o sin user_id', () => {
    expect(leerSignedRequest(firmar(PAYLOAD, 'otro'), SECRETO)).toBeNull()
    const [firma, cuerpo] = firmar(PAYLOAD).split('.')
    expect(leerSignedRequest(`${firma}.${b64url(JSON.stringify({ ...PAYLOAD, user_id: 'x' }))}`, SECRETO)).toBeNull()
    expect(leerSignedRequest(`${firma}x.${cuerpo}`, SECRETO)).toBeNull()
    expect(leerSignedRequest(firmar({ ...PAYLOAD, algorithm: 'HMAC-SHA1' }), SECRETO)).toBeNull()
    expect(leerSignedRequest('sinpunto', SECRETO)).toBeNull()
    expect(leerSignedRequest(firmar({ algorithm: 'HMAC-SHA256', issued_at: 1 }), SECRETO)).toBeNull()
    expect(leerSignedRequest('', SECRETO)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y verlo fallar** — `npx vitest run src/lib/social/meta-firma.test.ts`

- [ ] **Step 3: La función**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * El `signed_request` de Meta: `<firma>.<payload>`, los dos en base64url; el payload es
 * JSON con `algorithm`, `user_id` (el id de usuario de la app, no el de la página ni el
 * de Instagram) e `issued_at`. La firma es HMAC-SHA256 del payload con el app secret. Se
 * compara en tiempo constante y se rechaza todo lo que no calce, sin decir qué.
 */
export function leerSignedRequest(raw: string, secret: string): { userId: string; issuedAt: number } | null {
  const punto = raw.indexOf('.')
  if (punto <= 0) return null
  const firma = raw.slice(0, punto)
  const cuerpo = raw.slice(punto + 1)
  let esperada: Buffer
  let recibida: Buffer
  try {
    esperada = createHmac('sha256', secret).update(cuerpo).digest()
    recibida = Buffer.from(firma, 'base64url')
  } catch {
    return null
  }
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null
  let payload: { algorithm?: unknown; user_id?: unknown; issued_at?: unknown }
  try {
    payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (payload.algorithm !== 'HMAC-SHA256') return null
  if (typeof payload.user_id !== 'string' || payload.user_id === '') return null
  if (typeof payload.issued_at !== 'number') return null
  return { userId: payload.user_id, issuedAt: payload.issued_at }
}
```

Nota: `Buffer.from(x, 'base64url')` no lanza con basura, devuelve bytes distintos; el `try` es por si Node cambia eso. Comprueba que `firma + 'x'` de verdad produce bytes distintos (la longitud puede coincidir: el `timingSafeEqual` es el que decide).

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`. Documentación: nada la usa aún; dilo en el informe.

```bash
git add src/lib/social/meta-firma.ts src/lib/social/meta-firma.test.ts
git commit -m "leerSignedRequest: la firma de Meta, verificada en tiempo constante"
```

---

### Tarea 2: `meta_user_id` al conectar, y la tabla de solicitudes

**Files:**
- Modify: `src/db/schema.ts` (columna + índice en `socialAccounts`; tabla `solicitudesBorrado`)
- Create: `drizzle/0006_<nombre>.sql` (generada)
- Modify: `src/app/api/social/[network]/callback/route.ts` (`fetchCredential` para `instagram`/`facebook`; la cookie pendiente)
- Modify: `src/lib/social/conectar.ts` (`guardarCuenta` acepta `metaUserId`)
- Modify: `src/app/admin/actions.ts` (la elección en `/admin/accounts/elegir` pasa `metaUserId`)
- Test: los tests existentes de `conectar` y del callback si los hay; si no, uno del `fetchCredential` de Meta doblando `fetch`.

**Interfaces:**
- Produces: `socialAccounts.metaUserId: string | null`; `solicitudesBorrado` (`id`, `codigo` unique, `red`, `metaUserId`, `cuentas`, `creadoEn`); `guardarCuenta(ownerId, network, { …, metaUserId? })`.

- [ ] **Step 1: El esquema**

En `socialAccounts`: `metaUserId: text('meta_user_id')` y `index('social_accounts_meta_user_idx').on(t.metaUserId)`. Tabla nueva, al final del archivo, con `.enableRLS()` como todas:

```ts
/**
 * Cada borrado que Meta nos pidió (data deletion callback): el código que devolvimos y
 * cuántas cuentas cayeron. Sin dueño a propósito: cuando se inserta, el dueño ya no tiene
 * cuentas de Meta y Meta no sabe quién es; la página de estado solo muestra fecha y número.
 */
export const solicitudesBorrado = pgTable('solicitudes_borrado', {
  id: uuid('id').primaryKey().defaultRandom(),
  codigo: text('codigo').notNull().unique(),
  red: text('red').notNull(),
  metaUserId: text('meta_user_id').notNull(),
  cuentas: integer('cuentas').notNull(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()
```

`npx drizzle-kit generate --name meta_user_y_borrados`. Lee el SQL generado entero: tiene que ser solo la columna, el índice y la tabla (con su `ENABLE ROW LEVEL SECURITY`). Aplícala en DEV: `npm run db:migrate:local`.

- [ ] **Step 2: El id de usuario al conectar**

En `fetchCredential` (callback), en la rama de Meta: después de obtener el token de usuario, `GET ${GRAPH}/me?fields=id&access_token=…`; el `id` va al `credential` como `metaUserId`. Si la llamada falla, la conexión sigue sin él (no es motivo para romper el flujo; queda nulo y el README lo cubre). El `credential` con una sola candidata pasa `metaUserId` a `guardarCuenta`; la cookie pendiente lo lleva (`serializarPendiente`/`leerPendiente`) y la acción de elegir lo pasa en cada `guardarCuenta`. En `conectar.ts`, `guardarCuenta` lo escribe en `valores` (también en el `onConflictDoUpdate`, para que reconectar rellene el nulo).

- [ ] **Step 3: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano si puedes: reconectar Instagram en DEV y ver `meta_user_id` lleno (`npm run db:studio`). Documentación: README, sección de Meta (`grep -n "INSTAGRAM_APP_SECRET\|redirect URI" README.md`): una frase — «al conectar se guarda tu id de usuario de Meta, que es lo que Meta manda cuando quitas la app; las cuentas conectadas antes del 2026-09-30 lo tienen vacío hasta reconectar».

```bash
git add src/db/schema.ts drizzle "src/app/api/social/[network]/callback/route.ts" src/lib/social/conectar.ts src/app/admin/actions.ts README.md
git commit -m "Al conectar Meta se guarda el id de usuario, y nace la tabla de solicitudes de borrado"
```

---

### Tarea 3: `darDeBaja` y `borrarDatosDe`

**Files:**
- Create: `src/lib/social/meta-bajas.ts`
- Test: `src/lib/social/meta-bajas.test.ts`

**Interfaces:**
- Consumes: `solicitudesBorrado`, `socialAccounts` (Tarea 2).
- Produces: `BAJA_DESDE_FACEBOOK = 'Quitaste la app desde Facebook: vuelve a conectar.'`; `darDeBaja(metaUserId): Promise<number>`; `pasosDeBorrado(metaUserId): SQL[]`; `borrarDatosDe(metaUserId): Promise<{ codigo: string; cuentas: number }>`; `codigoDeBorrado(): string`.

- [ ] **Step 1: Los tests que fallan**

Molde: `src/lib/social/fusion.test.ts` (los pasos se vuelven texto con `new PgDialect().sqlToQuery(paso)` y se afirma sobre `sql` y `params`). Afirmar:

- `BAJA_DESDE_FACEBOOK` letra por letra.
- `pasosDeBorrado('u1')` devuelve, en este orden, sentencias que: borran `post_metrics` de los `social_posts` de cuentas con ese `meta_user_id`; borran `post_comments` de esas cuentas; borran `social_posts`; borran `account_metrics`; borran `scheduled_post_targets`; borran `social_accounts` — y **todas** llevan `'u1'` en `params` y la condición `network in ('instagram','facebook')` (directa o por subconsulta sobre `social_accounts`).
- `codigoDeBorrado()` da 16 caracteres de `[a-z2-7]` y dos llamadas no coinciden.

- [ ] **Step 2: Correr y verlo fallar**

- [ ] **Step 3: El módulo**

```ts
import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { getDb, socialAccounts, solicitudesBorrado } from '@/db'

// Las dos cosas que Meta puede pedirnos por un usuario que quitó la app. Buscan por
// `meta_user_id` y no por dueño a propósito: Meta no sabe quién es nuestro dueño, y la
// petición llega firmada con el app secret, no con una sesión. Es la única excepción al
// arnés de aislamiento, y está anotada en docs/deuda-tecnica.md.

export const BAJA_DESDE_FACEBOOK = 'Quitaste la app desde Facebook: vuelve a conectar.'
const REDES_META = ['instagram', 'facebook'] as const

/** Deja sin credencial las cuentas de Meta de ese usuario; devuelve cuántas. */
export async function darDeBaja(metaUserId: string): Promise<number> {
  const filas = await getDb()
    .update(socialAccounts)
    .set({ accessToken: null, refreshToken: null, expiresAt: null, lastSyncError: BAJA_DESDE_FACEBOOK })
    .where(and(eq(socialAccounts.metaUserId, metaUserId), inArray(socialAccounts.network, [...REDES_META])))
    .returning({ id: socialAccounts.id })
  return filas.length
}

/** Los pasos del borrado, en orden, para poder probarlos sin base. */
export function pasosDeBorrado(metaUserId: string): SQL[] {
  const cuentas = sql`select id from social_accounts where meta_user_id = ${metaUserId} and network in ('instagram', 'facebook')`
  return [
    sql`delete from post_metrics where post_id in (select id from social_posts where account_id in (${cuentas}))`,
    sql`delete from post_comments where account_id in (${cuentas})`,
    sql`delete from social_posts where account_id in (${cuentas})`,
    sql`delete from account_metrics where account_id in (${cuentas})`,
    sql`delete from scheduled_post_targets where account_id in (${cuentas})`,
    sql`delete from social_accounts where id in (${cuentas})`,
  ]
}

/** 16 caracteres de base32 en minúscula: legible en una URL y sin ambigüedad 0/O, 1/l. */
export function codigoDeBorrado(): string {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz234567'
  return [...randomBytes(16)].map((b) => alfabeto[b % 32]).join('')
}

/** Borra lo que vino de Meta para ese usuario y deja constancia; devuelve el código. */
export async function borrarDatosDe(metaUserId: string): Promise<{ codigo: string; cuentas: number }> {
  const db = getDb()
  const codigo = codigoDeBorrado()
  return db.transaction(async (tx) => {
    const afectadas = await tx
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.metaUserId, metaUserId), inArray(socialAccounts.network, [...REDES_META])))
    for (const paso of pasosDeBorrado(metaUserId)) await tx.execute(paso)
    await tx.insert(solicitudesBorrado).values({ codigo, red: 'meta', metaUserId, cuentas: afectadas.length })
    return { codigo, cuentas: afectadas.length }
  })
}
```

Comprueba `isNotNull` no usado (quítalo) y que `scheduled_post_targets.account_id` es la columna real (`schema.ts:362`). El `delete` de `social_accounts` puede fallar por un FK sin `cascade` que no esté en la lista: revisa los tres `references(() => socialAccounts.id` de `schema.ts` (233, 299, 362) — son `social_posts`, `account_metrics` y `scheduled_post_targets`, que la lista borra antes; `post_comments` (450) tiene `cascade`, pero borrarlo explícito no hace daño y deja el orden a la vista.

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`. Documentación: `docs/deuda-tecnica.md`, entrada «El arnés de aislamiento solo llega a `src/lib`»: un párrafo que diga que `meta-bajas.ts` está en `src/lib` pero **no** filtra por dueño a propósito, y por qué. Nada más todavía.

```bash
git add src/lib/social/meta-bajas.ts src/lib/social/meta-bajas.test.ts docs/deuda-tecnica.md
git commit -m "La baja y el borrado de un usuario de Meta, por su id de usuario"
```

---

### Tarea 4: Las dos rutas, la página de estado y la documentación

**Files:**
- Create: `src/app/api/social/meta/baja/route.ts`, `src/app/api/social/meta/borrado/route.ts`
- Create: `src/app/api/social/meta/meta.test.ts` (los dos POST)
- Create: `src/app/(legal)/borrado/[codigo]/page.tsx`
- Modify: `src/app/(legal)/privacidad/page.tsx`, `README.md`

**Interfaces:**
- Consumes: `leerSignedRequest` (Tarea 1), `darDeBaja`, `borrarDatosDe` (Tarea 3), `solicitudesBorrado` (Tarea 2).

- [ ] **Step 1: Los tests de las rutas**

Molde: `src/app/api/schedule/posts/[id]/route.test.ts` (dobla el módulo que toca la base; prueba la puerta). Con `vi.stubEnv('INSTAGRAM_APP_SECRET', 's')` y un `signed_request` firmado en el test como en la Tarea 1:

- sin `signed_request`, o con firma inválida → `400`, y ni `darDeBaja` ni `borrarDatosDe` se llaman;
- sin `INSTAGRAM_APP_SECRET` configurado → `400` (la ruta queda cerrada, no abierta);
- `baja` válido → `200`, `darDeBaja('10201234567890')` llamado una vez;
- `borrado` válido → `200` con JSON `{ url: 'https://ejemplo.cl/borrado/<codigo>', confirmation_code: '<codigo>' }` donde `<codigo>` es lo que devolvió el doble de `borrarDatosDe`, y la `url` usa el origen de la petición.

El cuerpo se manda como `new URLSearchParams({ signed_request }).toString()` con `content-type: application/x-www-form-urlencoded`.

- [ ] **Step 2: Las rutas**

Las dos leen el formulario con `await request.formData()`, sacan `signed_request`, llaman a `leerSignedRequest(raw, env('INSTAGRAM_APP_SECRET'))` (con `env` de `@/lib/env`, que limpia el BOM) y responden `400` sin cuerpo si es `null` o si falta el secreto. `baja` responde `200` vacío. `borrado` responde `NextResponse.json({ url: \`${origin}/borrado/${codigo}\`, confirmation_code: codigo })`. `export const dynamic = 'force-dynamic'`. Un error de la base es `500` con `console.error` acotado (Meta reintenta).

- [ ] **Step 3: La página de estado**

`src/app/(legal)/borrado/[codigo]/page.tsx`, con el `layout.tsx` del grupo `(legal)` como marco: busca en `solicitudesBorrado` por `codigo`; si existe, «Datos borrados el {fecha larga en español, zona del sitio}: {N} {cuenta|cuentas} de Instagram y Facebook.»; si no, «No conocemos ese código de borrado.» con `notFound()` o un 200 con esa frase (elige 200: Meta puede consultar la URL y un 404 se lee como «no borraron nada»). Sin nombre, correo ni handle.

- [ ] **Step 4: Documentación y verificación**

- `README.md`, sección de Meta: las dos URLs a configurar en App Settings → Basic (`https://TU-DOMINIO/api/social/meta/baja` como *Deauthorize callback URL* y `https://TU-DOMINIO/api/social/meta/borrado` como *Data deletion request URL*), qué hace cada una, y la tabla de URLs públicas con `/borrado/<código>`.
- `src/app/(legal)/privacidad/page.tsx`, donde dice «escribe a …»: una frase más — quitar la app desde Facebook borra lo que vino de Instagram y Facebook, y la página de estado lo confirma.

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano: `curl -X POST -d "signed_request=$(node -e '…firmar con el secreto de .env.local…')" http://localhost:3001/api/social/meta/borrado` contra el dev server y abrir la URL devuelta.

```bash
git add src/app/api/social/meta "src/app/(legal)/borrado" "src/app/(legal)/privacidad/page.tsx" README.md
git commit -m "Meta puede darnos de baja y pedir el borrado: dos rutas y la página de estado"
```

---

## Lo que ningún test comprueba

Que Meta acepte las URLs en App Settings (eso se ve al configurarlas) y que un usuario real que quita la app desde Facebook dispare el callback: se prueba una vez con la cuenta del dueño antes de mandar el App Review.
