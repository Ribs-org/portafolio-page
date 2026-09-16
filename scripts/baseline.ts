// Una sola vez, contra una base que ya tiene el esquema (la de producción de hoy): registra
// la primera migración como aplicada sin ejecutarla, para que `migrate` solo aplique las
// siguientes. En una base vacía no hace nada: ahí `db:migrate` crea todo de verdad.
import { neon } from '@neondatabase/serverless'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { filaBaseline } from '../src/lib/migraciones'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')

  const primera = filaBaseline(readMigrationFiles({ migrationsFolder: 'drizzle' }))
  const sql = neon(url)

  const [{ existe }] = (await sql`select to_regclass('public.profiles') is not null as existe`) as Array<{
    existe: boolean
  }>
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
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
