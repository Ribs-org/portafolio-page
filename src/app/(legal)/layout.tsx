import Link from 'next/link'

/**
 * Shared shell for the legal pages. They are plain documents, so they get the site's
 * backdrop and typography but none of the profile chrome — no avatar, no links, no
 * accent colour, since there is no profile in scope here.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="aurora opacity-30" aria-hidden>
        <span />
      </div>

      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-6 sm:py-24">
        {children}

        <footer className="mt-16 border-t border-white/[0.06] pt-6">
          <Link
            href="/"
            className="text-sm text-fg-faint transition-colors hover:text-fg-muted"
          >
            ← Volver al inicio
          </Link>
        </footer>
      </main>
    </div>
  )
}
