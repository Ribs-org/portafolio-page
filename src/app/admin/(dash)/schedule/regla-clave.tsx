'use client'

import { Field, Input, Textarea } from '@/components/ui'
import { MAX_MENSAJE, MAX_PALABRA, MAX_RESPUESTA, RESPUESTA_PUBLICA_POR_DEFECTO } from '@/lib/social/comentarios/reglas'

/**
 * La regla de palabra clave de un post. Plegada por defecto en el compositor; abierta en
 * el editor cuando ya existe. Los tres campos llevan el nombre que `reglaDesdeFormulario`
 * lee. Palabra vacía = sin regla.
 */
export function ReglaClave({
  inicial,
}: {
  inicial?: { palabra: string; mensaje: string; respuestaPublica: string } | null
}) {
  return (
    <details open={Boolean(inicial)} className="rounded-xl bg-white/[0.04] p-4">
      <summary className="cursor-pointer text-sm font-medium">Respuesta automática por palabra clave</summary>
      <div className="mt-4 space-y-4">
        <Field label="Palabra clave" hint="Una sola palabra. Quien la comente recibe la respuesta sin que hagas nada.">
          <Input name="reglaPalabra" maxLength={MAX_PALABRA} defaultValue={inicial?.palabra ?? ''} placeholder="GUIA" className="max-w-[16rem]" />
        </Field>
        <Field label="Mensaje" hint="Pon el enlace aquí; si es de tu sitio se mide solo en Analítica.">
          <Textarea name="reglaMensaje" rows={3} maxLength={MAX_MENSAJE} defaultValue={inicial?.mensaje ?? ''} placeholder="Acá tienes la guía: https://…" />
        </Field>
        <Field label="Respuesta pública" hint="Lo que se responde al comentario cuando el mensaje sí salió por privado.">
          <Input name="reglaRespuesta" maxLength={MAX_RESPUESTA} defaultValue={inicial?.respuestaPublica ?? RESPUESTA_PUBLICA_POR_DEFECTO} />
        </Field>
        <p className="text-[0.72rem] text-fg-faint">
          En TikTok y YouTube, o mientras el privado esté apagado, el mensaje se publica como respuesta al comentario.
        </p>
      </div>
    </details>
  )
}
