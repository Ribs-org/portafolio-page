// Lo puro de «qué cuenta es cuál». Sin `server-only`: lo carga también el script de
// backfill, que corre con tsx fuera de Next.

/** La cuenta primaria de una red es la más antigua: la que ya acuñó tags antes de que hubiera otra. */
export function primariaDe(cuentas: Array<{ id: string; createdAt: Date }>): string | null {
  let primaria: { id: string; createdAt: Date } | null = null
  for (const cuenta of cuentas) {
    if (!primaria || cuenta.createdAt.getTime() < primaria.createdAt.getTime()) primaria = cuenta
  }
  return primaria?.id ?? null
}

/** Red → sus cuentas, en el orden de llegada. */
export function agruparPorRed<T extends { network: string }>(cuentas: T[]): Map<string, T[]> {
  const porRed = new Map<string, T[]>()
  for (const cuenta of cuentas) porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta])
  return porRed
}

/**
 * Red → id de cuenta, solo cuando la respuesta es inequívoca. El backfill asigna filas
 * históricas que no dicen de qué cuenta son; con dos cuentas en una red no hay forma
 * de saberlo, y adivinar mezclaría catálogos.
 */
export function planBackfill(
  cuentas: Array<{ id: string; network: string }>,
): Map<string, string> | { error: string } {
  const porRed = new Map<string, string[]>()
  for (const cuenta of cuentas) {
    porRed.set(cuenta.network, [...(porRed.get(cuenta.network) ?? []), cuenta.id])
  }
  const plan = new Map<string, string>()
  for (const [network, ids] of porRed) {
    if (ids.length > 1) {
      return { error: `La red ${network} tiene ${ids.length} cuentas; el backfill necesita exactamente una.` }
    }
    plan.set(network, ids[0]!)
  }
  return plan
}

export function SIN_CUENTA(network: string): string {
  return `No hay una cuenta de ${network} conectada.`
}
