import { File } from 'expo-file-system'

import { RechazoApi, SesionCaducada, apiPost } from './api'
import { ARCHIVO_FALTANTE, SIN_SENAL, SIN_SENAL_SUBIDA, type Elegido, type Evento, type Retomar } from './publicar'

export type BorradorApp = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }
export type SubidaHecha = { url: string; mediaType: 'image' | 'video' }

type Destino = { subir: string; publica: string; mediaType: 'image' | 'video' }

// Las dos cabeceras van dentro de la firma del PUT: tienen que ir tal cual o R2 responde
// 403. El valor de Cache-Control es el que pone el servidor en src/lib/storage.ts.
const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'

async function subirArchivo(
  archivo: Elegido,
  destino: Destino,
  onProgreso: (progreso: number) => void,
  signal: AbortSignal,
): Promise<void> {
  // `File` lee desde disco: un video de 200 MB nunca pasa entero por memoria.
  const resultado = await new File(archivo.uri).upload(destino.subir, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': archivo.tipo, 'Cache-Control': CACHE_INMUTABLE },
    onProgress: ({ bytesSent, totalBytes }) => onProgreso(totalBytes > 0 ? bytesSent / totalBytes : 0),
    signal,
  })
  if (resultado.status < 200 || resultado.status >= 300) {
    console.warn('PUT a R2:', resultado.status, resultado.body.slice(0, 300))
    throw new Error(`HTTP ${resultado.status}`)
  }
}

/**
 * El envío entero, retomable. Recorre chequeo → subida archivo por archivo → creación
 * desde el punto que diga `retomar`, reusando las subidas ya hechas de un intento
 * anterior. No decide nada visible: cada paso lo cuenta por `despachar` y la pantalla
 * dibuja lo que el reductor diga. Devuelve las subidas para que el próximo intento no
 * repita las que ya están.
 *
 * Un 401 sube como `SesionCaducada`: la pantalla hace lo de siempre con él.
 */
export async function ejecutarEnvio(args: {
  token: string
  borrador: BorradorApp
  archivos: Elegido[]
  subidas: (SubidaHecha | null)[]
  retomar: Retomar
  despachar: (evento: Evento) => void
  signal: AbortSignal
}): Promise<(SubidaHecha | null)[]> {
  const { token, borrador, archivos, despachar, signal } = args
  const subidas = archivos.map((_, i) => args.subidas[i] ?? null)
  const total = archivos.length
  let paso: Retomar['paso'] = args.retomar.paso
  let desde = args.retomar.paso === 'subiendo' ? args.retomar.indice : 0

  if (paso === 'chequeando') {
    despachar({ tipo: 'chequear' })
    try {
      await apiPost('/api/mobile/schedule/check', token, {
        ...borrador,
        fotos: archivos.filter((a) => a.mediaType === 'image').length,
        videos: archivos.filter((a) => a.mediaType === 'video').length,
      })
    } catch (e) {
      if (e instanceof SesionCaducada) throw e
      if (e instanceof RechazoApi) despachar({ tipo: 'rechazado', mensaje: e.message })
      else despachar({ tipo: 'fallo', mensaje: SIN_SENAL, retomar: { paso: 'chequeando' } })
      return subidas
    }
    paso = 'subiendo'
    desde = 0
  }

  if (paso === 'subiendo') {
    for (let i = desde; i < total; i++) {
      if (subidas[i]) continue
      despachar({ tipo: 'subir', indice: i, total })
      const archivo = archivos[i]!
      try {
        const destino = await apiPost<Destino>('/api/mobile/upload-url', token, {
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          bytes: archivo.bytes,
        })
        await subirArchivo(archivo, destino, (p) => despachar({ tipo: 'progreso', progreso: p }), signal)
        subidas[i] = { url: destino.publica, mediaType: destino.mediaType }
      } catch (e) {
        // La sesión caducada y el rechazo del servidor pesan más que una cancelación
        // que llegó al mismo tiempo: un 401 siempre sube como `SesionCaducada`, nunca
        // se lo traga un `signal.aborted` que coincida por casualidad.
        if (e instanceof SesionCaducada) throw e
        if (e instanceof RechazoApi) {
          despachar({ tipo: 'rechazado', mensaje: e.message })
          return subidas
        }
        if (signal.aborted) {
          despachar({ tipo: 'cancelar' })
          return subidas
        }
        console.warn('subida:', String(e).slice(0, 300))
        despachar({
          tipo: 'fallo',
          mensaje: SIN_SENAL_SUBIDA,
          retomar: { paso: 'subiendo', indice: i, total, progreso: 0 },
        })
        return subidas
      }
    }
  }

  despachar({ tipo: 'crear' })
  try {
    await apiPost('/api/mobile/schedule', token, {
      ...borrador,
      media: subidas.filter((s): s is SubidaHecha => s !== null),
    })
    despachar({ tipo: 'hecho' })
  } catch (e) {
    if (e instanceof SesionCaducada) throw e
    if (e instanceof RechazoApi) {
      despachar({ tipo: 'rechazado', mensaje: e.message })
      // El barrido diario borra lo no referenciado a la hora: si el servidor dice que
      // falta un archivo, las URLs que ya teníamos pueden apuntar a objetos muertos.
      // Se devuelven todas en null para que el próximo intento las vuelva a subir.
      if (e.message === ARCHIVO_FALTANTE) return archivos.map(() => null)
    } else despachar({ tipo: 'fallo', mensaje: SIN_SENAL, retomar: { paso: 'creando' } })
  }
  return subidas
}
