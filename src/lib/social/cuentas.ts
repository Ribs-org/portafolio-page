// La consulta que resuelve red → cuenta mientras el resto del sistema sigue hablando
// en redes. Sin `server-only`: `crear.ts` lo importa y `actions.ts` ya es server.
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { SIN_CUENTA, agruparPorRed, primariaDe } from './cuenta'

/** Lo que no se puede usar como destino: ajena, inexistente o sin credencial. */
export class CuentaInvalida extends Error {}

// Hereda de `CuentaInvalida` para que quien atrapa destinos inválidos no tenga que
// enumerar los motivos: un solo `instanceof CuentaInvalida` cubre también «sin cuenta»,
// y el `instanceof SinCuenta` que ya usan los llamadores existentes sigue funcionando —
// una subclase satisface los dos.
export class SinCuenta extends CuentaInvalida {
  constructor(public readonly network: string) {
    super(SIN_CUENTA(network))
  }
}

/** Una cuenta elegida como destino, ya verificada. */
export type CuentaDestino = { id: string; network: string; handle: string | null }

// Un identificador que no es del dueño y uno que no existe dan la misma frase: si se
// distinguieran, probando identificadores se podría averiguar cuáles son reales.
export const CUENTA_AJENA = 'Una de las cuentas elegidas no es tuya.'

export function CUENTA_DESCONECTADA(handle: string | null, network: string): string {
  return `La cuenta ${handle ?? network} no está conectada. Vuelve a conectarla en Cuentas.`
}

export function RED_AMBIGUA(network: string, handles: Array<string | null>): string {
  const lista = handles.map((h) => h ?? 'sin nombre').join(', ')
  return `Tienes ${handles.length} cuentas de ${network} (${lista}). Elige cuál con «cuentas».`
}

/**
 * Red → id de su cuenta primaria (la más antigua del dueño), para las redes pedidas. Solo
 * cuentas con credencial: una desconectada no puede recibir destinos. Una red sin fila no
 * aparece: quien escribe decide qué frase dar. Hasta que la entrega 3 traiga
 * `destinos`, «la cuenta de facebook» es esta.
 */
export async function cuentasPrimarias(ownerId: string, networks: string[]): Promise<Map<string, string>> {
  if (networks.length === 0) return new Map()
  const filas = await getDb()
    .select({ id: socialAccounts.id, network: socialAccounts.network, createdAt: socialAccounts.createdAt })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.network, networks),
        isNotNull(socialAccounts.accessToken),
        eq(socialAccounts.ownerId, ownerId),
      ),
    )
    .orderBy(asc(socialAccounts.createdAt))
  const porRed = agruparPorRed(filas)
  const resultado = new Map<string, string>()
  for (const [network, cuentas] of porRed) {
    const id = primariaDe(cuentas)
    if (id) resultado.set(network, id)
  }
  return resultado
}

/** Como `cuentasPrimarias`, pero lanza `SinCuenta` a la primera red sin cuenta. */
export async function exigirCuentas(ownerId: string, networks: string[]): Promise<Map<string, string>> {
  const cuentas = await cuentasPrimarias(ownerId, networks)
  for (const network of networks) {
    if (!cuentas.has(network)) throw new SinCuenta(network)
  }
  return cuentas
}

/** Fila cruda de `social_accounts`, lo mínimo que necesita una decisión de verificación. */
type FilaVerificable = { id: string; network: string; handle: string | null; accessToken: string | null }

/**
 * La decisión de `verificarCuentas`, ya sin consulta: qué hacer con las filas que la base
 * trajo (ya acotadas al dueño) para los identificadores pedidos. Separada para poder
 * probarla sin base — ver `cuentas.test.ts` — y para que la consulta se quede como la
 * única parte que necesita el mock de aislamiento.
 */
export function decidirVerificacion(accountIds: string[], filas: FilaVerificable[]): CuentaDestino[] {
  const unicos = [...new Set(accountIds)]
  const porId = new Map(filas.map((f) => [f.id, f]))
  return unicos.map((id) => {
    const fila = porId.get(id)
    if (!fila) throw new CuentaInvalida(CUENTA_AJENA)
    if (!fila.accessToken) throw new CuentaInvalida(CUENTA_DESCONECTADA(fila.handle, fila.network))
    return { id: fila.id, network: fila.network, handle: fila.handle }
  })
}

/**
 * Las cuentas elegidas, verificadas: todas del dueño y todas conectadas. Devuelve en el
 * orden pedido, sin repetir.
 *
 * Es la inversa de la vieja `cuentasPrimarias`: no elige por nadie, comprueba lo que le
 * dieron. Los identificadores llegan del navegador o del teléfono, así que la pertenencia
 * es una comprobación de seguridad, no una cortesía — sin ella se podría programar una
 * publicación en la cuenta de otro mandando su identificador.
 *
 * Una lista vacía no es un error acá: devuelve `[]` sin consultar. Exigir «al menos un
 * destino» le toca a quien llama, no a esta función — un llamador distraído programaría
 * una publicación sin destinos y esta verificación «pasaría».
 */
export async function verificarCuentas(ownerId: string, accountIds: string[]): Promise<CuentaDestino[]> {
  const unicos = [...new Set(accountIds)]
  if (unicos.length === 0) return []
  const filas = await getDb()
    .select({
      id: socialAccounts.id,
      network: socialAccounts.network,
      handle: socialAccounts.handle,
      accessToken: socialAccounts.accessToken,
    })
    .from(socialAccounts)
    .where(and(inArray(socialAccounts.id, unicos), eq(socialAccounts.ownerId, ownerId)))
  return decidirVerificacion(accountIds, filas)
}

/** Fila cruda de `social_accounts`, lo mínimo que necesita una decisión de red única. */
type FilaConectada = { id: string; network: string; handle: string | null }

/**
 * La decisión de `cuentaUnicaPorRed`, ya sin consulta: qué hacer con las filas que la base
 * trajo (ya acotadas al dueño y a las conectadas) para las redes pedidas. Separada para
 * poder probarla sin base — ver `cuentas.test.ts`.
 */
export function decidirCuentaUnica(networks: string[], filas: FilaConectada[]): Map<string, CuentaDestino> {
  const pedidas = [...new Set(networks)]
  const porRed = agruparPorRed(filas)
  const resultado = new Map<string, CuentaDestino>()
  for (const network of pedidas) {
    const cuentas = porRed.get(network) ?? []
    if (cuentas.length === 0) throw new SinCuenta(network)
    if (cuentas.length > 1) throw new CuentaInvalida(RED_AMBIGUA(network, cuentas.map((c) => c.handle)))
    const c = cuentas[0]!
    resultado.set(network, { id: c.id, network: c.network, handle: c.handle })
  }
  return resultado
}

/**
 * Red → su cuenta, **solo cuando la respuesta es inequívoca**. Con dos cuentas en una red
 * no adivina: lanza nombrando las candidatas.
 *
 * Mismo criterio que `planBackfill` en `./cuenta`, por la misma razón: elegir por alguien
 * entre dos cuentas suyas manda su publicación a un sitio que no pidió.
 *
 * Una lista vacía no es un error acá: devuelve un `Map` vacío sin consultar. Exigir «al
 * menos una red» le toca a quien llama, no a esta función.
 */
export async function cuentaUnicaPorRed(
  ownerId: string,
  networks: string[],
): Promise<Map<string, CuentaDestino>> {
  const pedidas = [...new Set(networks)]
  if (pedidas.length === 0) return new Map()
  const filas = await getDb()
    .select({ id: socialAccounts.id, network: socialAccounts.network, handle: socialAccounts.handle })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.network, pedidas),
        isNotNull(socialAccounts.accessToken),
        eq(socialAccounts.ownerId, ownerId),
      ),
    )
    .orderBy(asc(socialAccounts.createdAt))
  return decidirCuentaUnica(networks, filas)
}
