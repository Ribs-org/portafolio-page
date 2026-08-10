import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

type Db = ReturnType<typeof create>

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(neon(url), { schema })
}

let cached: Db | null = null

/**
 * Lazily created so `next build` does not crash before the database has been
 * provisioned. Not a Proxy — those break libraries that introspect the client.
 */
export function getDb(): Db {
  if (!cached) cached = create()
  return cached
}

export * from './schema'
