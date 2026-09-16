# Migraciones versionadas y automáticas — que el esquema viaje con el despliegue

Fecha: 2026-09-16
Estado: aprobado, pendiente de plan de implementación

## Problema

El esquema se empuja a mano con `drizzle-kit push` desde una máquina, sin archivos de
migración. Cada entrega que agrega una columna exige recordar el paso antes de promover el
despliegue; si se olvida, el cron y el panel caen al leer una columna que no existe (pasó
el 2026-09-15 con `scheduled_post_targets.opciones`). Los previews de Vercel construyen
contra la misma base que producción, así que un PR con esquema nuevo falla en preview
hasta el merge. Y `push` no sirve en un build: decide solo, pregunta por consola ante
ambigüedades y con `--force` acepta pérdidas de datos sin que nadie las vea.

## Objetivo

Que el esquema cambie por archivos de migración revisables en el PR, que el despliegue de
Vercel los aplique solo antes de construir (en producción y en cada preview con su propia
rama de Neon), que el CI detecte un esquema cambiado sin migración generada, y que la base
de producción actual quede registrada como punto de partida sin recrear nada.

## No objetivos

- **Migraciones de datos** (backfills). Siguen siendo scripts en `scripts/` que se corren
  a propósito, como hasta ahora.
- **Rollback automático de esquema.** La regla de convivencia (abajo) lo hace innecesario
  para el rollback instantáneo de Vercel.
- **Activar la rama de Neon por preview.** Es un clic del dueño en la integración de
  Vercel; el código solo respeta una bandera.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| `drizzle-kit generate` + `drizzle-orm` `migrate` programático en el build | `drizzle-kit push` en el build | `push` es interactivo y decide solo; `migrate` aplica archivos revisados y falla el build si algo no calza |
| Migrar dentro del `buildCommand` de Vercel | Un GitHub Action que migre al fusionar | El despliegue de Vercel es atómico: si la migración falla, el código nuevo no se promueve. Un Action aparte no garantiza el orden con el deploy |
| Previews migran solo con `MIGRAR_PREVIEWS=1` | Migrar siempre en previews | Hasta que exista la rama de Neon por preview, migrar un preview tocaría producción |
| Script de baseline que registra la migración inicial sin ejecutarla | Baseline idempotente con `IF NOT EXISTS` a mano | Drizzle solo compara la marca de tiempo de la última migración registrada; una fila en `drizzle.__drizzle_migrations` basta y el SQL generado queda intacto para bases nuevas |
| CI falla si `generate` produce archivos | Confiar en la revisión | Es el olvido más probable y el detector no necesita base |
| Lo puro en `src/lib/migraciones.ts` | Todo en `scripts/` | vitest solo incluye `src/**`; la decisión de migrar o saltar y la fila de baseline se testean |

## 1. Archivos de migración

`drizzle.config.ts` ya apunta `out: './drizzle'`. `npm run db:generate` (sin dotenv: no
conecta) produce `drizzle/NNNN_nombre.sql` y `drizzle/meta/` (journal y snapshot). Todo se
commitea. La primera, `0000_*`, describe el esquema completo de hoy.

## 2. Migrar en el despliegue

`vercel.json` gana `"buildCommand": "npm run db:migrate && next build"`. `db:migrate` corre
`tsx scripts/migrar.ts`, que:

1. Llama a `decidirMigracion({ databaseUrl, vercelEnv, migrarPreviews })` (puro):
   - sin `databaseUrl` → saltar («sin DATABASE_URL: build sin base, como el CI»);
   - `vercelEnv === 'preview'` y `migrarPreviews !== '1'` → saltar («preview sin rama de
     Neon propia»);
   - en cualquier otro caso → migrar.
2. Si migra: `migrate(drizzle(neon(url)), { migrationsFolder: 'drizzle' })` de
   `drizzle-orm/neon-http/migrator`. Un fallo lanza y el build cae, que es lo deseado.

Localmente, `npm run db:migrate:local` hace lo mismo con `.env.local`. `db:setup` pasa a
ser `db:migrate:local` + `db:seed`. `db:push` desaparece de `package.json` y del README.

## 3. Punto de partida en producción

`npm run db:baseline` (`scripts/baseline.ts`, una sola vez, contra `.env.local`):

1. Lee las migraciones con `readMigrationFiles({ migrationsFolder: 'drizzle' })` y toma la
   primera con `filaBaseline` (puro: exige que exista y devuelve `{ hash, folderMillis }`).
2. Si la base no tiene la tabla `profiles`, no hace nada y dice que corras `db:migrate`.
3. Crea `drizzle.__drizzle_migrations` si falta; si ya tiene filas, no hace nada.
4. Inserta `(hash, created_at = folderMillis)` de la primera migración. Desde ahí
   `migrate` solo aplica las siguientes.

## 4. CI

En `.github/workflows/ci.yml`, job `sitio`, después de `lint`: correr `npx drizzle-kit
generate` y fallar si `git status --porcelain -- drizzle` no está vacío, con el mensaje
«El esquema cambió sin migración: corre npm run db:generate y commitea drizzle/».

## 5. Regla de convivencia

Escrita en el README: una migración debe convivir con el código anterior mientras dure el
despliegue y ante un rollback instantáneo. Agregar columnas con default o nulables, tablas
e índices, sí. Borrar o renombrar solo en un PR posterior al que dejó de usarlas.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `MIGRAR_PREVIEWS` | `1` cuando la integración de Neon crea una rama por preview; hasta entonces los previews no migran |

## Testing

- `migraciones.test.ts`: `decidirMigracion` en los tres casos y con `vercelEnv`
  `production`/`development`/ausente; `filaBaseline` con lista vacía (lanza) y con varias
  (la primera por `folderMillis`).
- Manual, en orden: `db:baseline` contra producción registra una fila; `db:migrate:local`
  no aplica nada; el PR de esta spec construye en preview saltando la migración (bandera
  apagada) y en producción migrando cero pendientes; el primer PR con columna nueva
  después de esto migra solo.

## Trámite del dueño

1. Vercel → Integrations → Neon → activar la rama por preview.
2. Cuando esté, `MIGRAR_PREVIEWS=1` en Vercel (Preview).
