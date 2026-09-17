/**
 * Lo que cada red acepta, medido en el navegador antes de programar.
 *
 * Existe porque una publicación rechazada por el archivo no se sabe hasta veinte minutos
 * después: TikTok acepta la subida, tarda en procesarla y solo entonces contesta
 * `picture_size_check_failed`. Comprobarlo al elegir el archivo convierte esa espera en un
 * aviso inmediato.
 *
 * Los números son los de la guía de transferencia de media de TikTok
 * (developers.tiktok.com, «Content Posting API — Media Transfer Guide»), no estimaciones:
 * fotos hasta 20 MB y **máximo 1080p**; videos hasta 4 GB, entre 360 y 4096 px de lado, y
 * entre 23 y 60 fps. El límite de 1080p en fotos es el que más sorprende, porque cualquier
 * captura de pantalla moderna lo pasa.
 */

export const TIKTOK_FOTO_MAX_LADO = 1080
export const TIKTOK_FOTO_MAX_BYTES = 20 * 1024 * 1024
export const TIKTOK_VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024
export const TIKTOK_VIDEO_MIN_LADO = 360
export const TIKTOK_VIDEO_MAX_LADO = 4096
export const TIKTOK_VIDEO_MAX_SEGUNDOS = 10 * 60

export type MediaMedida = {
  nombre: string
  tipo: 'foto' | 'video'
  bytes: number
  ancho: number | null
  alto: number | null
  segundos: number | null
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

/**
 * Los problemas que TikTok pondría a este archivo, en frases que digan qué hacer.
 * Vacío = lo acepta. Una medida que el navegador no pudo leer no inventa un problema: se
 * calla, porque el rechazo real de TikTok es más fiable que una sospecha nuestra.
 */
export function problemasTikTok(media: MediaMedida): string[] {
  const problemas: string[] = []

  if (media.tipo === 'foto') {
    if (media.bytes > TIKTOK_FOTO_MAX_BYTES) {
      problemas.push(`pesa ${mb(media.bytes)} y TikTok acepta hasta ${mb(TIKTOK_FOTO_MAX_BYTES)} por foto`)
    }
    const lado = Math.max(media.ancho ?? 0, media.alto ?? 0)
    const corto = Math.min(media.ancho ?? 0, media.alto ?? 0)
    // «Máximo 1080p» es el lado corto: una vertical de 1080×1920 entra, una de 1440×2560 no.
    if (corto > TIKTOK_FOTO_MAX_LADO) {
      problemas.push(
        `mide ${media.ancho}×${media.alto} y TikTok no pasa de 1080p en fotos: redúcela a ${TIKTOK_FOTO_MAX_LADO} px de lado corto`,
      )
    }
    void lado
    return problemas
  }

  if (media.bytes > TIKTOK_VIDEO_MAX_BYTES) {
    problemas.push(`pesa ${mb(media.bytes)} y TikTok acepta hasta 4 GB`)
  }
  if (media.ancho !== null && media.alto !== null) {
    const corto = Math.min(media.ancho, media.alto)
    const largo = Math.max(media.ancho, media.alto)
    if (corto < TIKTOK_VIDEO_MIN_LADO) {
      problemas.push(`mide ${media.ancho}×${media.alto} y TikTok pide al menos ${TIKTOK_VIDEO_MIN_LADO} px de lado`)
    }
    if (largo > TIKTOK_VIDEO_MAX_LADO) {
      problemas.push(`mide ${media.ancho}×${media.alto} y TikTok no pasa de ${TIKTOK_VIDEO_MAX_LADO} px de lado`)
    }
  }
  if (media.segundos !== null && media.segundos > TIKTOK_VIDEO_MAX_SEGUNDOS) {
    problemas.push(`dura ${Math.round(media.segundos / 60)} minutos y TikTok acepta hasta 10 por la API`)
  }
  return problemas
}
