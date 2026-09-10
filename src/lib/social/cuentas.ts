// La consulta que resuelve red → cuenta mientras el resto del sistema sigue hablando
// en redes. Sin `server-only`: `crear.ts` lo importa y `actions.ts` ya es server.
import { asc, inArray } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { SIN_CUENTA, primariaDe } from './cuenta'

export class SinCuenta extends Error {
  constructor(public readonly network: string) {
    super(SIN_CUENTA(network))
  }
}

/**
 * Red → id de su cuenta primaria (la más antigua), para las redes pedidas. Una red sin
 * fila no aparece: quien escribe decide qué frase dar. Hasta que la entrega 3 traiga
 * `destinos`, «la cuenta de facebook» es esta.
 */
export async function cuentasPrimarias(networks: string[]): Promise<Map<string, string>> {
  if (networks.length === 0) return new Map()
  const filas = await getDb()
    .select({ id: socialAccounts.id, network: socialAccounts.network, createdAt: socialAccounts.createdAt })
    .from(socialAccounts)
    .where(inArray(socialAccounts.network, networks))
    .orderBy(asc(socialAccounts.createdAt))
  const porRed = new Map<string, Array<{ id: string; createdAt: Date }>>()
  for (const fila of filas) porRed.set(fila.network, [...(porRed.get(fila.network) ?? []), fila])
  const resultado = new Map<string, string>()
  for (const [network, cuentas] of porRed) {
    const id = primariaDe(cuentas)
    if (id) resultado.set(network, id)
  }
  return resultado
}

/** Como `cuentasPrimarias`, pero lanza `SinCuenta` a la primera red sin cuenta. */
export async function exigirCuentas(networks: string[]): Promise<Map<string, string>> {
  const cuentas = await cuentasPrimarias(networks)
  for (const network of networks) {
    if (!cuentas.has(network)) throw new SinCuenta(network)
  }
  return cuentas
}
