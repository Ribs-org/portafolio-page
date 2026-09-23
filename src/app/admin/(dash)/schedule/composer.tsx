'use client'

import { useActionState, useId, useState } from 'react'
import { createScheduledPost, type FormState } from '@/app/admin/actions'
import { Button, Field, GroupLabel, Input, Submit, Textarea } from '@/components/ui'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { calorDelDia, type Calor } from '@/lib/parrilla'
import { subirArchivos } from '@/lib/subida-directa'
import { cn } from '@/lib/utils'
import { ReglaClave } from './regla-clave'
import { RevisionMedia } from './revision-media'
import { TikTokOpciones } from './tiktok-opciones'

// Twin of PUBLISHABLE (publish/batch.ts). NETWORKS in the editor
// (schedule/[id]/editor.tsx) deliberately lacks tiktok: the editor cannot collect
// its options, so that destination is created here or in the batch only.
const ENABLED = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])

/**
 * Cómo está la parrilla del día que se eligió.
 *
 * Es la única de las tres piezas de esta tanda que habla antes de que pase algo: el
 * termómetro y el fierro describen, esta aconseja. Y aconseja lo que el producto
 * promete —repartir el volumen— en el único momento en que se puede hacer algo al
 * respecto, que es mientras se elige la hora.
 */
function CargaDelDia({ carga, cuando }: { carga: Record<string, number>; cuando: string }) {
  // El campo viene «YYYY-MM-DDTHH:MM» en hora del sitio, o vacío, o a medio escribir.
  const dia = cuando.slice(0, 10)
  if (dia.length !== 10) return null

  const cortes = carga[dia] ?? 0
  const calor = calorDelDia(cortes)

  return (
    <p className="mt-1.5 flex items-center gap-2 text-[0.72rem] text-fg-muted">
      <span className={cn('grilla h-3 w-6 shrink-0', CLASE_CALOR[calor])} aria-hidden />
      {calor === 'apagada'
        ? 'Ese día está apagado. Buen lugar para este.'
        : calor === 'llena'
          ? `Ese día ya va lleno, con ${cortes}. Mira si te sirve uno más flojo.`
          : `Ese día ya tiene ${cortes === 1 ? 'un corte' : `${cortes} cortes`}.`}
    </p>
  )
}

const CLASE_CALOR: Record<Calor, string> = {
  apagada: 'grilla-apagada',
  prendida: 'grilla-prendida',
  llena: 'grilla-llena',
}

export function Composer({ carga }: { carga: Record<string, number> }) {
  const captionId = useId()
  const [tiktok, setTiktok] = useState(false)
  const [soloFotos, setSoloFotos] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [cuando, setCuando] = useState('')
  // «Ahora» deja el campo de fecha fuera de juego: la hora la decide el servidor.
  const [ahora, setAhora] = useState(false)
  // Lo que se muestra mientras el navegador sube, que con un video puede tardar.
  const [subiendo, setSubiendo] = useState('')

  /**
   * Sube los archivos a R2 antes de llamar a la acción, y le manda solo las URLs.
   *
   * Mandarlos dentro del formulario devolvía `413`: Vercel corta los cuerpos de petición
   * en ~4,5 MB y un video no entra. Ver `lib/subida-directa` y `docs/deuda-tecnica.md`.
   *
   * Al ser una función del cliente, este formulario deja de andar sin JavaScript. Para el
   * panel es aceptable; para la página pública no lo sería.
   */
  const [state, action] = useActionState(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      let media: Awaited<ReturnType<typeof subirArchivos>>
      try {
        media = await subirArchivos(archivos, (hechos, total) =>
          setSubiendo(total > 1 ? `Subiendo ${hechos} de ${total}…` : 'Subiendo…'),
        )
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'No se pudo subir el archivo.' }
      } finally {
        setSubiendo('')
      }
      formData.set('mediaSubida', JSON.stringify(media))
      return createScheduledPost(prev, formData)
    },
    {},
  )

  return (
    <details
      className="rounded-xl bg-white/[0.03] p-4"
      onToggle={(event) => {
        // `Textarea` solo acepta las props del `<textarea>`, así que no hay `ref` que
        // pasarle; y el campo ya está montado dentro del `<details>`, de modo que
        // `autoFocus` no se dispararía al abrirlo.
        if (event.currentTarget.open) document.getElementById(captionId)?.focus()
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">Programar una publicación</summary>

      <form action={action} className="mt-4 space-y-4">
        <Field label="Texto">
          <Textarea id={captionId} name="caption" rows={4} maxLength={2200} placeholder="Texto del post…" />
        </Field>

        <Field label="Archivos" hint="Imágenes o video, opcional">
          <Input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setArchivos(files)
              setSoloFotos(files.length > 0 && files.every((f) => f.type.startsWith('image/')))
            }}
          />
        </Field>

        <RevisionMedia files={archivos} activo={tiktok} />

        <div>
          <GroupLabel>Redes</GroupLabel>
          <div className="flex flex-wrap gap-3">
            {SOCIAL_NETWORKS.map((network) => {
              const enabled = ENABLED.has(network)
              return (
                <label
                  key={network}
                  className={cn('flex items-center gap-2 text-sm', !enabled && 'opacity-40')}
                >
                  <input
                    type="checkbox"
                    name="networks"
                    value={network}
                    disabled={!enabled}
                    defaultChecked={network === 'instagram'}
                    onChange={network === 'tiktok' ? (e) => setTiktok(e.target.checked) : undefined}
                  />
                  {networkLabel(network)}
                  {!enabled && <span className="text-xs text-fg-faint">próximamente</span>}
                </label>
              )
            })}
          </div>
        </div>

        {tiktok ? <TikTokOpciones soloFotos={soloFotos} /> : null}

        <ReglaClave />

        <Field label="Fecha y hora">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              name="scheduledAt"
              required={!ahora}
              disabled={ahora}
              className="max-w-[16rem]"
              value={ahora ? '' : cuando}
              onChange={(event) => setCuando(event.target.value)}
            />
            {/*
              «Ahora» no escribe una hora en el campo: manda una marca y la hora la pone el
              servidor. El reloj del navegador puede ir atrasado, y entonces el minuto que
              sumáramos aquí caería en el pasado del servidor y la validación lo rechazaría.
            */}
            <Button type="button" variant={ahora ? 'primary' : 'ghost'} onClick={() => setAhora(!ahora)}>
              Ahora
            </Button>
            {ahora ? <input type="hidden" name="cuandoAhora" value="on" /> : null}
          </div>
          {/* Con «Ahora» no hay día que mirar: la hora la pone el servidor al enviar. */}
          {ahora ? null : <CargaDelDia carga={carga} cuando={cuando} />}
        </Field>

        {subiendo ? <p className="text-sm text-fg-muted">{subiendo}</p> : null}
        {state.error && <p className="text-sm text-negative">{state.error}</p>}
        {state.ok && <p className="text-sm text-positive">Programado.</p>}

        <Submit pendingLabel="Guardando…">Programar</Submit>
      </form>
    </details>
  )
}
