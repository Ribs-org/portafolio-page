// Migra la base antes de construir: lo llama el buildCommand de Vercel y `db:migrate:local`.
// Un fallo lanza y el build cae, que es lo deseado: el código nuevo no se promueve sin su
// esquema.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'
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
    const sql = neon(process.env.DATABASE_URL!)
    const db = drizzle(sql)
    await migrate(db, { migrationsFolder: 'drizzle' })
    console.log('[migraciones] al día')
    try {
      await adoptarHuerfanas(sql)
    } catch (error) {
      console.error('[migraciones] no se pudo adoptar filas huérfanas:', error)
    }
  }
}

/**
 * Adopta a nombre del admin toda fila que venga de antes de que existieran los dueños.
 * No puede vivir en el SQL de la migración porque ADMIN_EMAIL es una variable de entorno,
 * y no puede esperar a que alguien entre al panel: la entrega 3 pone la columna NOT NULL.
 * Idempotente: en un despliegue sin huérfanas no escribe nada.
 */
const CON_DUENO = ['profiles', 'social_accounts', 'scheduled_posts', 'source_authors', 'social_posts', 'ajustes']

async function adoptarHuerfanas(sql: NeonQueryFunction<false, false>): Promise<void> {
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
