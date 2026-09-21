import postgres from 'postgres'

/**
 * Deletes every visit and click. Profiles and links are untouched.
 * Use after testing, or to start counting from a clean slate.
 */
async function main() {
  const sql = postgres(process.env.DATABASE_URL!)
  try {
    const [before] = await sql`select
      (select count(*) from visits)::int as visits,
      (select count(*) from clicks)::int as clicks`

    await sql`delete from clicks`
    await sql`delete from visits`

    console.log(`Borradas ${before!.visits} visitas y ${before!.clicks} clicks.`)
  } finally {
    // `postgres-js` abre un socket de verdad, a diferencia del HTTP sin estado que había
    // antes: sin este cierre el script imprime su resultado y nunca termina.
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
