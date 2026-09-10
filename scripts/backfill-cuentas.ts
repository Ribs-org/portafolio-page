/**
 * Fase 2 de la migración a multicuentas: pone `account_id` en cada fila histórica de
 * posts, métricas de cuenta y destinos, apuntando a la única cuenta que hoy existe en
 * su red. Idempotente: solo toca filas con `account_id` nulo. Se niega si una red
 * tiene más de una cuenta.
 *
 * Uso:
 *   npm run cuentas:backfill
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { accountMetrics, getDb, scheduledPostTargets, socialAccounts, socialPosts } from '../src/db'
import { planBackfill } from '../src/lib/social/cuenta'

async function main() {
  const db = getDb()
  const cuentas = await db.select({ id: socialAccounts.id, network: socialAccounts.network }).from(socialAccounts)
  const plan = planBackfill(cuentas)
  if ('error' in plan) {
    console.error(plan.error)
    process.exit(1)
  }

  for (const [network, accountId] of plan) {
    const [posts, metricas, destinos] = await Promise.all([
      db.update(socialPosts).set({ accountId }).where(and(eq(socialPosts.network, network), isNull(socialPosts.accountId))).returning({ id: socialPosts.id }),
      db.update(accountMetrics).set({ accountId }).where(and(eq(accountMetrics.network, network), isNull(accountMetrics.accountId))).returning({ id: accountMetrics.id }),
      db.update(scheduledPostTargets).set({ accountId }).where(and(eq(scheduledPostTargets.network, network), isNull(scheduledPostTargets.accountId))).returning({ id: scheduledPostTargets.id }),
    ])
    console.log(`${network.padEnd(10)} posts ${posts.length}  métricas ${metricas.length}  destinos ${destinos.length}`)
  }

  const conteo = await db.execute(
    sql`select (select count(*) from social_posts where account_id is null)
      + (select count(*) from account_metrics where account_id is null)
      + (select count(*) from scheduled_post_targets where account_id is null) as n`,
  )
  const sinCuenta = Number((conteo.rows[0] as { n?: string | number } | undefined)?.n ?? 0)
  console.log(`\nFilas sin cuenta: ${sinCuenta} (debe ser 0 antes de la fase 2 del esquema)`)
  if (sinCuenta > 0) process.exit(2)
}

main().catch((error) => {
  console.error(String(error).slice(0, 300))
  process.exit(1)
})
