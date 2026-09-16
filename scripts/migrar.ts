// Migra la base antes de construir: lo llama el buildCommand de Vercel y `db:migrate:local`.
// Un fallo lanza y el build cae, que es lo deseado: el código nuevo no se promueve sin su
// esquema.
import { neon } from '@neondatabase/serverless'
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
    const db = drizzle(neon(process.env.DATABASE_URL!))
    await migrate(db, { migrationsFolder: 'drizzle' })
    console.log('[migraciones] al día')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
