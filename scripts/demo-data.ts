import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { inArray, like } from 'drizzle-orm'
import { clicks, links, profiles, visits } from '../src/db/schema'

/**
 * Fills the dashboard with plausible traffic so it can be judged before real
 * visitors arrive.
 *
 *   npm run demo:seed    — insert
 *   npm run demo:clear   — remove every demo row, leaving real traffic untouched
 *
 * Demo visits are tagged with a `demo:` prefix on `visitor_hash`, which is what
 * makes the cleanup exact.
 */
const PREFIX = 'demo:'

const COUNTRIES: Array<[string, string, string, number]> = [
  ['CL', 'RM', 'Santiago', 44],
  ['MX', 'CMX', 'Ciudad de México', 14],
  ['AR', 'C', 'Buenos Aires', 9],
  ['ES', 'MD', 'Madrid', 7],
  ['CO', 'DC', 'Bogotá', 6],
  ['US', 'CA', 'Los Angeles', 6],
  ['PE', 'LIM', 'Lima', 5],
  ['BR', 'SP', 'São Paulo', 4],
  ['UY', 'MO', 'Montevideo', 3],
  ['EC', 'P', 'Quito', 2],
]

const NETWORKS: Array<[string, number]> = [
  ['instagram', 42],
  ['tiktok', 26],
  ['direct', 14],
  ['x', 6],
  ['linkedin', 5],
  ['youtube', 4],
  ['whatsapp', 3],
]

const CAMPAIGNS: Array<[string | null, number]> = [
  ['reel-rutina', 16],
  ['reel-setup', 13],
  ['tiktok-antes-despues', 11],
  ['reel-preguntas', 8],
  ['bio-linkedin', 6],
  ['story-lanzamiento', 5],
  [null, 41],
]

const DEVICES: Array<[string, string, string, number]> = [
  ['mobile', 'iOS', 'Mobile Safari', 46],
  ['mobile', 'Android', 'Chrome', 31],
  ['desktop', 'Windows', 'Chrome', 12],
  ['desktop', 'macOS', 'Safari', 6],
  ['desktop', 'macOS', 'Chrome', 4],
  ['tablet', 'iOS', 'Mobile Safari', 1],
]

const LANGUAGES: Array<[string, number]> = [
  ['es-CL', 48],
  ['es-419', 18],
  ['es-ES', 12],
  ['es-MX', 10],
  ['en-US', 9],
  ['pt-BR', 3],
]

/** Deterministic PRNG so repeated runs produce the same shape. */
let state = 1337
function random(): number {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}

function weighted<T>(options: Array<[T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [value, weight] of options) {
    roll -= weight
    if (roll <= 0) return value
  }
  return options[0]![0]
}

function db() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema: { profiles, links, visits, clicks } })
}

async function clear() {
  const database = db()
  const demoVisits = await database
    .select({ id: visits.id })
    .from(visits)
    .where(like(visits.visitorHash, `${PREFIX}%`))

  // Clicks carry no foreign key to visits, so they are removed by id set.
  for (const batch of chunk(demoVisits.map((v) => v.id), 200)) {
    if (batch.length === 0) continue
    await database.delete(clicks).where(inArray(clicks.visitId, batch))
  }
  await database.delete(visits).where(like(visits.visitorHash, `${PREFIX}%`))

  console.log(`Borradas ${demoVisits.length} visitas de demo y sus clicks.`)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function seed() {
  const database = db()
  const allProfiles = await database.select().from(profiles)
  if (allProfiles.length === 0) throw new Error('No hay perfiles. Corre npm run db:seed primero.')

  const allLinks = await database.select().from(links)
  const now = Date.now()
  const DAYS = 30

  const visitRows: Array<typeof visits.$inferInsert> = []
  const clickRows: Array<typeof clicks.$inferInsert> = []

  for (let day = DAYS - 1; day >= 0; day--) {
    // A gentle upward trend with a weekend dip and two content spikes.
    const weekday = new Date(now - day * 864e5).getUTCDay()
    const weekend = weekday === 0 || weekday === 6 ? 0.7 : 1
    const spike = day === 6 || day === 17 ? 2.6 : 1
    const trend = 1 + (DAYS - day) / DAYS
    const count = Math.round((14 + random() * 10) * weekend * spike * trend)

    for (let i = 0; i < count; i++) {
      const profile =
        allProfiles.find((p) => p.isDefault) && random() < 0.86
          ? allProfiles.find((p) => p.isDefault)!
          : allProfiles[Math.floor(random() * allProfiles.length)]!

      // Traffic clusters around midday and late evening.
      const hour = random() < 0.55 ? 11 + Math.floor(random() * 5) : 19 + Math.floor(random() * 5)
      const at = new Date(now - day * 864e5)
      at.setUTCHours(hour, Math.floor(random() * 60), Math.floor(random() * 60), 0)

      const [country, region, city] = weighted(
        COUNTRIES.map(([c, r, ci, w]) => [[c, r, ci] as const, w] as [readonly [string, string, string], number]),
      )
      const [deviceType, os, browser] = weighted(
        DEVICES.map(([d, o, b, w]) => [[d, o, b] as const, w] as [readonly [string, string, string], number]),
      )
      const network = weighted(NETWORKS)
      const campaign = network === 'direct' ? null : weighted(CAMPAIGNS)

      const id = crypto.randomUUID()
      visitRows.push({
        id,
        profileId: profile.id,
        createdAt: at,
        visitorHash: `${PREFIX}${Math.floor(random() * 900)}`,
        country,
        region,
        city,
        timezone: 'America/Santiago',
        deviceType,
        os,
        browser,
        referrer: network === 'direct' ? null : `https://${network}.com/`,
        referrerNetwork: network,
        campaign,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        language: weighted(LANGUAGES),
        isBot: random() < 0.04,
      })

      const profileLinks = allLinks.filter((l) => l.profileId === profile.id)
      if (profileLinks.length === 0) continue

      // Roughly a third of visits click, and a few click more than once.
      const howMany = random() < 0.34 ? (random() < 0.18 ? 2 : 1) : 0
      for (let c = 0; c < howMany; c++) {
        const link = profileLinks[Math.floor(random() * profileLinks.length)]!
        clickRows.push({
          visitId: id,
          linkId: link.id,
          profileId: profile.id,
          createdAt: new Date(at.getTime() + 3000 + random() * 40000),
          msOnPage: Math.round(2000 + random() * 30000),
          position: link.position,
          isBot: false,
        })
      }
    }
  }

  for (const batch of chunk(visitRows, 250)) await database.insert(visits).values(batch)
  for (const batch of chunk(clickRows, 250)) await database.insert(clicks).values(batch)

  console.log(`Insertadas ${visitRows.length} visitas y ${clickRows.length} clicks de demo.`)
  console.log('Para borrarlas: npm run demo:clear')
}

const mode = process.argv[2]
const run = mode === 'clear' ? clear : seed
run().catch((error) => {
  console.error(error)
  process.exit(1)
})
