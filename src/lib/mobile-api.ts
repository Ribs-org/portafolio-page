import { mobileTokenIsValid } from './mobile-token'
import { PUBLISHABLE, typeFromContentType } from './social/publish/batch'

/** Los tres rangos que ofrece la app; el resto del panel no viaja al teléfono. */
export const RANGOS = ['hoy', '7d', '30d'] as const
export type Rango = (typeof RANGOS)[number]

const DIAS: Record<Rango, number> = { hoy: 1, '7d': 7, '30d': 30 }

// Iguala al tope de la API del editor-LLM (src/app/api/metrics/posts/route.ts): mismo
// catálogo, misma parrilla — no hay razón para que el móvil vea menos posts que el editor.
export const MAX_POSTS = 2000

/**
 * Un rango ilegible cae en 7d en vez de fallar: en un teléfono, una pantalla vacía
 * por un parámetro mal escrito es peor que una ventana distinta a la pedida.
 */
export function parseRango(value: string | null, now: Date): { from: Date; to: Date } {
  const rango = (RANGOS as readonly string[]).includes(value ?? '') ? (value as Rango) : '7d'
  return { from: new Date(now.getTime() - DIAS[rango] * 864e5), to: now }
}

/** El molde del resto del repo: sin cabecera válida, nadie pasa. */
export async function requireMobile(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  return mobileTokenIsValid(header.slice('Bearer '.length))
}

/* ------------------------------------------------- publicar desde el teléfono -- */

export const MAX_BYTES_SUBIDA = 500 * 1024 * 1024
/** Un minuto adelante: el pinger de cinco minutos lo recoge en su próxima pasada. */
export const AHORA_MS = 60_000

export const TIPO_NO_PUBLICABLE = 'Ese tipo de archivo no se puede publicar.'
export const ARCHIVO_MUY_GRANDE = 'El archivo supera los 500 MB.'
export const ARCHIVO_AJENO = 'Un archivo no es del almacén.'
export const ARCHIVO_FALTANTE = 'Falta subir un archivo.'
export const CUERPO_ILEGIBLE = 'El cuerpo no se entendió.'
export const NO_SE_GUARDO = 'No se pudo guardar. Intenta de nuevo.'

// Las keys llevan el nombre que puso el teléfono; un nombre kilométrico no aporta y
// alarga cada URL que Meta y YouTube van a descargar.
const MAX_NOMBRE = 100

/**
 * Qué key y qué content-type tendrá un archivo que el teléfono está por subir. Solo el
 * nombre base: una ruta dentro de la key sería una carpeta nueva que el barrido no
 * espera. El uuid llega de afuera para que esto sea puro.
 */
export function prepararSubida(
  nombre: string,
  tipo: string,
  bytes: unknown,
  uuid: string,
): { key: string; mediaType: 'image' | 'video'; tipo: string } | { error: string } {
  const resuelto = typeFromContentType(tipo)
  if (!resuelto) return { error: TIPO_NO_PUBLICABLE }
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return { error: CUERPO_ILEGIBLE }
  if (bytes > MAX_BYTES_SUBIDA) return { error: ARCHIVO_MUY_GRANDE }

  const base = nombre.split(/[\\/]/).pop()?.trim() ?? ''
  const conExtension = /\.[A-Za-z0-9]{1,5}$/.test(base)
    ? base
    : `${base || 'archivo'}.${resuelto.extension}`
  return {
    key: `scheduled/${uuid}-${conExtension.slice(-MAX_NOMBRE)}`,
    mediaType: resuelto.mediaType,
    tipo: resuelto.tipo,
  }
}

export type BorradorMovil = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }
export type MediaMovil = { url: string; mediaType: 'image' | 'video' }

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** La parte del borrador que comparten el chequeo y la creación. */
export function parseBorradorMovil(body: unknown): BorradorMovil | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const { texto = '', redes, cuando = null, ahora = false } = body
  if (typeof texto !== 'string') return { error: CUERPO_ILEGIBLE }
  if (!Array.isArray(redes) || !redes.every((r) => typeof r === 'string')) return { error: CUERPO_ILEGIBLE }
  if (cuando !== null && typeof cuando !== 'string') return { error: CUERPO_ILEGIBLE }
  if (typeof ahora !== 'boolean') return { error: CUERPO_ILEGIBLE }
  // Repetidas se funden sin quejarse: el índice único (post, red) las rechazaría
  // después con un error de base que el teléfono no sabría explicar.
  const unicas = [...new Set(redes as string[])]
  for (const red of unicas) {
    if (!PUBLISHABLE.has(red)) return { error: `Red desconocida o sin publicación: ${red}.` }
  }
  return { texto: texto.trim(), redes: unicas, cuando, ahora }
}

function enteroNoNegativo(value: unknown): number | null {
  if (value === undefined) return 0
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** Cuántos archivos habrá, para chequear las reglas antes de subir ninguno. */
export function parseConteos(body: unknown): { fotos: number; videos: number } | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const fotos = enteroNoNegativo(body.fotos)
  const videos = enteroNoNegativo(body.videos)
  if (fotos === null || videos === null) return { error: CUERPO_ILEGIBLE }
  return { fotos, videos }
}

/** Las URLs ya subidas, en el orden en que se eligieron: ese es el del carrusel. */
export function parseMediaMovil(body: unknown): MediaMovil[] | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const { media = [] } = body
  if (!Array.isArray(media)) return { error: CUERPO_ILEGIBLE }
  const lista: MediaMovil[] = []
  for (const item of media) {
    if (!esObjeto(item) || typeof item.url !== 'string' || item.url === '') return { error: CUERPO_ILEGIBLE }
    if (item.mediaType !== 'image' && item.mediaType !== 'video') return { error: CUERPO_ILEGIBLE }
    lista.push({ url: item.url, mediaType: item.mediaType })
  }
  return lista
}

/**
 * El instante en que sale el post. El teléfono manda un ISO con su propia hora ya
 * resuelta: no hay hora de pared que reinterpretar. Null cae en la frase de
 * validateScheduleDraft, «La fecha no se entendió.».
 */
export function resolverCuando(ahora: boolean, cuando: string | null, now: Date): Date | null {
  if (ahora) return new Date(now.getTime() + AHORA_MS)
  if (!cuando) return null
  const fecha = new Date(cuando)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}
