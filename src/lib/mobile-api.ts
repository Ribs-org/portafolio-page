import { PUBLISHABLE, typeFromContentType } from './social/publish/batch'
import { CuentaInvalida, cuentaUnicaPorRed, verificarCuentas, type CuentaDestino } from './social/cuentas'

// El teléfono todavía no tiene dónde pedir las opciones que TikTok exige por
// destino (privacidad, interacciones, comercial), así que esa red se rechaza aquí
// aunque el lote y el compositor ya la publiquen. Quitar esta exclusión cuando la
// app móvil traiga el bloque de TikTok.
//
// Exportada: `resolverDestinos` (más abajo) también la usa para filtrar destinos
// elegidos por cuenta, y `GET /api/mobile/schedule/accounts` para no ofrecer un chip
// de una cuenta que después el servidor va a rechazar.
export const REDES_MOVIL = new Set([...PUBLISHABLE].filter((red) => red !== 'tiktok'))

function fraseRedNoPublicable(red: string): string {
  return `Red desconocida o sin publicación: ${red}.`
}

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
 *
 * `bytes` en 0 significa "el teléfono no sabe el tamaño" (la galería no siempre lo
 * reporta) y no bloquea la subida: el PUT prefirmado nunca exigió un Content-Length,
 * así que el tope de abajo es solo una cortesía, no una garantía de seguridad.
 */
export function prepararSubida(
  nombre: string,
  tipo: string,
  bytes: unknown,
  uuid: string,
): { key: string; mediaType: 'image' | 'video'; tipo: string } | { error: string } {
  const resuelto = typeFromContentType(tipo)
  if (!resuelto) return { error: TIPO_NO_PUBLICABLE }
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return { error: CUERPO_ILEGIBLE }
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

// `cuentas` manda sobre `redes` cuando el cuerpo trae las dos (ver Tarea 7): la app
// nueva elige destino por cuenta, no por red. `redes` se queda para una app vieja
// instalada que todavía no la manda — se resuelve sola mientras no haya dos cuentas
// conectadas en esa red, la regla de siempre (`cuentaUnicaPorRed`).
export type BorradorMovil = { texto: string; redes: string[]; cuentas: string[]; cuando: string | null; ahora: boolean }
export type MediaMovil = { url: string; mediaType: 'image' | 'video' }

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** La parte del borrador que comparten el chequeo y la creación. */
export function parseBorradorMovil(body: unknown): BorradorMovil | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const { texto = '', redes = [], cuentas = [], cuando = null, ahora = false } = body
  if (typeof texto !== 'string') return { error: CUERPO_ILEGIBLE }
  if (!Array.isArray(redes) || !redes.every((r) => typeof r === 'string')) return { error: CUERPO_ILEGIBLE }
  if (!Array.isArray(cuentas) || !cuentas.every((c) => typeof c === 'string')) return { error: CUERPO_ILEGIBLE }
  if (cuando !== null && typeof cuando !== 'string') return { error: CUERPO_ILEGIBLE }
  if (typeof ahora !== 'boolean') return { error: CUERPO_ILEGIBLE }
  // Repetidas se funden sin quejarse: el índice único (post, red) las rechazaría
  // después con un error de base que el teléfono no sabría explicar.
  const unicas = [...new Set(redes as string[])]
  for (const red of unicas) {
    if (!REDES_MOVIL.has(red)) return { error: fraseRedNoPublicable(red) }
  }
  return { texto: texto.trim(), redes: unicas, cuentas: [...new Set(cuentas as string[])], cuando, ahora }
}

/**
 * El destino real de un borrador, resuelto una sola vez para que `check` y el `POST` de
 * `schedule/route.ts` nunca puedan desacordarse: los dos le pasan el borrador entero y
 * usan exactamente lo mismo que devuelve, en vez de repetir la decisión cada uno por su
 * lado.
 *
 * `cuentas` manda sobre `redes` cuando el borrador trae las dos: verifica pertenencia y
 * conexión con `verificarCuentas`. Sin `cuentas`, resuelve por `redes` con
 * `cuentaUnicaPorRed` — el camino de una app vieja instalada, que se resuelve sola
 * mientras no haya dos cuentas conectadas en esa red.
 *
 * Filtra por `REDES_MOVIL` sobre los destinos YA resueltos, no sobre lo que el cuerpo
 * declaró: la app nueva nunca ofrece un chip de una red no publicable (el endpoint de
 * cuentas la filtra), pero un cuerpo fabricado a mano sí podría nombrar una cuenta de
 * TikTok sin decir «tiktok» en ninguna parte — el servidor decide, no el cliente. Con
 * algún destino resuelto y ninguno publicable desde el teléfono, revienta con la misma
 * frase que ya usa `parseBorradorMovil` para una red desconocida: no es un error
 * distinto, es la misma regla aplicada un paso más tarde. Con dos o más destinos donde
 * al menos uno sí es publicable y otro no, rechaza la fila entera nombrando el que no
 * —igual que una `redes` mixta ya rechazaba entera en `parseBorradorMovil`— en vez de
 * descartar el malo en silencio y publicar solo en el resto, que sorprendería a quien
 * programó los dos juntos a propósito.
 *
 * Sin ningún destino (cuerpo vacío en las dos formas) no revienta: devuelve listas
 * vacías, para que sea `validateScheduleDraft` quien dé la frase de «elige un destino».
 *
 * `deps` existe para poder probar esta función sin base — ver `mobile-api.test.ts`.
 */
export async function resolverDestinos(
  ownerId: string,
  borrador: Pick<BorradorMovil, 'cuentas' | 'redes'>,
  deps: {
    verificarCuentas: (ownerId: string, accountIds: string[]) => Promise<CuentaDestino[]>
    cuentaUnicaPorRed: (ownerId: string, networks: string[]) => Promise<Map<string, CuentaDestino>>
  } = { verificarCuentas, cuentaUnicaPorRed },
): Promise<{ cuentas: CuentaDestino[]; networks: string[] }> {
  const destinos =
    borrador.cuentas.length > 0
      ? await deps.verificarCuentas(ownerId, borrador.cuentas)
      : [...(await deps.cuentaUnicaPorRed(ownerId, borrador.redes)).values()]

  const noPublicable = destinos.find((d) => !REDES_MOVIL.has(d.network))
  if (noPublicable) throw new CuentaInvalida(fraseRedNoPublicable(noPublicable.network))

  return { cuentas: destinos, networks: [...new Set(destinos.map((d) => d.network))] }
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
