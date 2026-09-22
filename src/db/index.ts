import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Db = ReturnType<typeof create>

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(cliente(url), { schema })
}

/**
 * The pooled connection the request path uses.
 *
 * `prepare: false` is not optional: the pooler runs in transaction mode, so two queries
 * from the same client can land on different backends and a statement prepared by the
 * first is gone by the second. Without this every query past the first fails with
 * "prepared statement does not exist".
 *
 * `idle_timeout` matters because a serverless instance is frozen between requests, not
 * torn down: connections it never closes would sit open against the pooler's limit.
 */
export function cliente(url: string) {
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 })
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
