import { NOMBRE_RED, type CuentaApp } from './tipos'

export const MAX_BYTES = 500 * 1024 * 1024
export const MAX_ARCHIVOS = 10

export const TIPO_NO_PUBLICABLE = 'Ese tipo de archivo no se puede publicar.'
export const ARCHIVO_MUY_GRANDE = 'El archivo supera los 500 MB.'
export const SIN_SENAL = 'No se pudo conectar. Revisa tu señal.'
export const SIN_SENAL_SUBIDA = 'No se pudo subir el archivo. Revisa tu señal.'
/** Copia la frase del servidor (src/lib/mobile-api.ts): la app tiene que reconocerla. */
export const ARCHIVO_FALTANTE = 'Falta subir un archivo.'

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

/** El texto del `Alert` de «Publicar ahora»: nombra los handles, no las redes. */
export function textoConfirmacion(cuentas: CuentaApp[]): string {
  const nombres = cuentas.map((c) => c.handle ?? NOMBRE_RED[c.red] ?? c.red)
  const lista =
    nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return `¿Publicar ahora en ${lista}? Saldrá en los próximos 5 minutos.`
}

/**
 * Si tienes una sola cuenta conectada, viene marcada: no hay entre qué elegir. Con dos
 * o más no viene ninguna — misma regla que `vieneMarcada` en el panel
 * (`admin/(dash)/schedule/composer.tsx`), pero contada sobre `disponibles`, que acá es
 * lo que trae `GET /api/mobile/schedule/accounts`: las cuentas del dueño en las redes
 * que la app publica, sin TikTok. El panel cuenta sobre todas las cuentas del dueño,
 * TikTok incluido, así que con una sola cuenta de Instagram y una de TikTok el panel
 * no marca nada (dos candidatas) y el teléfono marca la de Instagram (una sola
 * posibilidad ahí, que es la única que existe de verdad en esta pantalla). No es una
 * discrepancia: son dos universos distintos, cada uno correcto para su superficie.
 */
export function vieneMarcada(cuenta: CuentaApp, disponibles: CuentaApp[]): boolean {
  return cuenta.conectada && disponibles.filter((c) => c.conectada).length === 1
}

/** El texto de un chip de cuenta: la red y el handle, o «sin nombre» si no lo tiene. */
export function etiquetaCuenta(cuenta: CuentaApp): string {
  return `${NOMBRE_RED[cuenta.red] ?? cuenta.red} · ${cuenta.handle ?? 'sin nombre'}`
}

/** El valor inicial del selector: la próxima hora en punto, nunca «ahora mismo». */
export function proximaHoraEnPunto(now: Date): Date {
  const siguiente = new Date(now)
  siguiente.setHours(now.getHours() + 1, 0, 0, 0)
  return siguiente
}

/**
 * Las dos reglas que la app aplica sola, antes de que el servidor diga nada: algo que
 * mandar (texto o archivo) y al menos un destino elegido. Sin la segunda, el envío
 * llegaba a rechazarse recién en el servidor con «Elige al menos una plataforma»
 * debajo de una fila de chips que ya no dicen «plataforma», dicen cuenta.
 */
export function puedeEnviar(texto: string, archivos: number, cuentas: number): boolean {
  return (texto.trim().length > 0 || archivos > 0) && cuentas > 0
}
