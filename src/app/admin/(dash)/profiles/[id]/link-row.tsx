'use client'

import { useActionState, useId, useState, useTransition } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import { ICON_NAMES } from '@/components/icon'
import { ImageField } from '@/components/image-field'
import { Button, Field, Input, Select, Switch } from '@/components/ui'
import { cn, displayHost } from '@/lib/utils'
import { deleteLink, updateLink, type FormState } from '../../../actions'

export type DraftLink = {
  id: string
  kind: string
  label: string
  sublabel: string
  url: string
  icon: string
  imageUrl: string | null
  isActive: boolean
  startsAt: string
  endsAt: string
}

const KIND_LABELS: Record<string, string> = {
  standard: 'Link normal',
  featured: 'Destacado con imagen',
  social: 'Red social (icono arriba)',
  booking: 'Agendar (bloque especial)',
}

export function LinkRow({
  link,
  profileId,
  onChange,
  onRemoved,
}: {
  link: DraftLink
  profileId: string
  onChange: (patch: Partial<DraftLink>) => void
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const listId = useId()

  const [state, formAction, saving] = useActionState<FormState, FormData>(
    updateLink.bind(null, link.id, profileId),
    {},
  )
  const saved = state.ok === true && !saving

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
  })

  const showImage = link.kind === 'featured' || link.kind === 'standard'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'surface rounded-2xl',
        isDragging && 'z-10 opacity-90 shadow-2xl',
        !link.isActive && 'opacity-55',
      )}
    >
      <div className="flex items-center gap-1 p-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${link.label}`}
          className="cursor-grab touch-none rounded-lg p-1.5 text-fg-faint transition-colors hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{link.label || 'Sin nombre'}</span>
            <span className="block truncate font-mono text-[0.68rem] text-fg-faint">
              {KIND_LABELS[link.kind] ?? link.kind} · {displayHost(link.url)}
            </span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-fg-faint transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>

        <Switch
          label={`${link.isActive ? 'Apagar' : 'Prender'} ${link.label || 'este link'}`}
          checked={link.isActive}
          onChange={(value) => {
            onChange({ isActive: value })
            const data = new FormData()
            data.set('kind', link.kind)
            data.set('label', link.label)
            data.set('sublabel', link.sublabel)
            data.set('url', link.url)
            data.set('icon', link.icon)
            data.set('imageUrl', link.imageUrl ?? '')
            data.set('startsAt', link.startsAt)
            data.set('endsAt', link.endsAt)
            if (value) data.set('isActive', 'on')
            startTransition(() => {
              void updateLink(link.id, profileId, {}, data)
            })
          }}
        />
      </div>

      {open ? (
        <form action={formAction} className="space-y-3 border-t border-white/[0.06] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <Select
                name="kind"
                value={link.kind}
                onChange={(event) => onChange({ kind: event.target.value })}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Icono" hint="Un nombre conocido o cualquier emoji">
              <Input
                name="icon"
                list={listId}
                value={link.icon}
                placeholder="instagram, github, 🎧…"
                onChange={(event) => onChange({ icon: event.target.value })}
              />
              <datalist id={listId}>
                {ICON_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label="Nombre">
            <Input
              name="label"
              value={link.label}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </Field>

          <Field label="Descripción corta">
            <Input
              name="sublabel"
              value={link.sublabel}
              placeholder="Opcional"
              onChange={(event) => onChange({ sublabel: event.target.value })}
            />
          </Field>

          <Field label="URL">
            <Input
              name="url"
              value={link.url}
              inputMode="url"
              onChange={(event) => onChange({ url: event.target.value })}
            />
          </Field>

          {showImage ? (
            <>
              <input type="hidden" name="imageUrl" value={link.imageUrl ?? ''} />
              <ImageField
                label="Imagen"
                value={link.imageUrl}
                onChange={(url) => onChange({ imageUrl: url })}
                hint={link.kind === 'featured' ? 'Se muestra grande, ideal 16:9' : 'Reemplaza al icono'}
              />
            </>
          ) : null}

          <details className="rounded-xl border border-white/[0.06] px-3 py-2">
            <summary className="cursor-pointer text-[0.8rem] text-fg-muted">
              Programar visibilidad
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Aparece desde">
                <Input
                  type="datetime-local"
                  name="startsAt"
                  value={link.startsAt}
                  onChange={(event) => onChange({ startsAt: event.target.value })}
                />
              </Field>
              <Field label="Desaparece">
                <Input
                  type="datetime-local"
                  name="endsAt"
                  value={link.endsAt}
                  onChange={(event) => onChange({ endsAt: event.target.value })}
                />
              </Field>
            </div>
          </details>

          {link.isActive ? <input type="hidden" name="isActive" value="on" /> : null}

          {state.error ? (
            <p role="alert" className="text-sm text-negative">
              {state.error}
            </p>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={pending || saving}>
              {saving ? (
                'Guardando…'
              ) : saved ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Guardado
                </>
              ) : (
                'Guardar link'
              )}
            </Button>

            <Button
              type="button"
              variant="danger"
              className="ml-auto"
              onClick={() => {
                if (!confirm(`¿Borrar "${link.label}"?`)) return
                onRemoved()
                startTransition(() => {
                  void deleteLink(link.id, profileId)
                })
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Borrar
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
