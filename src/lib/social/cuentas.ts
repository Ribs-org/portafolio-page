// Las cuentas como destino, no las redes: `verificarCuentas` comprueba identificadores
// de cuenta elegidos a mano, y `cuentaUnicaPorRed` resuelve una red a su cuenta solo
// cuando no hay ambigüedad (un identificador vale siempre; nombrar la red ya no alcanza
// con dos cuentas conectadas de la misma). Sin `server-only`: `crear.ts` lo importa y
// `actions.ts` ya es server.
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { SIN_CUENTA, agruparPorRed } from './cuenta'

/** Lo que no se puede usar como destino: ajena, inexistente o sin credencial. */
export class CuentaInvalida extends Error {}

// Hereda de `CuentaInvalida` para que quien atrapa destinos inválidos no tenga que
// enumerar los motivos: un solo `instanceof CuentaInvalida` cubre también «sin cuenta».
// Todos los llamadores de este módulo preguntan así hoy, ninguno por `instanceof
// SinCuenta` — si alguna vez hace falta distinguir «sin cuenta» del resto, sigue
// siendo una subclase real, no una unión aparte.
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
 * No elige por nadie: comprueba lo que le dieron. Los identificadores llegan del
 * navegador o del teléfono, así que la pertenencia es una comprobación de seguridad, no
 * una cortesía — sin ella se podría programar una publicación en la cuenta de otro
 * mandando su identificador.
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
