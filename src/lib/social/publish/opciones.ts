// Lo que cada red obliga a elegir por destino antes de publicar. TikTok e Instagram piden
// algo hoy; la unión crece red por red y el resto del sistema solo transporta el objeto.

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

/**
 * Instagram: un reel puede salir como trial reel —solo lo ven quienes no siguen la cuenta,
 * hasta que el dueño lo comparte con todos desde la app de Instagram—. La graduación no
 * viaja: el publicador manda siempre `MANUAL` (decisión del dueño, 2026-09-28). El día
 * que se quiera que decida Instagram, es un campo opcional acá con `manual` por defecto,
 * y lo ya guardado sigue valiendo.
 */
export type OpcionesInstagram = { trialReel: true }

export type OpcionesDestino = OpcionesTikTok | OpcionesInstagram

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
export const TRIAL_REEL_MEDIA = 'Un trial reel es un solo video, sin fotos.'

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
 * Ausente o apagado es un reel normal y no se guarda nada; encendido se guarda tal cual.
 * Cualquier otra forma se rechaza —incluida una clave desconocida—: quien manda
 * `trialreel` mal escrito, o una `graduacion` que todavía no existe, tiene que enterarse,
 * no recibir un reel normal creyendo que pidió otra cosa. (TikTok ignora claves de más;
 * acá no, porque esta opción la manda sobre todo un modelo a ciegas.)
 */
function validarInstagram(raw: unknown): { opciones: OpcionesInstagram | null } | { error: string } {
  if (raw === undefined || raw === null) return { opciones: null }
  if (!esObjeto(raw)) return { error: OPCIONES_ERROR }
  if (JSON.stringify(raw).length > MAX_SERIALIZED) return { error: OPCIONES_ERROR }
  for (const clave of Object.keys(raw)) if (clave !== 'trialReel') return { error: OPCIONES_ERROR }
  const trialReel = casilla(raw.trialReel)
  if (trialReel === null) return { error: OPCIONES_ERROR }
  return { opciones: trialReel ? { trialReel: true } : null }
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
  if (network === 'instagram') return validarInstagram(raw)
  if (raw === undefined || raw === null) return { opciones: null }
  return { error: OPCIONES_ERROR }
}

/**
 * Un trial reel es exactamente un video, sin fotos. Depende de la opción y no de la red,
 * por eso no vive en `validateScheduleDraft`: la aplican los cuatro caminos que crean
 * posts (lote, compositor, chequeo y creación del teléfono) sobre las opciones ya
 * resueltas por cuenta. `sinTipo` son los archivos cuyo tipo todavía no se conoce (una
 * URL de Drive antes de descargarla): uno solo puede ser el video, así que no se rechaza;
 * la re-validación con los tipos reales da el veredicto final.
 */
export function errorDeMediaPorOpciones(
  opciones: Record<string, OpcionesDestino>,
  conteos: { videos: number; fotos: number; sinTipo: number },
): string | null {
  const hayTrial = Object.values(opciones).some((o) => 'trialReel' in o)
  if (!hayTrial) return null
  if (conteos.fotos > 0 || conteos.videos > 1) return TRIAL_REEL_MEDIA
  if (conteos.videos + conteos.sinTipo !== 1) return TRIAL_REEL_MEDIA
  return null
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
 * privacidad y no con la de la forma. El interruptor de Instagram (`instagramTrial:<id>`)
 * sigue la misma convención de sufijo por cuenta.
 */
export function opcionesDesdeFormularioPorCuenta(
  formData: FormData,
  cuentas: CuentaDestino[],
): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const cuenta of cuentas) {
    if (cuenta.network === 'instagram') {
      // `Toggle` con `name` manda 'on' encendido y '' apagado; apagado no produce entrada.
      if (formData.get(`instagramTrial:${cuenta.id}`) === 'on') raw[cuenta.id] = { trialReel: true }
      continue
    }
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

/** Una línea para el editor y el calendario; null cuando no hay nada legible. */
export function resumenOpciones(network: string, opciones: unknown): string | null {
  if (network === 'instagram') {
    const check = validarInstagram(opciones)
    return 'error' in check || !check.opciones ? null : 'Trial reel — lo compartes tú desde Instagram'
  }
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
