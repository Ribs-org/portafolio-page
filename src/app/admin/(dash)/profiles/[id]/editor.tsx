'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Check, Copy, Eye, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Panel } from '@/components/charts/panel'
import { ImageField } from '@/components/image-field'
import { ProfileView } from '@/components/profile-view'
import { Button, Field, Input, Select, Textarea, Toggle } from '@/components/ui'
import type { Profile } from '@/db'
import { cn } from '@/lib/utils'
import {
  createLink,
  deleteProfile,
  reorderLinks,
  rotateSlug,
  updateProfile,
  type FormState,
} from '../../../actions'
import { LinkRow, type DraftLink } from './link-row'

const ACCENTS = ['#8b7cff', '#f0885a', '#4ade80', '#38bdf8', '#f472b6', '#facc15', '#f87171', '#a3e635']

type Props = {
  profile: Profile
  initialLinks: DraftLink[]
  origin: string
}

export function ProfileEditor({ profile, initialLinks, origin }: Props) {
  const router = useRouter()
  const [links, setLinks] = useState(initialLinks)
  const [draft, setDraft] = useState({
    displayName: profile.displayName,
    slug: profile.slug,
    headline: profile.headline ?? '',
    bio: profile.bio ?? '',
    avatarUrl: profile.avatarUrl,
    ogImageUrl: profile.ogImageUrl,
    accentColor: profile.accentColor,
    isPublished: profile.isPublished,
    noindex: profile.noindex,
  })
  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  // Re-sync after a server action adds or removes a row. Comparing the id list
  // rather than array identity keeps unsaved edits alive through unrelated
  // refreshes — only a changed set of rows resets the local copy.
  const signature = initialLinks.map((link) => link.id).join(',')
  const [syncedSignature, setSyncedSignature] = useState(signature)
  if (signature !== syncedSignature) {
    setSyncedSignature(signature)
    setLinks(initialLinks)
  }

  const [profileState, saveProfile] = useActionState<FormState, FormData>(
    updateProfile.bind(null, profile.id),
    {},
  )
  const [linkState, addLink] = useActionState<FormState, FormData>(
    createLink.bind(null, profile.id),
    {},
  )

  useEffect(() => {
    if (linkState.ok) router.refresh()
  }, [linkState, router])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const publicPath = profile.isDefault ? '/' : `/${draft.slug}`
  const publicUrl = `${origin}${publicPath}`

  const previewLinks = useMemo(
    () =>
      links
        .filter((link) => link.isActive)
        .map((link) => ({
          id: link.id,
          kind: link.kind,
          label: link.label,
          sublabel: link.sublabel || null,
          url: link.url,
          icon: link.icon || null,
          imageUrl: link.imageUrl,
        })),
    [links],
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = links.findIndex((link) => link.id === active.id)
    const to = links.findIndex((link) => link.id === over.id)
    const next = arrayMove(links, from, to)
    setLinks(next)

    startTransition(() => {
      void reorderLinks(
        profile.id,
        next.map((link) => link.id),
      )
    })
  }

  const preview = (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border border-white/10 bg-ink-950 shadow-2xl">
      <div className="h-[38rem] overflow-y-auto">
        <ProfileView
          profile={{
            displayName: draft.displayName,
            headline: draft.headline || null,
            bio: draft.bio || null,
            avatarUrl: draft.avatarUrl,
            accentColor: draft.accentColor,
          }}
          links={previewLinks}
          preview
        />
      </div>
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Panel title="Perfil" hint="Los cambios se ven al instante en la vista previa">
          <form action={saveProfile} className="space-y-4">
            <input type="hidden" name="avatarUrl" value={draft.avatarUrl ?? ''} />
            <ImageField
              label="Foto de perfil"
              shape="circle"
              value={draft.avatarUrl}
              onChange={(url) => setDraft((d) => ({ ...d, avatarUrl: url }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input
                  name="displayName"
                  value={draft.displayName}
                  onChange={(event) => setDraft((d) => ({ ...d, displayName: event.target.value }))}
                />
              </Field>
              <Field label="Bajada" hint="Sale arriba del nombre, en mayúsculas">
                <Input
                  name="headline"
                  value={draft.headline}
                  placeholder="Creador · Builder"
                  onChange={(event) => setDraft((d) => ({ ...d, headline: event.target.value }))}
                />
              </Field>
            </div>

            <Field label="Bio">
              <Textarea
                name="bio"
                rows={3}
                value={draft.bio}
                onChange={(event) => setDraft((d) => ({ ...d, bio: event.target.value }))}
              />
            </Field>

            <Field
              label="URL"
              hint={profile.isDefault ? 'Este perfil se sirve en la raíz del sitio.' : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-fg-faint">/</span>
                <Input
                  name="slug"
                  value={draft.slug}
                  disabled={profile.isDefault}
                  className="font-mono disabled:opacity-50"
                  onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))}
                />
              </div>
            </Field>

            <div>
              <span className="mb-1.5 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fg-faint">
                Color de acento
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Usar ${color}`}
                    onClick={() => setDraft((d) => ({ ...d, accentColor: color }))}
                    className={cn(
                      'h-7 w-7 rounded-full ring-offset-2 ring-offset-ink-950 transition-all',
                      draft.accentColor.toLowerCase() === color && 'ring-2 ring-white/60',
                    )}
                    style={{ background: color }}
                  />
                ))}
                <input
                  type="color"
                  name="accentColor"
                  value={draft.accentColor}
                  onChange={(event) => setDraft((d) => ({ ...d, accentColor: event.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                  aria-label="Color personalizado"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-white/[0.06] p-3">
              <Toggle
                label="Publicado"
                hint="Si lo apagas, la URL responde 404"
                name="isPublished"
                checked={draft.isPublished}
                onChange={(value) => setDraft((d) => ({ ...d, isPublished: value }))}
              />
              <Toggle
                label="Ocultar de buscadores"
                hint="Recomendado para el perfil privado"
                name="noindex"
                checked={draft.noindex}
                onChange={(value) => setDraft((d) => ({ ...d, noindex: value }))}
              />
            </div>

            <input type="hidden" name="ogImageUrl" value={draft.ogImageUrl ?? ''} />

            {profileState.error ? (
              <p role="alert" className="text-sm text-negative">
                {profileState.error}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary">
                Guardar perfil
              </Button>
              {profileState.ok ? (
                <span className="flex items-center gap-1 text-sm text-positive">
                  <Check className="h-4 w-4" aria-hidden /> Guardado
                </span>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel
          title="Links"
          hint="Arrastra para reordenar. El orden se guarda solo."
          action={
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg lg:hidden"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> Ver
            </button>
          }
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <ul className={cn('space-y-2 transition-opacity', pending && 'opacity-70')}>
                {links.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    profileId={profile.id}
                    onChange={(patch) =>
                      setLinks((current) =>
                        current.map((item) => (item.id === link.id ? { ...item, ...patch } : item)),
                      )
                    }
                    onRemoved={() =>
                      setLinks((current) => current.filter((item) => item.id !== link.id))
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {links.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-faint">
              Sin links todavía. Agrega el primero abajo.
            </p>
          ) : null}

          <form action={addLink} className="mt-4 space-y-3 rounded-xl border border-white/[0.06] p-3">
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field label="Tipo">
                <Select name="kind" defaultValue="standard">
                  <option value="standard">Link normal</option>
                  <option value="featured">Destacado</option>
                  <option value="social">Red social</option>
                  <option value="booking">Agendar</option>
                </Select>
              </Field>
              <Field label="Nombre">
                <Input name="label" placeholder="Mi proyecto" required />
              </Field>
            </div>
            <Field label="URL">
              <Input name="url" placeholder="ejemplo.com" inputMode="url" required />
            </Field>
            <input type="hidden" name="isActive" value="on" />

            {linkState.error ? (
              <p role="alert" className="text-sm text-negative">
                {linkState.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary">
              <Plus className="h-4 w-4" aria-hidden /> Agregar link
            </Button>
          </form>
        </Panel>

        <Panel title="Compartir">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-sm">
              {publicUrl}
            </code>
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(publicUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              }}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="mt-3 text-[0.8rem] leading-relaxed text-fg-muted">
            Para saber qué contenido te trae tráfico, agrega{' '}
            <code className="font-mono text-fg">?s=lo-que-sea</code> al final:{' '}
            <code className="font-mono text-fg-muted">{publicUrl}?s=reel-agosto</code>. Cada
            etiqueta aparece por separado en Analítica.
          </p>
        </Panel>

        <Panel title="Zona peligrosa">
          <div className="flex flex-wrap gap-2">
            {!profile.isDefault ? (
              <Button
                type="button"
                onClick={() => {
                  if (!confirm('Se generará una URL nueva y la actual dejará de funcionar.')) return
                  startTransition(() => {
                    void rotateSlug(profile.id).then(() => router.refresh())
                  })
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Cambiar la URL secreta
              </Button>
            ) : null}
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (!confirm(`Se borra "${profile.displayName}" con sus links y métricas. ¿Seguir?`))
                  return
                startTransition(() => {
                  void deleteProfile(profile.id)
                })
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Borrar perfil
            </Button>
          </div>
        </Panel>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <p className="mb-3 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fg-faint">
            Vista previa
          </p>
          {preview}
        </div>
      </aside>

      {showPreview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-ink-900 p-2"
            aria-label="Cerrar vista previa"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {preview}
        </div>
      ) : null}
    </div>
  )
}
