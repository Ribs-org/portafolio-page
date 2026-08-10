import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { desc, sql } from 'drizzle-orm'
import { clicks, visits } from '../src/db/schema'

/** Prints the most recent visit and click so tracking can be checked end to end. */
async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema: { visits, clicks } })

  const [visit] = await db.select().from(visits).orderBy(desc(visits.createdAt)).limit(1)
  console.log('--- última visita ---')
  console.log(
    visit
      ? {
          id: visit.id,
          campaign: visit.campaign,
          network: visit.referrerNetwork,
          country: visit.country,
          device: visit.deviceType,
          os: visit.os,
          browser: visit.browser,
          language: visit.language,
          isBot: visit.isBot,
          hash: visit.visitorHash.slice(0, 12) + '…',
        }
      : 'ninguna',
  )

  const [click] = await db.select().from(clicks).orderBy(desc(clicks.createdAt)).limit(1)
  console.log('--- último click ---')
  console.log(click ? { id: click.id, visitId: click.visitId, linkId: click.linkId, msOnPage: click.msOnPage } : 'ninguno')

  const [counts] = await db
    .select({
      visits: sql<number>`(select count(*) from visits)`.mapWith(Number),
      clicks: sql<number>`(select count(*) from clicks)`.mapWith(Number),
      uniques: sql<number>`(select count(distinct visitor_hash) from visits)`.mapWith(Number),
    })
    .from(visits)
    .limit(1)
  console.log('--- totales ---', counts)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
