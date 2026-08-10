'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { uploadImage } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  hint?: string
  shape?: 'circle' | 'wide'
}

export function ImageField({ label, value, onChange, hint, shape = 'wide' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleFile(file: File) {
    setError(null)
    const data = new FormData()
    data.set('file', file)

    startTransition(async () => {
      const result = await uploadImage(data)
      if (result.error) setError(result.error)
      else if (result.url) onChange(result.url)
    })
  }

  return (
    <div>
      <span className="mb-1.5 block font-mono text-[0.62rem] uppercase tracking-[0.16em] text-fg-faint">
        {label}
      </span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className={cn(
            'relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-white/15 bg-white/[0.03] transition-colors hover:border-white/30',
            shape === 'circle' ? 'h-16 w-16 rounded-full' : 'h-16 w-28 rounded-xl',
          )}
        >
          {value ? (
            // Arbitrary blob host; next/image is reserved for the public page.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-fg-faint" aria-hidden />
          )}
          {pending ? (
            <span className="absolute inset-0 grid place-items-center bg-ink-950/70">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={pending}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              {value ? 'Cambiar' : 'Subir imagen'}
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-faint transition-colors hover:text-negative"
              >
                <X className="h-3 w-3" aria-hidden /> Quitar
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-1 text-[0.72rem] text-negative">
              {error}
            </p>
          ) : hint ? (
            <p className="mt-1 text-[0.72rem] text-fg-faint">{hint}</p>
          ) : null}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) handleFile(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
