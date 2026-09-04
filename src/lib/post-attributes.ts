import 'server-only'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import type { Atributos } from '@/lib/social/publish/atributos'

/**
 * Los atributos con que se programó cada publicación, por `${red}:${externalId}`.
 * Un post orgánico —subido a mano, fuera del calendario— simplemente no aparece.
 */
export async function attributesFor(
  rows: Array<{ network: string; externalId: string }>,
): Promise<Map<string, Atributos | null>> {
  const mapa = new Map<string, Atributos | null>()
  const externalIds = rows.map((row) => row.externalId)
  if (externalIds.length === 0) return mapa

  const programados = await getDb()
    .select({
      network: scheduledPostTargets.network,
      externalId: scheduledPostTargets.externalId,
      atributos: scheduledPosts.atributos,
    })
    .from(scheduledPostTargets)
    .innerJoin(scheduledPosts, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .where(
      and(
        isNotNull(scheduledPostTargets.externalId),
        inArray(scheduledPostTargets.externalId, externalIds),
      ),
    )

  for (const fila of programados) {
    mapa.set(`${fila.network}:${fila.externalId}`, (fila.atributos as Atributos | null) ?? null)
  }
  return mapa
}
