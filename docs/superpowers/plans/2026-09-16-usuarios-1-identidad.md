# Usuarios 1: identidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que exista la tabla de usuarios; que se entre al panel con un código de seis dígitos enviado al correo, solo si el correo fue invitado; que la sesión web y el token móvil digan quién eres; que el admin invite y quite usuarios; y que el teléfono del dueño siga entrando con la contraseña mientras la app no cambie. Nadie más que el admin está invitado al terminar, y todo el mundo sigue viendo todo: el dueño en las tablas es la entrega 2.

**Architecture:** Dos tablas nuevas (`users`, `codigos_ingreso`) con su migración generada. Lo puro en `src/lib/ingreso.ts` (correo, código, hash, vigencia, tope) y `src/lib/sesion-token.ts` (el JWT de sesión con `sub`, `rol`, `sv`, `purpose`) con tests; `src/lib/usuarios.ts` y `src/lib/correo.ts` hablan con la base y con Resend; `src/lib/auth.ts` queda como la única puerta del panel (`requireUser`, `requireAdmin`, `usuarioActual`). Páginas nuevas `/ingresar` y `/admin/usuarios`; `/admin/login` redirige. El endpoint móvil acepta contraseña (dueño) y correo más código.

**Tech Stack:** Next.js App Router (server actions, `next/headers`), Drizzle + Neon con migraciones (`npm run db:generate`), `jose` (JWT), `node:crypto` (HKDF, sha256, randomInt, timingSafeEqual), Resend REST, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-usuarios-e-inquilinos-design.md` (secciones 1 a 5, «Manejo de errores», «Testing», «Variables de entorno», «Las entregas» punto 1). Una desviación de la spec, decidida aquí: la fila del admin **no** se inserta en la migración (el SQL generado no puede leer `ADMIN_EMAIL`); la crea `asegurarAdmin()` en el primer uso, de forma idempotente. Y en esta entrega «Quitar» solo borra usuarios que nunca entraron; el chequeo «sin datos» de la spec §4 necesita `owner_id` y llega en la entrega 2.

Rama: `usuarios`, nacida de `main` con la spec commiteada (`e962a2e`).

## Global Constraints

- Frases fijas exactas: `CORREO_INVALIDO = 'Ese correo no se ve bien.'`, `CODIGO_ENVIADO = 'Si tu correo está invitado, te llegará un código en un minuto.'`, `CODIGO_INCORRECTO = 'Ese código no es válido o ya venció.'`, `DEMASIADOS_INTENTOS = 'Demasiados intentos. Pide un código nuevo.'`, `SESION_CADUCADA = 'Tu sesión terminó. Vuelve a entrar.'`, `USUARIO_YA_INVITADO = 'Ese correo ya está invitado.'`, `USUARIO_CON_INGRESOS = 'Ese usuario ya entró alguna vez; no se puede quitar todavía.'`.
- Un correo desconocido recibe **la misma respuesta** que uno invitado (`CODIGO_ENVIADO`) y no dispara ningún correo.
- Código: seis dígitos de `crypto.randomInt(0, 1_000_000)` con ceros a la izquierda; `VIGENCIA_MS = 10 * 60_000`; `MAX_INTENTOS = 5` por código; `MAX_CODIGOS_POR_VENTANA = 3` cada `VENTANA_MS = 15 * 60_000` por usuario; pedir un código nuevo invalida los vivos del mismo usuario. Nunca se guarda el código en claro: `sha256(codigo + ':' + claveDerivada)`.
- Sesión web: JWT HS256 con `{ sub, rol, sv, purpose: 'session' }`, clave HKDF de `AUTH_SECRET` con info `parrilla-session-v1`, 30 días. El token del `state` de OAuth (otra clave, otro `purpose`) no vale como sesión y viceversa. Desplegar esta entrega cierra la sesión web del dueño una vez (clave nueva); es esperado.
- Token móvil: `{ sub, sv, purpose: 'mobile', v }` con la misma clave HKDF de hoy (`portafolio-mobile-v1`); un token viejo sin `sub` deja de valer (la app pedirá la contraseña una vez).
- `passwordMatches` y `ADMIN_PASSWORD` sobreviven **solo** en `POST /api/mobile/session` con cuerpo `{ password }`, que emite el token del admin.
- El admin nace de `ADMIN_EMAIL` (obligatoria) con `rol = 'admin'`; `asegurarAdmin()` es idempotente (upsert por correo).
- Comentarios en el código solo para restricciones que el código no puede mostrar. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Git: HEAD verificado antes de empezar (`git log --oneline -1` muestra `e962a2e` o un commit de este plan), jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. **Ninguna tarea corre `db:migrate*` ni toca una base**; la migración la aplica Vercel al desplegar.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | `users`, `codigosIngreso`, tipos |
| `drizzle/0001_*.sql` (+ meta) | la migración generada |
| `src/lib/ingreso.ts` (+ test) | correo, código, hash, vigencia, tope: puro |
| `src/lib/sesion-token.ts` (+ test) | firmar y leer el JWT de sesión web |
| `src/lib/mobile-token.ts` (+ test) | el token móvil gana `sub` y `sv` |
| `src/lib/correo.ts` | enviar un correo por Resend |
| `src/lib/usuarios.ts` | `asegurarAdmin`, buscar, listar, invitar, quitar |
| `src/lib/auth.ts` | `createSession(user)`, `usuarioActual`, `requireUser`, `requireAdmin`, `destroySession`, `passwordMatches` |
| `src/app/ingresar/*` | correo → código → sesión |
| `src/app/admin/login/page.tsx` | redirige a `/ingresar` |
| `src/app/admin/actions.ts` | `requireAuth` → `requireUser`; `login` desaparece; `logout` a `/ingresar`; acciones de usuarios |
| `src/app/admin/(dash)/layout.tsx`, `nav.tsx` | `requireUser`; pestaña «Usuarios» solo admin |
| `src/app/admin/(dash)/usuarios/page.tsx` | invitar y quitar |
| `src/app/api/social/[network]/connect,callback` | `usuarioActual()` en vez de `isAuthenticated()` |
| `src/app/api/mobile/session/route.ts`, `session/codigo/route.ts` | sesión móvil doble |
| `src/lib/mobile-guardia.ts`, `src/lib/mobile-api.ts` y las 7 rutas móviles | `requireMobileUser` (server-only, aparte de mobile-api.ts que lo importan tests) |
| `README.md`, `.env.example` | `ADMIN_EMAIL`, `INGRESO_FROM`, cómo se entra |

---

### Task 1: Las tablas, la migración y lo puro del ingreso

**Files:**
- Modify: `src/db/schema.ts` (después de `ajustes`; tipos al final)
- Create: `src/lib/ingreso.ts`
- Test: `src/lib/ingreso.test.ts`
- Create (generados): `drizzle/0001_*.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json` (actualizado)

**Interfaces:**
- Produces, de `schema.ts`: `users`, `codigosIngreso`, `type Usuario`, `type Rol = 'admin' | 'usuario'`, `ROLES`.
- Produces, de `ingreso.ts`: las frases de Global Constraints; `VIGENCIA_MS`, `MAX_INTENTOS`, `MAX_CODIGOS_POR_VENTANA`, `VENTANA_MS`; `normalizarCorreo(bruto: string): string | null`; `generarCodigo(): string`; `hashCodigo(codigo: string, clave: string): string`; `codigoCoincide(codigo: string, hash: string, clave: string): boolean`; `vigente(fila: { expiraEn: Date; usadoEn: Date | null; intentos: number }, now: Date): boolean`; `puedePedir(pedidosRecientes: Date[], now: Date): boolean`.

- [ ] **Step 1: Test que falla**

`src/lib/ingreso.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_CODIGOS_POR_VENTANA,
  MAX_INTENTOS,
  VENTANA_MS,
  VIGENCIA_MS,
  codigoCoincide,
  generarCodigo,
  hashCodigo,
  normalizarCorreo,
  puedePedir,
  vigente,
} from './ingreso'

const now = new Date('2026-09-16T12:00:00Z')

describe('normalizarCorreo', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarCorreo('  Vicente@Ejemplo.CL ')).toBe('vicente@ejemplo.cl')
  })
  it('rechaza lo que no parece correo', () => {
    expect(normalizarCorreo('')).toBeNull()
    expect(normalizarCorreo('sin-arroba')).toBeNull()
    expect(normalizarCorreo('a@b')).toBeNull()
    expect(normalizarCorreo('dos @dominio.cl')).toBeNull()
    expect(normalizarCorreo('a'.repeat(250) + '@x.cl')).toBeNull()
  })
})

describe('generarCodigo y hashCodigo', () => {
  it('seis dígitos, con ceros a la izquierda', () => {
    for (let i = 0; i < 50; i++) expect(generarCodigo()).toMatch(/^\d{6}$/)
  })
  it('el hash es estable, distinto por clave, y coincide en tiempo constante', () => {
    const h = hashCodigo('123456', 'clave')
    expect(h).toBe(hashCodigo('123456', 'clave'))
    expect(h).not.toBe(hashCodigo('123456', 'otra'))
    expect(codigoCoincide('123456', h, 'clave')).toBe(true)
    expect(codigoCoincide('123457', h, 'clave')).toBe(false)
    expect(codigoCoincide('12345', h, 'clave')).toBe(false)
  })
})

describe('vigente', () => {
  const fila = { expiraEn: new Date(now.getTime() + VIGENCIA_MS), usadoEn: null, intentos: 0 }
  it('vale si no venció, no se usó y no agotó intentos', () => {
    expect(vigente(fila, now)).toBe(true)
  })
  it('no vale vencido, usado o agotado', () => {
    expect(vigente({ ...fila, expiraEn: new Date(now.getTime() - 1) }, now)).toBe(false)
    expect(vigente({ ...fila, usadoEn: now }, now)).toBe(false)
    expect(vigente({ ...fila, intentos: MAX_INTENTOS }, now)).toBe(false)
  })
})

describe('puedePedir', () => {
  it('tres por ventana; el cuarto espera', () => {
    const hace = (ms: number) => new Date(now.getTime() - ms)
    expect(puedePedir([], now)).toBe(true)
    expect(puedePedir([hace(1000), hace(2000)], now)).toBe(true)
    expect(puedePedir([hace(1000), hace(2000), hace(3000)], now)).toBe(false)
    expect(puedePedir([hace(VENTANA_MS + 1), hace(2000), hace(3000)], now)).toBe(true)
    expect(MAX_CODIGOS_POR_VENTANA).toBe(3)
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/ingreso.test.ts`
Expected: FAIL, import sin resolver.

- [ ] **Step 3: Las tablas**

En `src/db/schema.ts`, después de `ajustes`:

```ts
export const ROLES = ['admin', 'usuario'] as const
export type Rol = (typeof ROLES)[number]

/**
 * Quién usa Parrilla. Hasta el subproyecto de inquilinos todo el mundo ve todo; esta tabla
 * existe para que la sesión diga quién eres y para invitar. `sesion_version` cierra las
 * sesiones de una persona sin tocar a las demás ni rotar `AUTH_SECRET`, que además cifra
 * los tokens sociales.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  correo: text('correo').notNull().unique(),
  nombre: text('nombre'),
  rol: text('rol').$type<Rol>().notNull().default('usuario'),
  sesionVersion: integer('sesion_version').notNull().default(1),
  invitadoEn: timestamp('invitado_en', { withTimezone: true }).notNull().defaultNow(),
  primerIngresoEn: timestamp('primer_ingreso_en', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Un código de ingreso por correo: nunca el código, solo su hash. Diez minutos, un uso. */
export const codigosIngreso = pgTable(
  'codigos_ingreso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
    usadoEn: timestamp('usado_en', { withTimezone: true }),
    intentos: integer('intentos').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('codigos_ingreso_user_idx').on(t.userId, t.createdAt)],
)
```

Y al final: `export type Usuario = typeof users.$inferSelect` y `export type CodigoIngreso = typeof codigosIngreso.$inferSelect`.

- [ ] **Step 4: Lo puro**

`src/lib/ingreso.ts`:

```ts
// El ingreso por correo, en su parte pura: qué correo vale, cómo se genera y se guarda un
// código, cuándo sigue vivo y cuántos se pueden pedir. Quien toca la base y Resend está en
// lib/usuarios.ts y en las acciones de /ingresar.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export const CORREO_INVALIDO = 'Ese correo no se ve bien.'
export const CODIGO_ENVIADO = 'Si tu correo está invitado, te llegará un código en un minuto.'
export const CODIGO_INCORRECTO = 'Ese código no es válido o ya venció.'
export const DEMASIADOS_INTENTOS = 'Demasiados intentos. Pide un código nuevo.'
export const SESION_CADUCADA = 'Tu sesión terminó. Vuelve a entrar.'
export const USUARIO_YA_INVITADO = 'Ese correo ya está invitado.'
export const USUARIO_CON_INGRESOS = 'Ese usuario ya entró alguna vez; no se puede quitar todavía.'

export const VIGENCIA_MS = 10 * 60_000
export const MAX_INTENTOS = 5
export const MAX_CODIGOS_POR_VENTANA = 3
export const VENTANA_MS = 15 * 60_000

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_CORREO = 254

/** Minúsculas y sin espacios: es la clave por la que se busca al usuario. */
export function normalizarCorreo(bruto: string): string | null {
  const limpio = bruto.trim().toLowerCase()
  if (limpio.length === 0 || limpio.length > MAX_CORREO) return null
  return CORREO.test(limpio) ? limpio : null
}

export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Con la clave derivada, para que una copia de la tabla no sirva de nada por sí sola. */
export function hashCodigo(codigo: string, clave: string): string {
  return createHash('sha256').update(`${codigo}:${clave}`).digest('hex')
}

export function codigoCoincide(codigo: string, hash: string, clave: string): boolean {
  if (!/^\d{6}$/.test(codigo)) return false
  const a = Buffer.from(hashCodigo(codigo, clave), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function vigente(fila: { expiraEn: Date; usadoEn: Date | null; intentos: number }, now: Date): boolean {
  if (fila.usadoEn) return false
  if (fila.intentos >= MAX_INTENTOS) return false
  return fila.expiraEn.getTime() > now.getTime()
}

/** Tres códigos por usuario cada quince minutos: frena a quien martille «reenviar». */
export function puedePedir(pedidosRecientes: Date[], now: Date): boolean {
  const desde = now.getTime() - VENTANA_MS
  return pedidosRecientes.filter((d) => d.getTime() > desde).length < MAX_CODIGOS_POR_VENTANA
}
```

- [ ] **Step 5: Genera la migración**

Run: `npm run db:generate`
Expected: aparece `drizzle/0001_<nombre>.sql` con `CREATE TABLE "users"` y `CREATE TABLE "codigos_ingreso"`, más el snapshot y el journal actualizado. Si drizzle-kit preguntara algo, elige crear (no renombrar) y anótalo.

- [ ] **Step 6: Corre y commit**

Run: `npx vitest run src/lib/ingreso.test.ts && npm run typecheck`
Expected: PASS, 8 tests.

```bash
git add src/db/schema.ts src/lib/ingreso.ts src/lib/ingreso.test.ts drizzle
git commit -m "Crea las tablas de usuarios y códigos de ingreso con su lógica pura

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 2: Los tokens con identidad, el correo y los usuarios

**Files:**
- Create: `src/lib/sesion-token.ts`, `src/lib/sesion-token.test.ts`
- Modify: `src/lib/mobile-token.ts`; Test: `src/lib/mobile-token.test.ts` (créalo si no existe)
- Create: `src/lib/correo.ts`, `src/lib/usuarios.ts`

**Interfaces:**
- Consumes: `users`, `codigosIngreso`, `Usuario`, `Rol` de `@/db`; `ingreso.ts`.
- Produces:
  - `sesion-token.ts`: `type SesionClaims = { sub: string; rol: Rol; sv: number }`; `firmarSesion(claims): Promise<string>`; `leerSesion(token: string): Promise<SesionClaims | null>`; `MAX_AGE_SECONDS = 60 * 60 * 24 * 30`.
  - `mobile-token.ts`: `mintMobileToken(claims: { sub: string; sv: number }): Promise<string>`; `leerTokenMovil(token: string): Promise<{ sub: string; sv: number } | null>`; `mobileTokenIsValid` desaparece.
  - `correo.ts`: `enviarCorreo(mensaje: { to: string; subject: string; text: string }): Promise<boolean>` (false si no hay `RESEND_API_KEY` o Resend falla; nunca lanza).
  - `usuarios.ts` (server-only): `asegurarAdmin(): Promise<Usuario>`; `buscarPorCorreo(correo): Promise<Usuario | null>`; `buscarPorId(id): Promise<Usuario | null>`; `listarUsuarios(): Promise<Usuario[]>`; `invitar(correo, nombre: string | null): Promise<{ usuario: Usuario } | { error: string }>`; `quitar(id): Promise<{ ok: true } | { error: string }>`; `claveCodigos(): string`.

- [ ] **Step 1: Tests que fallan**

`src/lib/sesion-token.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { firmarSesion, leerSesion } from './sesion-token'
import { signOAuthState } from './social/oauth-state'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-largo-largo'
})

describe('sesión', () => {
  it('firma y lee sub, rol y sv', async () => {
    const t = await firmarSesion({ sub: 'u1', rol: 'admin', sv: 3 })
    expect(await leerSesion(t)).toEqual({ sub: 'u1', rol: 'admin', sv: 3 })
  })

  it('rechaza basura y tokens de otro propósito', async () => {
    expect(await leerSesion('')).toBeNull()
    expect(await leerSesion('no.es.jwt')).toBeNull()
    // El state de OAuth viaja por la URL de instagram.com: jamás debe valer como sesión.
    expect(await leerSesion(await signOAuthState('instagram'))).toBeNull()
  })
})
```

`src/lib/mobile-token.test.ts` ya existe: reemplaza su contenido completo por este (conserva los casos del impostor y del otro propósito, con la firma nueva):

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { leerTokenMovil, mintMobileToken } from './mobile-token'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
  delete process.env.MOBILE_TOKEN_VERSION
})

describe('mobile-token', () => {
  it('un token recién emitido devuelve su sujeto y su versión de sesión', async () => {
    expect(await leerTokenMovil(await mintMobileToken({ sub: 'u1', sv: 2 }))).toEqual({ sub: 'u1', sv: 2 })
  })

  it('basura, vacío y recortado no valen', async () => {
    expect(await leerTokenMovil('')).toBeNull()
    expect(await leerTokenMovil('no-es-un-jwt')).toBeNull()
    const real = await mintMobileToken({ sub: 'u1', sv: 1 })
    expect(await leerTokenMovil(real.slice(0, -3))).toBeNull()
  })

  it('subir la versión revoca los tokens ya emitidos', async () => {
    const antiguo = await mintMobileToken({ sub: 'u1', sv: 1 })
    process.env.MOBILE_TOKEN_VERSION = '2'
    expect(await leerTokenMovil(antiguo)).toBeNull()
    expect(await leerTokenMovil(await mintMobileToken({ sub: 'u1', sv: 1 }))).toEqual({ sub: 'u1', sv: 1 })
    delete process.env.MOBILE_TOKEN_VERSION
  })

  it('un token firmado con AUTH_SECRET pelado no vale: la llave se deriva', async () => {
    const impostor = await new SignJWT({ purpose: 'mobile', v: '1', sv: 1 })
      .setSubject('u1')
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))
    expect(await leerTokenMovil(impostor)).toBeNull()
  })

  it('un token de otro propósito o sin sujeto no vale aunque la firma calce', async () => {
    const { hkdfSync } = await import('node:crypto')
    const key = new Uint8Array(
      hkdfSync('sha256', process.env.AUTH_SECRET!, 'portafolio-mobile-v1', 'token', 32),
    )
    const otro = await new SignJWT({ purpose: 'social-oauth-state', v: '1', sv: 1 })
      .setSubject('u1')
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key)
    expect(await leerTokenMovil(otro)).toBeNull()
    // El token viejo de la app: propósito y versión correctos, pero sin sujeto.
    const viejo = await new SignJWT({ purpose: 'mobile', v: '1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .sign(key)
    expect(await leerTokenMovil(viejo)).toBeNull()
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/sesion-token.test.ts src/lib/mobile-token.test.ts`
Expected: FAIL.

- [ ] **Step 3: `sesion-token.ts`**

```ts
// El JWT de la cookie de sesión. Clave derivada de AUTH_SECRET con un `info` propio: el
// mismo secreto firma el `state` de OAuth y cifra los tokens sociales, y las tres cosas
// deben ser indistinguibles de basura entre sí.
import { hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Rol } from '@/db/schema'
import { ROLES } from '@/db/schema'
import { env } from './env'

const PURPOSE = 'session'
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type SesionClaims = { sub: string; rol: Rol; sv: number }

function key(): Uint8Array {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new Uint8Array(hkdfSync('sha256', secret, 'parrilla-session-v1', 'session', 32))
}

export function firmarSesion(claims: SesionClaims): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, rol: claims.rol, sv: claims.sv })
    .setSubject(claims.sub)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key())
}

/** Null ante cualquier duda: firma ajena, propósito ajeno, claims que no son lo que dicen. */
export async function leerSesion(token: string): Promise<SesionClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    if (payload.purpose !== PURPOSE || typeof payload.sub !== 'string') return null
    if (!(ROLES as readonly unknown[]).includes(payload.rol)) return null
    if (typeof payload.sv !== 'number') return null
    return { sub: payload.sub, rol: payload.rol as Rol, sv: payload.sv }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: `mobile-token.ts`**

Reemplaza `mintMobileToken` y `mobileTokenIsValid` por:

```ts
export function mintMobileToken(claims: { sub: string; sv: number }): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, v: version(), sv: claims.sv })
    .setSubject(claims.sub)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(key())
}

/** Null ante cualquier duda: firma ajena, propósito ajeno, versión revocada o sin sujeto. */
export async function leerTokenMovil(token: string): Promise<{ sub: string; sv: number } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key())
    if (payload.purpose !== PURPOSE || payload.v !== version()) return null
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return null
    return { sub: payload.sub, sv: payload.sv }
  } catch {
    return null
  }
}
```

Actualiza el comentario de cabecera: ya no es «el dueño es el único usuario»; el token lleva el sujeto y su versión de sesión, y `MOBILE_TOKEN_VERSION` sigue siendo el interruptor global.

- [ ] **Step 5: `correo.ts` y `usuarios.ts`**

`src/lib/correo.ts`:

```ts
import 'server-only'
import { env } from './env'

/**
 * Un correo por Resend. Mejor esfuerzo: sin clave no manda y devuelve false; un fallo de
 * Resend va al log y devuelve false. Quien llama decide qué decirle al usuario, que en el
 * ingreso es siempre la misma frase neutra.
 */
export async function enviarCorreo(mensaje: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = env('RESEND_API_KEY')
  if (!apiKey) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('INGRESO_FROM') ?? 'onboarding@resend.dev', ...mensaje }),
    })
    if (!response.ok) {
      console.error('[correo] Resend respondió', response.status, (await response.text()).slice(0, 200))
      return false
    }
    return true
  } catch (error) {
    console.error('[correo]', String(error).slice(0, 300))
    return false
  }
}
```

`src/lib/usuarios.ts`:

```ts
import 'server-only'
import { hkdfSync } from 'node:crypto'
import { asc, desc, eq, gte } from 'drizzle-orm'
import { codigosIngreso, getDb, users, type Usuario } from '@/db'
import { env } from './env'
import { USUARIO_CON_INGRESOS, USUARIO_YA_INVITADO, VENTANA_MS, normalizarCorreo, CORREO_INVALIDO } from './ingreso'

/** La clave con la que se hashean los códigos: derivada, para no reutilizar AUTH_SECRET. */
export function claveCodigos(): string {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', secret, 'parrilla-codigos-v1', 'codigos', 32)).toString('hex')
}

/**
 * El primer usuario nace de ADMIN_EMAIL en el primer uso, no en la migración (el SQL no
 * puede leer variables). Idempotente: si ya existe, solo garantiza el rol.
 */
export async function asegurarAdmin(): Promise<Usuario> {
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) throw new Error('ADMIN_EMAIL no está configurada o no es un correo')
  const db = getDb()
  const [fila] = await db
    .insert(users)
    .values({ correo, rol: 'admin' })
    .onConflictDoUpdate({ target: users.correo, set: { rol: 'admin', updatedAt: new Date() } })
    .returning()
  return fila!
}

export async function buscarPorCorreo(correo: string): Promise<Usuario | null> {
  const [fila] = await getDb().select().from(users).where(eq(users.correo, correo)).limit(1)
  return fila ?? null
}

export async function buscarPorId(id: string): Promise<Usuario | null> {
  const [fila] = await getDb().select().from(users).where(eq(users.id, id)).limit(1)
  return fila ?? null
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return getDb().select().from(users).orderBy(asc(users.invitadoEn))
}

export async function invitar(correoBruto: string, nombre: string | null): Promise<{ usuario: Usuario } | { error: string }> {
  const correo = normalizarCorreo(correoBruto)
  if (!correo) return { error: CORREO_INVALIDO }
  if (await buscarPorCorreo(correo)) return { error: USUARIO_YA_INVITADO }
  const [usuario] = await getDb().insert(users).values({ correo, nombre: nombre?.trim() || null }).returning()
  return { usuario: usuario! }
}

/** En esta entrega solo se quita a quien nunca entró; el chequeo «sin datos» llega con el dueño en las tablas. */
export async function quitar(id: string): Promise<{ ok: true } | { error: string }> {
  const usuario = await buscarPorId(id)
  if (!usuario) return { ok: true }
  if (usuario.rol === 'admin' || usuario.primerIngresoEn) return { error: USUARIO_CON_INGRESOS }
  await getDb().delete(users).where(eq(users.id, id))
  return { ok: true }
}

/** Fechas de los códigos pedidos por este usuario en la ventana, para `puedePedir`. */
export async function pedidosRecientes(userId: string, now: Date): Promise<Date[]> {
  const filas = await getDb()
    .select({ createdAt: codigosIngreso.createdAt })
    .from(codigosIngreso)
    .where(eq(codigosIngreso.userId, userId))
    .orderBy(desc(codigosIngreso.createdAt))
    .limit(10)
  const desde = now.getTime() - VENTANA_MS
  return filas.map((f) => f.createdAt).filter((d) => d.getTime() > desde)
}
```

(`gte` queda sin usar: quítalo del import si ESLint se queja.)

- [ ] **Step 6: Corre, typecheck y commit**

Run: `npx vitest run src/lib/sesion-token.test.ts src/lib/mobile-token.test.ts && npm run typecheck`
Expected: PASS, 7 tests. El typecheck **va a fallar** en `src/lib/mobile-api.ts` (usa `mobileTokenIsValid`) y en `src/app/api/mobile/session/route.ts` (`mintMobileToken()` sin argumentos): déjalos así, los arregla la Task 6; anótalo en el reporte y confirma que son los únicos errores.

```bash
git add src/lib/sesion-token.ts src/lib/sesion-token.test.ts src/lib/mobile-token.ts src/lib/mobile-token.test.ts src/lib/correo.ts src/lib/usuarios.ts
git commit -m "Da identidad a la sesión web y al token móvil, y suma correo y usuarios

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 3: `auth.ts` y la puerta del panel

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/admin/actions.ts` (líneas 12, 64-88 y los 25 `requireAuth()`)
- Modify: `src/app/admin/(dash)/layout.tsx`, `src/app/admin/login/page.tsx`
- Modify: `src/app/api/social/[network]/connect/route.ts:53`, `callback/route.ts:381`
- Delete: `src/app/admin/login/login-form.tsx`

**Interfaces:**
- Produces, de `auth.ts`: `createSession(usuario: Pick<Usuario, 'id' | 'rol' | 'sesionVersion'>): Promise<void>`; `destroySession()`; `usuarioActual(): Promise<Usuario | null>`; `requireUser(): Promise<Usuario>` (redirige a `/ingresar`); `requireAdmin(): Promise<Usuario>` (redirige a `/admin` si no es admin); `passwordMatches` se mantiene.

- [ ] **Step 1: `auth.ts`**

```ts
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Usuario } from '@/db'
import { env } from './env'
import { firmarSesion, leerSesion, MAX_AGE_SECONDS } from './sesion-token'
import { buscarPorId } from './usuarios'

const COOKIE_NAME = 'pf_session'

/** Sobrevive solo para la sesión móvil de transición: la app instalada entra con la contraseña. */
export function passwordMatches(candidate: string): boolean {
  const expected = env('ADMIN_PASSWORD')
  if (!expected) return false
  const a = new TextEncoder().encode(candidate)
  const b = new TextEncoder().encode(expected)
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export async function createSession(usuario: Pick<Usuario, 'id' | 'rol' | 'sesionVersion'>): Promise<void> {
  const token = await firmarSesion({ sub: usuario.id, rol: usuario.rol, sv: usuario.sesionVersion })
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/**
 * Quién está detrás de la cookie, o null. Se relee la fila: si el usuario subió su
 * `sesion_version` (cerró todas sus sesiones) o fue quitado, la cookie muere aquí.
 */
export async function usuarioActual(): Promise<Usuario | null> {
  const store = await cookies()
  const claims = await leerSesion(store.get(COOKIE_NAME)?.value ?? '')
  if (!claims) return null
  const usuario = await buscarPorId(claims.sub)
  if (!usuario || usuario.sesionVersion !== claims.sv) return null
  return usuario
}

export async function requireUser(): Promise<Usuario> {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/ingresar')
  return usuario
}

export async function requireAdmin(): Promise<Usuario> {
  const usuario = await requireUser()
  if (usuario.rol !== 'admin') redirect('/admin')
  return usuario
}

export { COOKIE_NAME }
```

`isAuthenticated`, `SESSION_ROLE` y el `secret()` plano desaparecen.

- [ ] **Step 2: Las llamadas**

- `src/app/admin/actions.ts`: el import de `@/lib/auth` pasa a `{ destroySession, requireUser }`; borra la función local `requireAuth` (líneas 64-66), la acción `login` completa y el limitador `rateLimited` con `attempts`, `MAX_ATTEMPTS`, `WINDOW_MS` y su comentario (solo `login` lo usaba). `headers` de `next/headers` queda sin uso: quítalo del import (deja `cookies` si otra acción lo usa; revisa con grep). Reemplaza **todas** las apariciones de `await requireAuth()` por `await requireUser()` (25). `logout` redirige a `/ingresar`.
- `src/app/admin/(dash)/layout.tsx`: `import { requireUser } from '@/lib/auth'` y `const usuario = await requireUser()` en vez del `if (!(await isAuthenticated())) redirect(...)`; pasa `esAdmin={usuario.rol === 'admin'}` a `<AdminNav />` (la prop se agrega en la Task 5; por ahora agrégala al componente con `esAdmin?: boolean` sin usarla, para que compile).
- `src/app/admin/login/page.tsx`: queda en tres líneas: `import { redirect } from 'next/navigation'`, `export const dynamic = 'force-dynamic'`, `export default function LoginPage() { redirect('/ingresar') }`. Borra `login-form.tsx`.
- `connect/route.ts:53` y `callback/route.ts:381`: `import { usuarioActual } from '@/lib/auth'` y `if (!(await usuarioActual())) return new NextResponse('No autorizado', { status: 401 })`.

- [ ] **Step 3: Typecheck y commit**

Run: `npm run typecheck`
Expected: solo los dos errores de móvil pendientes de la Task 6 (`mobile-api.ts`, `mobile/session/route.ts`). Ningún otro.

```bash
git add src/lib/auth.ts src/app/admin/actions.ts "src/app/admin/(dash)/layout.tsx" "src/app/admin/(dash)/nav.tsx" src/app/admin/login/page.tsx "src/app/api/social/[network]/connect/route.ts" "src/app/api/social/[network]/callback/route.ts"
git rm -q src/app/admin/login/login-form.tsx
git commit -m "Hace que la puerta del panel devuelva un usuario y manda el login a /ingresar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 4: `/ingresar`

**Files:**
- Create: `src/app/ingresar/page.tsx`, `src/app/ingresar/codigo/page.tsx`, `src/app/ingresar/acciones.ts`, `src/app/ingresar/formularios.tsx`

**Interfaces:**
- Consumes: `usuarios.ts`, `correo.ts`, `ingreso.ts`, `auth.ts`, `codigosIngreso`.
- Produces: acciones `pedirCodigo(prev, formData)` y `canjearCodigo(prev, formData)` con `FormState = { error?: string; ok?: boolean }`.

- [ ] **Step 1: Las acciones**

`src/app/ingresar/acciones.ts`:

```ts
'use server'

import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { codigosIngreso, getDb, users } from '@/db'
import { createSession, usuarioActual } from '@/lib/auth'
import { enviarCorreo } from '@/lib/correo'
import {
  CODIGO_ENVIADO,
  CODIGO_INCORRECTO,
  CORREO_INVALIDO,
  DEMASIADOS_INTENTOS,
  MAX_INTENTOS,
  VIGENCIA_MS,
  codigoCoincide,
  generarCodigo,
  hashCodigo,
  normalizarCorreo,
  puedePedir,
  vigente,
} from '@/lib/ingreso'
import { asegurarAdmin, buscarPorCorreo, claveCodigos, pedidosRecientes } from '@/lib/usuarios'

export type FormState = { error?: string; ok?: boolean; correo?: string }

/**
 * Siempre la misma frase, exista o no el correo: la lista de invitados no se revela por
 * la diferencia entre dos mensajes. El admin se asegura acá para que el primer ingreso
 * del dueño funcione sin ningún paso previo.
 */
export async function pedirCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  if (!correo) return { error: CORREO_INVALIDO }
  await asegurarAdmin()
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return { ok: true, correo }

  const now = new Date()
  if (!puedePedir(await pedidosRecientes(usuario.id, now), now)) return { ok: true, correo }

  const db = getDb()
  // Un código nuevo invalida los vivos: solo el último sirve.
  await db
    .update(codigosIngreso)
    .set({ usadoEn: now })
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn)))
  const codigo = generarCodigo()
  await db.insert(codigosIngreso).values({
    userId: usuario.id,
    hash: hashCodigo(codigo, claveCodigos()),
    expiraEn: new Date(now.getTime() + VIGENCIA_MS),
  })
  const enviado = await enviarCorreo({
    to: usuario.correo,
    subject: `${codigo} es tu código para entrar a Parrilla`,
    text: `Tu código para entrar a Parrilla es ${codigo}. Vale diez minutos. Si no lo pediste, ignora este correo.`,
  })
  if (!enviado) console.error('[ingreso] no se pudo mandar el código a', usuario.correo)
  return { ok: true, correo }
}

export async function canjearCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
  if (!correo) return { error: CORREO_INVALIDO }
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return { error: CODIGO_INCORRECTO, correo }

  const db = getDb()
  const now = new Date()
  const [fila] = await db
    .select()
    .from(codigosIngreso)
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn), gt(codigosIngreso.expiraEn, now)))
    .orderBy(desc(codigosIngreso.createdAt))
    .limit(1)
  if (!fila || !vigente(fila, now)) return { error: CODIGO_INCORRECTO, correo }

  if (!codigoCoincide(codigo, fila.hash, claveCodigos())) {
    const intentos = fila.intentos + 1
    await db.update(codigosIngreso).set({ intentos }).where(eq(codigosIngreso.id, fila.id))
    return { error: intentos >= MAX_INTENTOS ? DEMASIADOS_INTENTOS : CODIGO_INCORRECTO, correo }
  }

  await db.update(codigosIngreso).set({ usadoEn: now }).where(eq(codigosIngreso.id, fila.id))
  await db
    .update(users)
    .set({ primerIngresoEn: usuario.primerIngresoEn ?? now, updatedAt: now })
    .where(eq(users.id, usuario.id))
  await createSession(usuario)
  redirect('/admin')
}

export async function yaDentro(): Promise<boolean> {
  return (await usuarioActual()) !== null
}
```

- [ ] **Step 2: Las páginas y formularios**

`src/app/ingresar/formularios.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Submit } from '@/components/ui'
import { canjearCodigo, pedirCodigo, type FormState } from './acciones'

const CAMPO =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none placeholder:text-fg-faint focus:border-white/20'

export function FormularioCorreo() {
  const [state, action] = useActionState<FormState, FormData>(pedirCodigo, {})
  if (state.ok && state.correo) return <FormularioCodigo correo={state.correo} />
  return (
    <form action={action} className="mt-6 space-y-3">
      <label htmlFor="correo" className="sr-only">Correo</label>
      <input id="correo" name="correo" type="email" autoFocus autoComplete="email" inputMode="email" placeholder="tu@correo.cl" className={CAMPO} />
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      <Submit pendingLabel="Enviando…" className="surface surface-hover w-full px-4 py-2.5">Mandarme un código</Submit>
    </form>
  )
}

export function FormularioCodigo({ correo }: { correo: string }) {
  const [state, action] = useActionState<FormState, FormData>(canjearCodigo, {})
  return (
    <form action={action} className="mt-6 space-y-3">
      <p className="text-sm text-fg-muted">Si {correo} está invitado, te llegó un código de seis dígitos. Vale diez minutos.</p>
      <input type="hidden" name="correo" value={correo} />
      <label htmlFor="codigo" className="sr-only">Código</label>
      <input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus placeholder="000000" className={`${CAMPO} tracking-[0.4em]`} />
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      <Submit pendingLabel="Entrando…" className="surface surface-hover w-full px-4 py-2.5">Entrar</Submit>
      <a href="/ingresar" className="block text-center text-xs text-fg-faint hover:text-fg">Usar otro correo</a>
    </form>
  )
}
```

`src/app/ingresar/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { FormularioCorreo } from './formularios'

export const metadata = { title: 'Entrar', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function IngresarPage() {
  if (await usuarioActual()) redirect('/admin')
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="aurora" aria-hidden><span /></div>
      <div className="surface w-full max-w-sm rounded-3xl p-8">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Parrilla</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">Entra con tu correo</h1>
        <FormularioCorreo />
      </div>
    </main>
  )
}
```

`src/app/ingresar/codigo/page.tsx` (para volver con el correo en la URL, `?correo=`):

```tsx
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { normalizarCorreo } from '@/lib/ingreso'
import { FormularioCodigo } from '../formularios'

export const metadata = { title: 'Código', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CodigoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await usuarioActual()) redirect('/admin')
  const correo = normalizarCorreo(String((await searchParams).correo ?? ''))
  if (!correo) redirect('/ingresar')
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="aurora" aria-hidden><span /></div>
      <div className="surface w-full max-w-sm rounded-3xl p-8">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Parrilla</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">Tu código</h1>
        <FormularioCodigo correo={correo} />
      </div>
    </main>
  )
}
```

Borra `yaDentro` de `acciones.ts` si no la usas (las páginas usan `usuarioActual` directo).

- [ ] **Step 3: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: sin errores salvo los dos de móvil pendientes.

```bash
git add src/app/ingresar
git commit -m "Abre /ingresar: un código de seis dígitos al correo invitado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 5: Invitaciones (solo admin)

**Files:**
- Create: `src/app/admin/(dash)/usuarios/page.tsx`, `src/app/admin/(dash)/usuarios/formularios.tsx`
- Modify: `src/app/admin/actions.ts` (dos acciones nuevas), `src/app/admin/(dash)/nav.tsx`

- [ ] **Step 1: Acciones**

En `actions.ts`, sección nueva `/* --- usuarios -- */` al final:

```ts
export async function invitarUsuario(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin()
  const resultado = await invitar(String(formData.get('correo') ?? ''), String(formData.get('nombre') ?? '') || null)
  if ('error' in resultado) return { error: resultado.error }
  // El primer código sale con la invitación: el invitado entra sin pedir nada.
  const fd = new FormData()
  fd.set('correo', resultado.usuario.correo)
  await pedirCodigo({}, fd)
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function quitarUsuario(id: string): Promise<{ error?: string }> {
  await requireAdmin()
  const resultado = await quitar(id)
  revalidatePath('/admin/usuarios')
  return 'error' in resultado ? { error: resultado.error } : {}
}
```

Imports: `requireAdmin` de `@/lib/auth`, `invitar`, `quitar` de `@/lib/usuarios`, `pedirCodigo` de `@/app/ingresar/acciones`.

- [ ] **Step 2: Página y formularios**

`src/app/admin/(dash)/usuarios/page.tsx`:

```tsx
import { Panel } from '@/components/charts/panel'
import { requireAdmin } from '@/lib/auth'
import { listarUsuarios } from '@/lib/usuarios'
import { FormularioInvitar, BotonQuitar } from './formularios'

export const dynamic = 'force-dynamic'

const FECHA = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })

export default async function UsuariosPage() {
  await requireAdmin()
  const usuarios = await listarUsuarios()
  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Usuarios</h1>
        <p className="mt-1 text-sm text-fg-muted">Quién puede entrar a Parrilla. Invitar manda el primer código al correo.</p>
      </header>
      <Panel title="Invitar" className="mb-6">
        <FormularioInvitar />
      </Panel>
      <Panel title="Invitados">
        <ul className="divide-y divide-white/[0.06]">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.nombre ? `${u.nombre} · ` : ''}{u.correo}</span>
              <span className="text-xs text-fg-faint">{u.rol === 'admin' ? 'admin' : u.primerIngresoEn ? `entró ${FECHA.format(u.primerIngresoEn)}` : `invitado ${FECHA.format(u.invitadoEn)}`}</span>
              {u.rol !== 'admin' && !u.primerIngresoEn ? <BotonQuitar id={u.id} /> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
```

`src/app/admin/(dash)/usuarios/formularios.tsx`:

```tsx
'use client'

import { useActionState, useState, useTransition } from 'react'
import { invitarUsuario, quitarUsuario, type FormState } from '@/app/admin/actions'
import { Button, Field, Input, Submit } from '@/components/ui'

export function FormularioInvitar() {
  const [state, action] = useActionState<FormState, FormData>(invitarUsuario, {})
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Correo"><Input name="correo" type="email" required className="min-w-[16rem]" /></Field>
      <Field label="Nombre (opcional)"><Input name="nombre" className="min-w-[12rem]" /></Field>
      <Submit pendingLabel="Invitando…">Invitar</Submit>
      {state.error ? <p role="alert" className="text-sm text-negative">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-positive">Invitado. Le llegó su primer código.</p> : null}
    </form>
  )
}

export function BotonQuitar({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button variant="ghost" disabled={pending} onClick={() => { if (!confirm('¿Quitar la invitación?')) return; start(async () => { const r = await quitarUsuario(id); setError(r.error ?? null) }) }}>
        Quitar
      </Button>
      {error ? <span role="alert" className="text-xs text-negative">{error}</span> : null}
    </>
  )
}
```

`nav.tsx`: la prop `esAdmin` (agregada en la Task 3) agrega al final de `TABS` `{ href: '/admin/usuarios', label: 'Usuarios' }` solo cuando es true (construye la lista dentro del componente).

- [ ] **Step 3: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck` (solo los dos errores de móvil pendientes).

```bash
git add "src/app/admin/(dash)/usuarios/page.tsx" "src/app/admin/(dash)/usuarios/formularios.tsx" src/app/admin/actions.ts "src/app/admin/(dash)/nav.tsx"
git commit -m "Deja al admin invitar y quitar usuarios desde el panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 6: La sesión móvil, doble

**Files:**
- Modify: `src/app/api/mobile/session/route.ts`
- Create: `src/app/api/mobile/session/codigo/route.ts`
- Create: `src/lib/mobile-guardia.ts`
- Modify: `src/lib/mobile-api.ts` (borra `requireMobile` y el import de `mobileTokenIsValid`) y las 7 rutas que lo llaman (`mobile/upload-url`, `mobile/schedule` ×2, `mobile/schedule/check`, `mobile/posts`, `mobile/overview`, `mobile/accounts`)
- Modify: `src/lib/usuarios.ts`, `src/app/ingresar/acciones.ts` (extraer `pedir` y `canjear`)

**Interfaces:**
- Produces: `requireMobileUser(request): Promise<Usuario | null>` en `src/lib/mobile-guardia.ts`; `pedir(correo: string): Promise<void>` y `canjear(correo: string, codigo: string): Promise<{ usuario: Usuario } | { error: string }>` en `src/lib/usuarios.ts`; `POST /api/mobile/session` acepta `{ password }` o `{ correo, codigo }`; `POST /api/mobile/session/codigo` acepta `{ correo }` y responde siempre `{ ok: true }`.

- [ ] **Step 1: El guardián**

`mobile-api.ts` lo importa `mobile-api.test.ts` en Vitest, y `usuarios.ts` lleva `server-only` (que revienta fuera de Next). Por eso el guardián vive en un archivo nuevo, `src/lib/mobile-guardia.ts`:

```ts
import 'server-only'
import type { Usuario } from '@/db'
import { leerTokenMovil } from './mobile-token'
import { buscarPorId } from './usuarios'

/**
 * El molde del resto del repo: sin cabecera válida, nadie pasa. Devuelve al usuario del
 * token y lo relee de la base: si subió su versión de sesión o fue quitado, el token muere.
 * Vive aparte de mobile-api.ts porque aquel lo importan tests y este trae `server-only`.
 */
export async function requireMobileUser(request: Request): Promise<Usuario | null> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const claims = await leerTokenMovil(header.slice('Bearer '.length))
  if (!claims) return null
  const usuario = await buscarPorId(claims.sub)
  if (!usuario || usuario.sesionVersion !== claims.sv) return null
  return usuario
}
```

En `mobile-api.ts` borra `requireMobile` y el import de `mobileTokenIsValid`. En cada una de las 7 rutas cambia el import a `import { requireMobileUser } from '@/lib/mobile-guardia'` y la guarda a `if (!(await requireMobileUser(request))) …` conservando exactamente el cuerpo y el estado de la respuesta que ya devolvían con `requireMobile`.

- [ ] **Step 2: La sesión**

`src/app/api/mobile/session/route.ts`, reemplazando el cuerpo del `POST` tras el `rateLimited`:

```ts
  let body: { password?: unknown; correo?: unknown; codigo?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 })
  }

  // Camino de transición: la app instalada manda la contraseña del panel y entra como el admin.
  if (typeof body.password === 'string') {
    if (!passwordMatches(body.password)) return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
    const admin = await asegurarAdmin()
    return NextResponse.json({ token: await mintMobileToken({ sub: admin.id, sv: admin.sesionVersion }) })
  }

  const correo = normalizarCorreo(typeof body.correo === 'string' ? body.correo : '')
  const codigo = typeof body.codigo === 'string' ? body.codigo.replace(/\D/g, '') : ''
  if (!correo || !codigo) return NextResponse.json({ error: 'Faltan el correo o el código.' }, { status: 400 })
  const resultado = await canjearCodigoMovil(correo, codigo)
  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: 401 })
  return NextResponse.json({ token: await mintMobileToken({ sub: resultado.usuario.id, sv: resultado.usuario.sesionVersion }) })
```

Para no duplicar la lógica de canje, extrae de `src/app/ingresar/acciones.ts` la parte que valida y consume el código a una función en `src/lib/usuarios.ts`: `canjear(correo, codigo): Promise<{ usuario: Usuario } | { error: string }>` (todo lo de `canjearCodigo` menos `createSession` y `redirect`), y haz que la acción web la llame y luego cree la sesión. `canjearCodigoMovil` es esa misma `canjear`. Igual con `pedirCodigo`: extrae `pedir(correo): Promise<void>` (asegurar admin, buscar, tope, invalidar, insertar, enviar) y que la acción web la llame.

`src/app/api/mobile/session/codigo/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { normalizarCorreo } from '@/lib/ingreso'
import { pedir } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

/** Siempre { ok: true }: la lista de invitados no se revela por la respuesta. */
export async function POST(request: Request) {
  let correo: string | null = null
  try {
    const body = await request.json()
    correo = normalizarCorreo(typeof body.correo === 'string' ? body.correo : '')
  } catch {
    // Cuerpo ilegible: misma respuesta neutra.
  }
  if (correo) await pedir(correo)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Verifica y commit**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/mobile-api.test.ts src/lib/mobile-token.test.ts`
Expected: **cero** errores de typecheck ya; tests PASS.

```bash
git add src/lib/mobile-guardia.ts src/lib/mobile-api.ts src/lib/usuarios.ts src/app/ingresar/acciones.ts src/app/api/mobile/session/route.ts src/app/api/mobile/session/codigo/route.ts src/app/api/mobile/upload-url/route.ts src/app/api/mobile/schedule/route.ts src/app/api/mobile/schedule/check/route.ts src/app/api/mobile/posts/route.ts src/app/api/mobile/overview/route.ts src/app/api/mobile/accounts/route.ts
git commit -m "Acepta en la sesión móvil la contraseña del dueño y el correo con código

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 7: Docs y cierre

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: README**

- En la sección de setup donde se explica `ADMIN_PASSWORD`, agrega `ADMIN_EMAIL` («el correo del primer usuario; con él entras a `/ingresar`») e `INGRESO_FROM` («remitente de los códigos, `Parrilla <ingreso@tu-parrilla.cl>` con el dominio verificado en Resend; sin ella se usa el remitente de prueba de Resend, que solo entrega al correo del dueño»).
- Donde se explique cómo entrar al panel (`/admin/login`), reemplaza por: «Entra en `/ingresar` con tu correo: te llega un código de seis dígitos que vale diez minutos. Solo entran los correos invitados desde Usuarios (pestaña visible para el admin). La contraseña `ADMIN_PASSWORD` sigue valiendo únicamente para la app del teléfono, hasta que la app adopte el ingreso por correo.»
- Tabla de variables: filas para `ADMIN_EMAIL` (obligatoria) e `INGRESO_FROM` (opcional).

- [ ] **Step 2: `.env.example`**

Junto a `ADMIN_PASSWORD`: `ADMIN_EMAIL=` con el comentario `# El correo del primer usuario (admin): con él entras a /ingresar.` y `INGRESO_FROM=` con `# Remitente de los códigos, p. ej. "Parrilla <ingreso@tu-parrilla.cl>" (dominio verificado en Resend).`

- [ ] **Step 3: Verificación completa y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde.

```bash
git add README.md .env.example
git commit -m "Documenta el ingreso por correo y las variables del primer usuario

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

### Cierre (controlador)

1. Confirmar que `ADMIN_EMAIL` e `INGRESO_FROM` existen en Vercel (Production y Preview) y que `RESEND_API_KEY` sigue.
2. PR a `main`; el preview migra su rama de Neon (`0001`) y construye; en el preview, `/ingresar` con el correo del admin debe mandar un código.
3. Merge; producción migra `0001`. Prueba manual: entrar por código en la web; el teléfono sigue entrando con la contraseña (pedirá la contraseña una vez porque el token viejo ya no vale).
