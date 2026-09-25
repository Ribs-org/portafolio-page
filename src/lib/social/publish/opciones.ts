// Lo que cada red obliga a elegir por destino antes de publicar. Hoy solo TikTok pide
// algo; la unión crece red por red y el resto del sistema solo transporta el objeto.

import type { CuentaDestino } from '../cuentas'

export type PrivacidadTikTok = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
export type ComercialTikTok = 'no' | 'marca_propia' | 'patrocinado'

export type OpcionesTikTok =
  | { modo: 'borrador' }
  | {
      modo: 'directo'
      privacidad: PrivacidadTikTok
      comentarios: boolean
      duo: boolean
      pegar: boolean
      comercial: ComercialTikTok
    }

export type OpcionesDestino = OpcionesTikTok

export const PRIVACIDADES_TIKTOK: readonly PrivacidadTikTok[] = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
]

export const ETIQUETA_PRIVACIDAD: Record<PrivacidadTikTok, string> = {
  PUBLIC_TO_EVERYONE: 'Todos',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos mutuos',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  SELF_ONLY: 'Solo yo',
}

const COMERCIALES: readonly ComercialTikTok[] = ['no', 'marca_propia', 'patrocinado']

export const TIKTOK_SIN_PRIVACIDAD = 'TikTok necesita que elijas la privacidad.'
export const TIKTOK_PATROCINADO_PRIVADO = 'Un contenido patrocinado no puede ser privado.'
export const OPCIONES_ERROR = 'Las opciones de la red no se entendieron.'

const MAX_SERIALIZED = 2000

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function esPrivacidad(value: unknown): value is PrivacidadTikTok {
  return typeof value === 'string' && (PRIVACIDADES_TIKTOK as readonly string[]).includes(value)
}

/** Ausente vale false; cualquier cosa que no sea booleano es un error de forma. */
function casilla(value: unknown): boolean | null {
  if (value === undefined) return false
  return typeof value === 'boolean' ? value : null
}

function validarTikTok(raw: unknown): { opciones: OpcionesTikTok } | { error: string } {
  if (raw === undefined || raw === null) return { error: TIKTOK_SIN_PRIVACIDAD }
  if (!esObjeto(raw)) return { error: OPCIONES_ERROR }
  if (JSON.stringify(raw).length > MAX_SERIALIZED) return { error: OPCIONES_ERROR }

  if (raw.modo === 'borrador') return { opciones: { modo: 'borrador' } }
  if (raw.modo !== 'directo') return { error: OPCIONES_ERROR }

  if (!esPrivacidad(raw.privacidad)) return { error: TIKTOK_SIN_PRIVACIDAD }
  const comentarios = casilla(raw.comentarios)
  const duo = casilla(raw.duo)
  const pegar = casilla(raw.pegar)
  if (comentarios === null || duo === null || pegar === null) return { error: OPCIONES_ERROR }
  const comercial = raw.comercial === undefined ? 'no' : raw.comercial
  if (!(COMERCIALES as readonly unknown[]).includes(comercial)) return { error: OPCIONES_ERROR }
  if (comercial === 'patrocinado' && raw.privacidad === 'SELF_ONLY') {
    return { error: TIKTOK_PATROCINADO_PRIVADO }
  }

  return {
    opciones: {
      modo: 'directo',
      privacidad: raw.privacidad,
      comentarios,
      duo,
      pegar,
      comercial: comercial as ComercialTikTok,
    },
  }
}

/**
 * Las opciones de un destino, ya limpias, o la frase que explica qué falta. Una red que
 * no pide nada solo acepta no recibir nada.
 */
export function validarOpciones(
  network: string,
  raw: unknown,
): { opciones: OpcionesDestino | null } | { error: string } {
  if (network === 'tiktok') return validarTikTok(raw)
  if (raw === undefined || raw === null) return { opciones: null }
  return { error: OPCIONES_ERROR }
}

/** Para una fila entera: un objeto por red pedida, solo con las que tienen opciones. */
export function validarOpcionesPorRed(
  networks: string[],
  raw: Record<string, unknown>,
): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const opciones: Record<string, OpcionesDestino> = {}
  for (const network of networks) {
    const check = validarOpciones(network, raw[network])
    if ('error' in check) return check
    if (check.opciones) opciones[network] = check.opciones
  }
  return { opciones }
}

/**
 * Para una fila entera: un objeto por cuenta elegida, solo con las que tienen opciones.
 *
 * Por cuenta y no por red: la API de TikTok consulta `creator_info` por creador, y las
 * privacidades permitidas pueden diferir entre dos cuentas del mismo dueño. Compartirlas
 * dejaría mandar a una cuenta una privacidad que no admite, y eso se descubre publicando.
 *
 * Cuando el dueño tiene dos o más cuentas de la misma red, un bloque idéntico se repite
 * en pantalla por cada una y la frase fija («TikTok necesita que elijas la privacidad.»)
 * ya no dice a cuál se refiere. En ese caso, y solo en ese caso, se antepone el handle de
 * la cuenta que falló; con una sola cuenta de esa red nombrarla sería ruido.
 */
export function validarOpcionesPorCuenta(
  cuentas: CuentaDestino[],
  raw: Record<string, unknown>,
): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const cuentasPorRed = new Map<string, number>()
  for (const cuenta of cuentas) cuentasPorRed.set(cuenta.network, (cuentasPorRed.get(cuenta.network) ?? 0) + 1)

  const opciones: Record<string, OpcionesDestino> = {}
  for (const cuenta of cuentas) {
    const check = validarOpciones(cuenta.network, raw[cuenta.id])
    if ('error' in check) {
      const redAmbigua = (cuentasPorRed.get(cuenta.network) ?? 0) > 1
      return redAmbigua ? { error: `«${cuenta.handle ?? cuenta.network}»: ${check.error}` } : check
    }
    if (check.opciones) opciones[cuenta.id] = check.opciones
  }
  return { opciones }
}

/**
 * Lo que el compositor manda, tal cual, listo para `validarOpcionesPorCuenta`. Los campos
 * de TikTok llevan el identificador de la cuenta como sufijo (`tiktokModo:<id>`) porque
 * puede haber dos bloques en el mismo formulario. Con TikTok marcado y sin campos, la
 * privacidad viaja vacía a propósito: así la validación responde con la frase de la
 * privacidad y no con la de la forma.
 *
 * Convive con `opcionesDesdeFormulario` (sin sufijo, keyed por red): esa sigue viva por
 * la ruta móvil hasta la Tarea 7; el compositor web ya llama a esta.
 */
export function opcionesDesdeFormularioPorCuenta(
  formData: FormData,
  cuentas: CuentaDestino[],
): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const cuenta of cuentas) {
    if (cuenta.network !== 'tiktok') continue
    const modo = String(formData.get(`tiktokModo:${cuenta.id}`) ?? 'directo')
    raw[cuenta.id] =
      modo === 'borrador'
        ? { modo: 'borrador' }
        : {
            modo: 'directo',
            privacidad: String(formData.get(`tiktokPrivacidad:${cuenta.id}`) ?? ''),
            comentarios: formData.get(`tiktokComentarios:${cuenta.id}`) === 'on',
            duo: formData.get(`tiktokDuo:${cuenta.id}`) === 'on',
            pegar: formData.get(`tiktokPegar:${cuenta.id}`) === 'on',
            comercial: String(formData.get(`tiktokComercial:${cuenta.id}`) ?? 'no'),
          }
  }
  return raw
}

/**
 * Lo que el compositor manda, tal cual, listo para `validarOpcionesPorRed`. Con TikTok
 * marcado y sin campos, la privacidad viaja vacía a propósito: así la validación
 * responde con la frase de la privacidad y no con la de la forma.
 */
export function opcionesDesdeFormulario(formData: FormData, networks: string[]): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  if (networks.includes('tiktok')) {
    const modo = String(formData.get('tiktokModo') ?? 'directo')
    raw.tiktok =
      modo === 'borrador'
        ? { modo: 'borrador' }
        : {
            modo: 'directo',
            privacidad: String(formData.get('tiktokPrivacidad') ?? ''),
            comentarios: formData.get('tiktokComentarios') === 'on',
            duo: formData.get('tiktokDuo') === 'on',
            pegar: formData.get('tiktokPegar') === 'on',
            comercial: String(formData.get('tiktokComercial') ?? 'no'),
          }
  }
  return raw
}

/** Una línea para el editor y el calendario; null cuando no hay nada legible. */
export function resumenOpciones(network: string, opciones: unknown): string | null {
  if (network !== 'tiktok') return null
  const check = validarTikTok(opciones)
  if ('error' in check) return null
  const o = check.opciones
  if (o.modo === 'borrador') return 'Borrador a tu bandeja de TikTok'
  const comercial =
    o.comercial === 'no' ? 'sin comercial' : o.comercial === 'marca_propia' ? 'marca propia' : 'patrocinado'
  return [
    'Directo',
    ETIQUETA_PRIVACIDAD[o.privacidad],
    o.comentarios ? 'con comentarios' : 'sin comentarios',
    o.duo ? 'con dúo' : 'sin dúo',
    o.pegar ? 'con pegar' : 'sin pegar',
    comercial,
  ].join(' · ')
}
