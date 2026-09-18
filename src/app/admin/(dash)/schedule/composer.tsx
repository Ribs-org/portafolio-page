'use client'

import { useActionState, useId, useState } from 'react'
import { createScheduledPost } from '@/app/admin/actions'
import { Button, Field, GroupLabel, Input, Submit, Textarea } from '@/components/ui'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'
import { ReglaClave } from './regla-clave'
import { RevisionMedia } from './revision-media'
import { TikTokOpciones } from './tiktok-opciones'

// Twin of PUBLISHABLE (publish/batch.ts). NETWORKS in the editor
// (schedule/[id]/editor.tsx) deliberately lacks tiktok: the editor cannot collect
// its options, so that destination is created here or in the batch only.
const ENABLED = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])

export function Composer() {
  const [state, action] = useActionState(createScheduledPost, {})
  const captionId = useId()
  const [tiktok, setTiktok] = useState(false)
  const [soloFotos, setSoloFotos] = useState(false)
  const [archivos, setArchivos] = useState<File[]>([])
  const [cuando, setCuando] = useState('')
  // «Ahora» deja el campo de fecha fuera de juego: la hora la decide el servidor.
  const [ahora, setAhora] = useState(false)

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
            name="media"
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
        </Field>

        {state.error && <p className="text-sm text-negative">{state.error}</p>}
        {state.ok && <p className="text-sm text-positive">Programado.</p>}

        <Submit pendingLabel="Guardando…">Programar</Submit>
      </form>
    </details>
  )
}
