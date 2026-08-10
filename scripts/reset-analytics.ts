import { neon } from '@neondatabase/serverless'

/**
 * Deletes every visit and click. Profiles and links are untouched.
 * Use after testing, or to start counting from a clean slate.
 */
async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  const [before] = await sql`select
    (select count(*) from visits)::int as visits,
    (select count(*) from clicks)::int as clicks`

  await sql`delete from clicks`
  await sql`delete from visits`

  console.log(`Borradas ${before.visits} visitas y ${before.clicks} clicks.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
