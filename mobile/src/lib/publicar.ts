import { NOMBRE_RED } from './tipos'

export const MAX_BYTES = 500 * 1024 * 1024
export const MAX_ARCHIVOS = 10
/** Las cinco con publisher; TikTok lee métricas pero no publica. */
export const REDES_PUBLICABLES = ['instagram', 'facebook', 'youtube', 'threads', 'x']

export const TIPO_NO_PUBLICABLE = 'Ese tipo de archivo no se puede publicar.'
export const ARCHIVO_MUY_GRANDE = 'El archivo supera los 500 MB.'
export const SIN_SENAL = 'No se pudo conectar. Revisa tu señal.'
export const SIN_SENAL_SUBIDA = 'No se pudo subir el archivo. Revisa tu señal.'

// La misma tabla que tipoArchivo en el sitio (src/lib/social/publish/batch.ts): el
// selector de Android a veces entrega mimeType vacío para un .mov.
const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export type Elegido = {
  uri: string
  nombre: string
  tipo: string
  bytes: number
  mediaType: 'image' | 'video'
}

/**
 * Lo que la app necesita saber de un archivo elegido, resuelto una vez: el tipo (del
 * selector o de la extensión), el nombre (del selector o de la uri) y el tamaño. Un
 * tamaño desconocido no bloquea: el servidor es la puerta; acá solo se evita pedir una
 * URL que sabemos que va a negar.
 */
export function describirArchivo(asset: {
  uri: string
  fileName?: string | null
  mimeType?: string | null
  fileSize?: number | null
}): Elegido | { error: string } {
  const nombre = asset.fileName?.trim() || asset.uri.split('/').pop() || 'archivo'
  const extension = nombre.split('.').pop()?.toLowerCase() ?? ''
  const declarado = asset.mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  const tipo =
    declarado.startsWith('image/') || declarado.startsWith('video/')
      ? declarado
      : (TIPO_POR_EXTENSION[extension] ?? '')
  if (!tipo) return { error: TIPO_NO_PUBLICABLE }
  const bytes = asset.fileSize ?? 0
  if (bytes > MAX_BYTES) return { error: ARCHIVO_MUY_GRANDE }
  return { uri: asset.uri, nombre, tipo, bytes, mediaType: tipo.startsWith('video/') ? 'video' : 'image' }
}

/** Desde dónde retoma un envío caído: el chequeo, un archivo en particular, o la creación. */
export type Retomar =
  | { paso: 'chequeando' }
  | { paso: 'subiendo'; indice: number; total: number; progreso: number }
  | { paso: 'creando' }

export type Envio =
  | { paso: 'listo'; error: string | null }
  | Retomar
  | { paso: 'hecho' }
  | { paso: 'error'; mensaje: string; retomar: Retomar }

export type Evento =
  | { tipo: 'chequear' }
  | { tipo: 'rechazado'; mensaje: string }
  | { tipo: 'subir'; indice: number; total: number }
  | { tipo: 'progreso'; progreso: number }
  | { tipo: 'crear' }
  | { tipo: 'hecho' }
  | { tipo: 'fallo'; mensaje: string; retomar: Retomar }
  | { tipo: 'cancelar' }
  | { tipo: 'reintentar' }

export const ENVIO_INICIAL: Envio = { paso: 'listo', error: null }

/**
 * La máquina de pasos del envío. Dos salidas distintas a propósito: «rechazado» es el
 * servidor diciendo que algo del borrador está mal (vuelve a listo con la frase, el
 * dueño tiene que cambiar algo), y «fallo» es la red que se cayó (queda en error con
 * desde dónde retomar, porque el borrador está bien).
 */
export function reducirEnvio(estado: Envio, evento: Evento): Envio {
  switch (evento.tipo) {
    case 'chequear':
      return { paso: 'chequeando' }
    case 'rechazado':
      return { paso: 'listo', error: evento.mensaje }
    case 'subir':
      return { paso: 'subiendo', indice: evento.indice, total: evento.total, progreso: 0 }
    case 'progreso':
      return estado.paso === 'subiendo'
        ? { ...estado, progreso: Math.min(1, Math.max(0, evento.progreso)) }
        : estado
    case 'crear':
      return { paso: 'creando' }
    case 'hecho':
      return { paso: 'hecho' }
    case 'fallo':
      return { paso: 'error', mensaje: evento.mensaje, retomar: evento.retomar }
    case 'cancelar':
      return ENVIO_INICIAL
    case 'reintentar':
      return estado.paso === 'error' ? estado.retomar : estado
  }
}

/** Qué mostrar bajo los botones mientras el envío corre; null cuando no hay nada que decir. */
export function etiquetaEnvio(estado: Envio): string | null {
  switch (estado.paso) {
    case 'chequeando':
      return 'Comprobando…'
    case 'subiendo':
      return `Subiendo ${estado.indice + 1} de ${estado.total} · ${Math.round(estado.progreso * 100)} %`
    case 'creando':
      return 'Guardando…'
    case 'hecho':
      return 'Listo'
    default:
      return null
  }
}

export function textoConfirmacion(redes: string[]): string {
  const nombres = redes.map((r) => NOMBRE_RED[r] ?? r)
  const lista =
    nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return `¿Publicar ahora en ${lista}? Saldrá en los próximos 5 minutos.`
}

/** El valor inicial del selector: la próxima hora en punto, nunca «ahora mismo». */
export function proximaHoraEnPunto(now: Date): Date {
  const siguiente = new Date(now)
  siguiente.setHours(now.getHours() + 1, 0, 0, 0)
  return siguiente
}

/** La única regla que la app aplica sola; todas las demás las dice el servidor. */
export function puedeEnviar(texto: string, archivos: number): boolean {
  return texto.trim().length > 0 || archivos > 0
}
