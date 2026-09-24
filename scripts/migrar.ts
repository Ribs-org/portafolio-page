// Migra la base antes de construir: lo llama el buildCommand de Vercel y `db:migrate:local`.
// Un fallo lanza y el build cae, que es lo deseado: el código nuevo no se promueve sin su
// esquema.
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../src/lib/env'
import { normalizarCorreo } from '../src/lib/ingreso'
import { decidirMigracion } from '../src/lib/migraciones'
import { direccionBase, primeraDireccionLibre } from '../src/lib/slugs'

async function main() {
  const decision = decidirMigracion({
    databaseUrl: process.env.DATABASE_URL,
    vercelEnv: process.env.VERCEL_ENV,
    migrarPreviews: process.env.MIGRAR_PREVIEWS,
  })

  if (decision.accion === 'saltar') {
    console.log(`[migraciones] se salta: ${decision.motivo}`)
  } else {
    // Directa y de una sola conexión, no la del pooler: el modo transacción no sostiene el
    // lock que toma el migrador ni acepta el DDL encadenado, y `max: 1` impide que dos
    // conexiones se peleen ese lock. `env()` de paso le saca el BOM que deja PowerShell.
    const sql = postgres(env('DATABASE_URL_UNPOOLED') ?? process.env.DATABASE_URL!, { max: 1 })
    try {
      const db = drizzle(sql)
      await migrate(db, { migrationsFolder: 'drizzle' })
      console.log('[migraciones] al día')
      await adoptarHuerfanas(sql)
    } finally {
      // `postgres-js` abre un socket de verdad, a diferencia del HTTP sin estado de antes:
      // sin este cierre el proceso nunca termina y el build de Vercel queda colgado
      // esperando a un script que ya hizo todo su trabajo.
      await sql.end()
    }
  }
}

/**
 * Adopta a nombre del admin toda fila que venga de antes de que existieran los dueños.
 * No puede vivir en el SQL de la migración porque ADMIN_EMAIL es una variable de entorno,
 * y no puede esperar a que alguien entre al panel: la entrega 3 pone la columna NOT NULL.
 * Idempotente: en un despliegue sin huérfanas no escribe nada.
 *
 * Si esto falla, el build cae a propósito, igual que sin DATABASE_URL: el código nuevo
 * filtra por dueño, así que promoverlo con filas sin adoptar dejaría el panel en blanco,
 * que parece pérdida de datos.
 */
const CON_DUENO = ['profiles', 'social_accounts', 'scheduled_posts', 'source_authors', 'social_posts', 'ajustes']

/**
 * El error de unicidad de `profiles.slug` (23505), tal como lo manda este cliente: `sql`
 * acá es el driver `postgres` crudo, no Drizzle, así que el error trae `code` y
 * `constraint_name` directos —sin el envoltorio en `cause` que sí hace falta en
 * `lib/usuarios.ts` (`esChoqueDeUnicidad`), donde la consulta pasa por Drizzle—.
 */
function esChoqueDeSlug(error: unknown): boolean {
  const { code, constraint_name } = (error as { code?: string; constraint_name?: string }) ?? {}
  return code === '23505' && constraint_name === 'profiles_slug_unique'
}

export async function adoptarHuerfanas(sql: postgres.Sql): Promise<void> {
  // Misma normalización que usa la app (lib/ingreso.ts), no una a mano: un ADMIN_EMAIL mal
  // formado no debe adoptar filas a nombre de un correo que la app luego rechaza al entrar.
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) {
    throw new Error('ADMIN_EMAIL no está configurada o no es un correo válido: no se pueden adoptar las filas sin dueño')
  }
  const filas = await sql`
    insert into users (correo, rol) values (${correo}, 'admin')
    on conflict (correo) do update set rol = 'admin'
    returning id, nombre`
  const admin = filas[0] as { id: string; nombre: string | null }
  for (const tabla of CON_DUENO) {
    // El nombre de la tabla sale de esta lista literal, nunca de una entrada; el id va como parámetro.
    await sql.unsafe(`update ${tabla} set owner_id = $1 where owner_id is null`, [admin.id])
  }
  console.log('[migraciones] filas sin dueño adoptadas por', correo)

  // Este script corre antes que todo (buildCommand de Vercel: `db:migrate && next build`),
  // así que en una base nueva es quien crea al admin, arriba. Sin esto, esa fila nacería sin
  // página y el invariante «todo usuario tiene exactamente una página» —el que esta entrega
  // introduce— quedaría roto desde el mismo despliegue que lo introduce. Y no es un caso
  // que `asegurarAdmin()` vaya a reparar solo: `adminId()` (lib/usuarios.ts) encuentra la
  // fila que este script ya creó y por eso nunca la llama. En producción no muerde —el admin
  // ya tiene sus páginas—, pero sí en cualquier preview con base nueva. Idempotente, como el
  // resto de esta función: si ya tiene una, no hace nada.
  const [tienePagina] = await sql`select id from profiles where owner_id = ${admin.id} limit 1`
  if (!tienePagina) {
    const base = direccionBase(correo)
    const nombre = admin.nombre?.trim() || base
    const slug = await primeraDireccionLibre(base, async (candidato) => {
      try {
        await sql`
          insert into profiles (owner_id, slug, display_name, is_default, is_published, noindex)
          values (${admin.id}, ${candidato}, ${nombre}, true, true, false)`
        return true
      } catch (error) {
        if (esChoqueDeSlug(error)) return false
        throw error
      }
    })
    console.log('[migraciones] página creada para el admin en', `/${slug}`)
  }
}

// Solo cuando este archivo corre como script (`tsx scripts/migrar.ts`), no cuando algo lo
// importa —como el test de `adoptarHuerfanas`, que necesita el módulo cargado sin que
// `main()` intente conectarse a una base de verdad.
const esScriptPrincipal = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (esScriptPrincipal) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
