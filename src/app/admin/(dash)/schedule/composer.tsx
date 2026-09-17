'use client'

import { useActionState, useId, useState } from 'react'
import { createScheduledPost } from '@/app/admin/actions'
import { Button, Field, GroupLabel, Input, Submit, Textarea } from '@/components/ui'
import { SOCIAL_NETWORKS } from '@/db/schema'
import { networkLabel } from '@/lib/networks'
import { cn, toZonedInput } from '@/lib/utils'
import { ReglaClave } from './regla-clave'
import { TikTokOpciones } from './tiktok-opciones'

// Twin of PUBLISHABLE (publish/batch.ts). NETWORKS in the editor
// (schedule/[id]/editor.tsx) deliberately lacks tiktok: the editor cannot collect
// its options, so that destination is created here or in the batch only.
const ENABLED = new Set(['instagram', 'facebook', 'youtube', 'threads', 'x', 'tiktok'])

export function Composer({ zona }: { zona: string }) {
  const [state, action] = useActionState(createScheduledPost, {})
  const captionId = useId()
  const [tiktok, setTiktok] = useState(false)
  const [soloFotos, setSoloFotos] = useState(false)
  const [cuando, setCuando] = useState('')

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
              setSoloFotos(files.length > 0 && files.every((f) => f.type.startsWith('image/')))
            }}
          />
        </Field>

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
              required
              className="max-w-[16rem]"
              value={cuando}
              onChange={(event) => setCuando(event.target.value)}
            />
            {/*
              Un minuto y no «ahora»: el cron publica lo vencido, así que una hora ya pasada
              sale igual de rápido, pero deja el calendario mostrando un futuro que nunca fue.
            */}
            <Button type="button" onClick={() => setCuando(toZonedInput(new Date(Date.now() + 60_000), zona))}>
              En un minuto
            </Button>
          </div>
        </Field>

        {state.error && <p className="text-sm text-negative">{state.error}</p>}
        {state.ok && <p className="text-sm text-positive">Programado.</p>}

        <Submit pendingLabel="Guardando…">Programar</Submit>
      </form>
    </details>
  )
}
