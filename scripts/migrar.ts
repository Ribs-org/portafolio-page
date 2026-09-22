// Migra la base antes de construir: lo llama el buildCommand de Vercel y `db:migrate:local`.
// Un fallo lanza y el build cae, que es lo deseado: el código nuevo no se promueve sin su
// esquema.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../src/lib/env'
import { normalizarCorreo } from '../src/lib/ingreso'
import { decidirMigracion } from '../src/lib/migraciones'

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

async function adoptarHuerfanas(sql: postgres.Sql): Promise<void> {
  // Misma normalización que usa la app (lib/ingreso.ts), no una a mano: un ADMIN_EMAIL mal
  // formado no debe adoptar filas a nombre de un correo que la app luego rechaza al entrar.
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) {
    throw new Error('ADMIN_EMAIL no está configurada o no es un correo válido: no se pueden adoptar las filas sin dueño')
  }
  const filas = await sql`
    insert into users (correo, rol) values (${correo}, 'admin')
    on conflict (correo) do update set rol = 'admin'
    returning id`
  const adminId = (filas[0] as { id: string }).id
  for (const tabla of CON_DUENO) {
    // El nombre de la tabla sale de esta lista literal, nunca de una entrada; el id va como parámetro.
    await sql.unsafe(`update ${tabla} set owner_id = $1 where owner_id is null`, [adminId])
  }
  console.log('[migraciones] filas sin dueño adoptadas por', correo)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
