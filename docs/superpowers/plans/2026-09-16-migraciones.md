# Migraciones versionadas y automáticas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el esquema cambie por archivos de migración commiteados, que el build de Vercel los aplique solo, que el CI detecte un esquema sin migración, y que producción quede registrada como punto de partida sin recrear nada.

**Architecture:** Lo puro en `src/lib/migraciones.ts` (decidir si migrar; elegir la fila de baseline) con tests; dos scripts finos en `scripts/` que lo usan con `drizzle-orm/neon-http/migrator`; `vercel.json` con `buildCommand`; un paso de CI sin base; README.

**Tech Stack:** drizzle-kit 0.31 (`generate`), drizzle-orm 0.45 (`migrate`, `readMigrationFiles`), `@neondatabase/serverless`, tsx, Vercel `buildCommand`.

**Spec:** `docs/superpowers/specs/2026-09-16-migraciones-design.md`.

Rama: `migraciones`, nacida de `main` (`9067b86`) con la spec commiteada.

## Global Constraints

- `decidirMigracion` salta sin `DATABASE_URL` y en `preview` sin `MIGRAR_PREVIEWS=1`; migra en todo lo demás. Mensajes: `'sin DATABASE_URL: build sin base, como el CI'` y `'preview sin rama de Neon propia (MIGRAR_PREVIEWS no es 1)'`.
- El baseline nunca ejecuta SQL de migración: solo inserta la fila `(hash, created_at)` de la primera migración cuando la base ya tiene `profiles` y la tabla de migraciones está vacía.
- `db:push` desaparece de `package.json` y del README; `db:setup` = `db:migrate:local` + `db:seed`.
- Mensaje del CI: `El esquema cambió sin migración: corre npm run db:generate y commitea drizzle/`.
- Comentarios solo para restricciones que el código no puede mostrar. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Git: HEAD verificado antes de empezar (`git log --oneline -1` muestra `9067b86` o un commit de este plan), jamás checkout/reset/rebase/stash, `git add` por archivo.
- **Ninguna migración ni baseline se ejecuta contra ninguna base durante estas tareas**; el controlador corre el baseline al cerrar.

---

### Task 1: Lo puro y sus tests

**Files:**
- Create: `src/lib/migraciones.ts`
- Test: `src/lib/migraciones.test.ts`

**Interfaces:**
- Produces: `decidirMigracion(env: { databaseUrl?: string; vercelEnv?: string; migrarPreviews?: string }): { accion: 'migrar' } | { accion: 'saltar'; motivo: string }`; `filaBaseline(migraciones: Array<{ hash: string; folderMillis: number }>): { hash: string; folderMillis: number }`; `SIN_MIGRACIONES = 'No hay migraciones en drizzle/: corre npm run db:generate primero.'`.

- [ ] **Step 1: Test que falla**

`src/lib/migraciones.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SIN_MIGRACIONES, decidirMigracion, filaBaseline } from './migraciones'

describe('decidirMigracion', () => {
  it('sin DATABASE_URL se salta: es el build del CI', () => {
    expect(decidirMigracion({})).toEqual({ accion: 'saltar', motivo: 'sin DATABASE_URL: build sin base, como el CI' })
    expect(decidirMigracion({ databaseUrl: '', vercelEnv: 'production' })).toMatchObject({ accion: 'saltar' })
  })

  it('un preview solo migra con la bandera encendida', () => {
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'preview' })).toEqual({
      accion: 'saltar',
      motivo: 'preview sin rama de Neon propia (MIGRAR_PREVIEWS no es 1)',
    })
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'preview', migrarPreviews: '1' })).toEqual({ accion: 'migrar' })
  })

  it('producción, development y local migran', () => {
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'production' })).toEqual({ accion: 'migrar' })
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'development' })).toEqual({ accion: 'migrar' })
    expect(decidirMigracion({ databaseUrl: 'postgres://x' })).toEqual({ accion: 'migrar' })
  })
})

describe('filaBaseline', () => {
  it('es la primera migración por marca de tiempo', () => {
    expect(
      filaBaseline([
        { hash: 'b', folderMillis: 200 },
        { hash: 'a', folderMillis: 100 },
      ]),
    ).toEqual({ hash: 'a', folderMillis: 100 })
  })

  it('sin migraciones lanza con la frase', () => {
    expect(() => filaBaseline([])).toThrow(SIN_MIGRACIONES)
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/migraciones.test.ts`
Expected: FAIL, import sin resolver.

- [ ] **Step 3: Implementa**

`src/lib/migraciones.ts`:

```ts
// Las dos decisiones de los scripts de migración, puras para poder probarlas: si el build
// debe migrar, y qué fila registra el baseline. Los scripts en scripts/ solo las llaman.

export const SIN_MIGRACIONES = 'No hay migraciones en drizzle/: corre npm run db:generate primero.'

export type Decision = { accion: 'migrar' } | { accion: 'saltar'; motivo: string }

/**
 * El build del CI no tiene base y no debe fallar por eso. Un preview tampoco migra salvo
 * que la integración de Neon le haya dado su propia rama: hasta entonces tocaría
 * producción. Todo lo demás (producción, development, la máquina del dueño) migra.
 */
export function decidirMigracion(env: {
  databaseUrl?: string
  vercelEnv?: string
  migrarPreviews?: string
}): Decision {
  if (!env.databaseUrl) return { accion: 'saltar', motivo: 'sin DATABASE_URL: build sin base, como el CI' }
  if (env.vercelEnv === 'preview' && env.migrarPreviews !== '1') {
    return { accion: 'saltar', motivo: 'preview sin rama de Neon propia (MIGRAR_PREVIEWS no es 1)' }
  }
  return { accion: 'migrar' }
}

/**
 * Drizzle solo compara la marca de tiempo de la última migración registrada: registrar la
 * primera como aplicada deja a `migrate` aplicando únicamente las siguientes.
 */
export function filaBaseline(
  migraciones: Array<{ hash: string; folderMillis: number }>,
): { hash: string; folderMillis: number } {
  if (migraciones.length === 0) throw new Error(SIN_MIGRACIONES)
  const primera = [...migraciones].sort((a, b) => a.folderMillis - b.folderMillis)[0]!
  return { hash: primera.hash, folderMillis: primera.folderMillis }
}
```

- [ ] **Step 4: Corre y commit**

Run: `npx vitest run src/lib/migraciones.test.ts && npm run typecheck`
Expected: PASS, 5 tests.

```bash
git add src/lib/migraciones.ts src/lib/migraciones.test.ts
git commit -m "Decide en código puro cuándo migrar y qué fila registra el baseline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 2: Los scripts, la primera migración y los comandos

**Files:**
- Create: `scripts/migrar.ts`, `scripts/baseline.ts`
- Create (generados): `drizzle/0000_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `decidirMigracion`, `filaBaseline`, `SIN_MIGRACIONES` de `../src/lib/migraciones` (los scripts importan por ruta relativa, como `scripts/seed.ts` importa lo suyo; revisa cómo lo hace y copia el estilo).
- Produces: comandos `db:generate`, `db:migrate`, `db:migrate:local`, `db:baseline`, `db:setup`.

- [ ] **Step 1: `scripts/migrar.ts`**

```ts
// Migra la base antes de construir: lo llama el buildCommand de Vercel y `db:migrate:local`.
// Un fallo lanza y el build cae, que es lo deseado: el código nuevo no se promueve sin su
// esquema.
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
import { decidirMigracion } from '../src/lib/migraciones'

const decision = decidirMigracion({
  databaseUrl: process.env.DATABASE_URL,
  vercelEnv: process.env.VERCEL_ENV,
  migrarPreviews: process.env.MIGRAR_PREVIEWS,
})

if (decision.accion === 'saltar') {
  console.log(`[migraciones] se salta: ${decision.motivo}`)
} else {
  const db = drizzle(neon(process.env.DATABASE_URL!))
  await migrate(db, { migrationsFolder: 'drizzle' })
  console.log('[migraciones] al día')
}
```

- [ ] **Step 2: `scripts/baseline.ts`**

```ts
// Una sola vez, contra una base que ya tiene el esquema (la de producción de hoy): registra
// la primera migración como aplicada sin ejecutarla, para que `migrate` solo aplique las
// siguientes. En una base vacía no hace nada: ahí `db:migrate` crea todo de verdad.
import { neon } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { filaBaseline } from '../src/lib/migraciones'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')

const primera = filaBaseline(readMigrationFiles({ migrationsFolder: 'drizzle' }))
const sql = neon(url)

const [{ existe }] = (await sql`select to_regclass('public.profiles') is not null as existe`) as Array<{ existe: boolean }>
if (!existe) {
  console.log('[baseline] la base está vacía: corre npm run db:migrate:local, no el baseline')
  process.exit(0)
}

await sql`create schema if not exists drizzle`
await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
const [{ n }] = (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`) as Array<{ n: number }>
if (n > 0) {
  console.log(`[baseline] ya hay ${n} migraciones registradas: nada que hacer`)
  process.exit(0)
}

await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${primera.hash}, ${primera.folderMillis})`
console.log(`[baseline] registrada la migración inicial (${primera.folderMillis})`)
```

Si `tsx` se queja del `await` de nivel superior, envuelve el cuerpo en `async function main()` y llama `main().catch((e) => { console.error(e); process.exit(1) })`, igual en `migrar.ts`; mira cómo lo hace `scripts/seed.ts` y sigue ese estilo.

- [ ] **Step 3: Los comandos**

En `package.json`, reemplaza los scripts `db:*` por:

```json
    "db:setup": "npm run db:migrate:local && npm run db:seed",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrar.ts",
    "db:migrate:local": "dotenv -e .env.local -- tsx scripts/migrar.ts",
    "db:baseline": "dotenv -e .env.local -- tsx scripts/baseline.ts",
    "db:studio": "dotenv -e .env.local -- drizzle-kit studio",
    "db:seed": "dotenv -e .env.local -- tsx scripts/seed.ts",
```

(`db:push` desaparece.) `drizzle-kit generate` no conecta: el `process.env.DATABASE_URL!` de `drizzle.config.ts` vale `undefined` y no importa.

- [ ] **Step 4: Genera la primera migración**

Run: `npm run db:generate`
Expected: crea `drizzle/0000_<nombre>.sql`, `drizzle/meta/_journal.json` y `drizzle/meta/0000_snapshot.json`. Abre el `.sql` y confirma que contiene `CREATE TABLE "profiles"`, `"scheduled_post_targets"` con la columna `"opciones"`, `"reglas_clave"`, `"post_comments"` con `"automatico"`, y el índice `scheduled_post_targets_account_external_idx`. Si drizzle-kit pregunta algo por consola en este paso, responde con la opción que crea (no renombra) y anótalo en el reporte.

Comprueba que `.gitignore` no ignora `drizzle/` (hoy solo ignora `.env*`).

- [ ] **Step 5: Verifica sin tocar ninguna base**

Run: `npm run typecheck && npx tsx -e "import('./scripts/migrar.ts')"` con `DATABASE_URL` vacío en el entorno (`env -u DATABASE_URL npx tsx scripts/migrar.ts` en Git Bash).
Expected: imprime `[migraciones] se salta: sin DATABASE_URL: build sin base, como el CI` y sale 0. **No** corras `db:migrate:local` ni `db:baseline`: eso lo hace el controlador al cerrar.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrar.ts scripts/baseline.ts package.json drizzle
git commit -m "Genera la primera migración y los comandos para migrar y fijar el baseline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 3: Vercel, CI y README

**Files:**
- Modify: `vercel.json`, `.github/workflows/ci.yml`, `README.md`, `.env.example`

- [ ] **Step 1: `vercel.json`**

```json
{
  "buildCommand": "npm run db:migrate && next build",
  "crons": [
    { "path": "/api/cron/sync-social", "schedule": "0 9 * * *" },
    { "path": "/api/cron/publish-social", "schedule": "30 9 * * *" }
  ]
}
```

- [ ] **Step 2: CI**

En `.github/workflows/ci.yml`, job `sitio`, después de `- run: npm run lint` y antes del build:

```yaml
      # Sin base: `generate` solo compara el esquema con el snapshot. Si aparece un archivo
      # nuevo es que alguien cambió el esquema y olvidó generar la migración.
      - run: npx drizzle-kit generate
      - run: |
          if [ -n "$(git status --porcelain -- drizzle)" ]; then
            echo "El esquema cambió sin migración: corre npm run db:generate y commitea drizzle/"
            git status --porcelain -- drizzle
            exit 1
          fi
```

- [ ] **Step 3: README**

- En la sección de setup (líneas ~96-104, `npm run db:setup`), el texto sigue valiendo; cambia la frase «Esto es lo único que no se puede hacer desde el navegador» por una que diga que `db:setup` migra y siembra, y que desde ahí el esquema viaja solo con cada despliegue.
- Reemplaza cada «corre `npm run db:push`» de las secciones de features (grep `db:push`) por «la migración se aplica sola al desplegar».
- Agrega una sección nueva antes de «Variables de entorno»:

```markdown
## Cómo cambia el esquema

El esquema vive en `src/db/schema.ts` y cambia por migraciones en `drizzle/`, que van en el
PR y se revisan como código:

1. Edita `src/db/schema.ts`.
2. `npm run db:generate` crea `drizzle/NNNN_*.sql`; commitéalo junto al cambio. El CI falla
   si el esquema cambió y la migración no está.
3. Al desplegar, Vercel corre `npm run db:migrate` antes de construir: si la migración
   falla, el código nuevo no se promueve. Los previews migran contra su propia rama de
   Neon cuando la integración la crea (`MIGRAR_PREVIEWS=1`); hasta entonces se saltan.

**Regla de convivencia:** una migración tiene que convivir con el código anterior mientras
dura el despliegue y ante un rollback instantáneo. Agregar columnas con default o nulables,
tablas e índices, sí. Borrar o renombrar, solo en un PR posterior al que dejó de usarlas.

Una base que ya tenía el esquema antes de las migraciones (producción el 2026-09-16) se
registra una sola vez con `npm run db:baseline`; una base nueva se crea entera con
`db:setup`.
```

- En la tabla de variables de entorno: `| \`MIGRAR_PREVIEWS\` | Que los previews migren su rama de Neon | Solo cuando la integración de Neon crea una rama por preview |`.
- `.env.example`: junto a las otras banderas, `# 1 solo cuando la integración de Neon crea una rama por preview.` y `MIGRAR_PREVIEWS=`.

- [ ] **Step 4: Verifica y commit**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde (el build local no corre `vercel.json`).

```bash
git add vercel.json .github/workflows/ci.yml README.md .env.example
git commit -m "Migra al desplegar en Vercel y exige la migración generada en el CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Cierre (controlador)

1. `npm run db:baseline` contra producción: debe registrar la migración inicial.
2. `npm run db:migrate:local`: debe imprimir «al día» sin aplicar nada.
3. PR a `main`. El preview salta la migración (bandera apagada); el deploy de producción migra cero pendientes y construye.
