'use client'

import { useEffect, useState } from 'react'
import { problemasTikTok, type MediaMedida } from '@/lib/social/publish/limites'

/**
 * Mide los archivos elegidos en el navegador y dice si TikTok los va a rechazar, antes de
 * programar. El navegador ya tiene el archivo en la mano, así que leer ancho, alto y
 * duración no cuesta nada; lo que cuesta es enterarse veinte minutos después, cuando TikTok
 * termina de procesar y contesta que la foto pasaba de 1080p.
 *
 * Solo revisa TikTok porque es la única red con límites estrechos y con un rechazo tan
 * diferido. Las demás fallan rápido y con su propio mensaje.
 */
export function RevisionMedia({ files, activo }: { files: File[]; activo: boolean }) {
  // Las medidas viajan junto a la selección que las produjo: así, al cambiar de archivos,
  // no hace falta vaciarlas dentro del efecto (React lo prohíbe) para no mostrar las viejas.
  const [medido, setMedido] = useState<{ para: File[]; medidas: MediaMedida[] } | null>(null)

  useEffect(() => {
    if (!activo || files.length === 0) return
    let vivo = true
    Promise.all(files.map(medir)).then((medidas) => {
      if (vivo) setMedido({ para: files, medidas })
    })
    return () => {
      vivo = false
    }
  }, [files, activo])

  if (!activo || files.length === 0) return null
  if (!medido || medido.para !== files) return null
  const medidas = medido.medidas

  const conProblemas = medidas
    .map((media) => ({ media, problemas: problemasTikTok(media) }))
    .filter((fila) => fila.problemas.length > 0)

  if (conProblemas.length === 0) {
    return (
      <p className="text-[0.72rem] text-positive">
        {medidas.length === 1 ? 'El archivo cumple' : 'Los archivos cumplen'} lo que pide TikTok.
      </p>
    )
  }

  return (
    <div className="rounded-lg bg-negative/10 p-3 text-[0.72rem] text-negative">
      <p className="font-medium">TikTok va a rechazar esto:</p>
      <ul className="mt-1 space-y-0.5">
        {conProblemas.map(({ media, problemas }) => (
          <li key={media.nombre}>
            {media.nombre}: {problemas.join('; ')}.
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Ancho, alto y duración de un archivo local. Null en lo que no se pueda leer: un códec que
 * el navegador no decodifica no es motivo para bloquear una publicación que TikTok sí
 * aceptaría.
 */
function medir(file: File): Promise<MediaMedida> {
  const tipo: MediaMedida['tipo'] = file.type.startsWith('video/') ? 'video' : 'foto'
  const base: MediaMedida = { nombre: file.name, tipo, bytes: file.size, ancho: null, alto: null, segundos: null }
  const url = URL.createObjectURL(file)

  return new Promise<MediaMedida>((resolve) => {
    // Un archivo que no carga se resuelve igual, sin medidas, en vez de dejar la promesa
    // colgada y la revisión en blanco para siempre.
    const listo = (extra: Partial<MediaMedida>) => {
      URL.revokeObjectURL(url)
      resolve({ ...base, ...extra })
    }

    if (tipo === 'video') {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.onloadedmetadata = () =>
        listo({
          ancho: el.videoWidth || null,
          alto: el.videoHeight || null,
          segundos: Number.isFinite(el.duration) ? el.duration : null,
        })
      el.onerror = () => listo({})
      el.src = url
      return
    }

    const img = new Image()
    img.onload = () => listo({ ancho: img.naturalWidth || null, alto: img.naturalHeight || null })
    img.onerror = () => listo({})
    img.src = url
  })
}
