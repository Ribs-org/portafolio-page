// Puro: recibe las filas ya leídas y arma lo que la sección dibuja. La zona no entra
// acá — los `day` ya vienen como fecha local desde la sincronización.
import { periodChange } from './social/delta'

export type AccountMetricRow = {
  network: string
  day: string
  followers: number | null
  profileViews: number | null
  reach: number | null
}

/**
 * Una cuenta no «nace» dentro de una ventana como sí lo hace un post, así que su
 * contador sin lectura previa siempre significa «no lo puedo saber». Esta fecha
 * imposible es lo que le dice eso a `periodChange`, cuyo cuarto argumento existe
 * justamente para distinguir los dos casos.
 */
const LA_CUENTA_YA_EXISTIA = '0000-01-01'

export type AccountCard = {
  network: string
  followers: number | null
  /** Seguidores ganados dentro del período; null cuando no hay lectura previa. */
  followersChange: number | null
  profileViews: number | null
  reach: number | null
}

export function buildAccountCards(
  rows: AccountMetricRow[],
  from: string,
  to: string,
): AccountCard[] {
  const byNetwork = new Map<string, AccountMetricRow[]>()
  for (const row of rows) {
    const list = byNetwork.get(row.network) ?? []
    list.push(row)
    byNetwork.set(row.network, list)
  }

  return [...byNetwork.entries()].map(([network, list]) => {
    const ordered = [...list].sort((a, b) => a.day.localeCompare(b.day))
    const inside = ordered.filter((r) => r.day >= from && r.day <= to)
    const last = inside.at(-1) ?? null

    // El mismo motor que los posts: distingue «creció esto» de «no lo puedo saber».
    const followers = periodChange(
      ordered.map((r) => ({ day: r.day, value: r.followers })),
      from,
      to,
      LA_CUENTA_YA_EXISTIA,
    )

    return {
      network,
      followers: followers.current,
      followersChange: followers.change,
      profileViews: last?.profileViews ?? null,
      reach: last?.reach ?? null,
    }
  })
}
