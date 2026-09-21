// Una sola vez, contra una base que ya tiene el esquema (la de producción de hoy): registra
// la primera migración como aplicada sin ejecutarla, para que `migrate` solo aplique las
// siguientes. En una base vacía no hace nada: ahí `db:migrate` crea todo de verdad.
import { readMigrationFiles } from 'drizzle-orm/migrator'
import postgres from 'postgres'
import { filaBaseline } from '../src/lib/migraciones'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')

  const primera = filaBaseline(readMigrationFiles({ migrationsFolder: 'drizzle' }))
  // Directa y de a una: esto crea esquema y tabla, y el pooler en modo transacción no es
  // el lugar para DDL.
  const sql = postgres(url, { max: 1 })

  try {
    const [{ existe }] = (await sql`select to_regclass('public.profiles') is not null as existe`) as unknown as Array<{
      existe: boolean
    }>
    if (!existe) {
      console.log('[baseline] la base está vacía: corre npm run db:migrate:local, no el baseline')
      return
    }

    await sql`create schema if not exists drizzle`
    await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`
    const [{ n }] = (await sql`select count(*)::int as n from drizzle.__drizzle_migrations`) as unknown as Array<{ n: number }>
    if (n > 0) {
      console.log(`[baseline] ya hay ${n} migraciones registradas: nada que hacer`)
      return
    }

    await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${primera.hash}, ${primera.folderMillis})`
    console.log(`[baseline] registrada la migración inicial (${primera.folderMillis})`)
  } finally {
    // Las salidas tempranas son `return` y no `process.exit(0)` justamente para pasar por
    // acá: `postgres-js` deja el socket abierto y el script no terminaría solo.
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
