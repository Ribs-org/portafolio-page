import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getDb, profiles } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { requireUser } from '@/lib/auth'
import { dominioProducto, esDominioDelProducto } from '@/lib/dominios'
import { getAllLinks } from '@/lib/profiles'
import { adminId } from '@/lib/usuarios'
import { enlacePublicoDe, rutaPublicaDe, toZonedInput } from '@/lib/utils'
import { ProfileEditor } from './editor'
import type { DraftLink } from './link-row'

export const dynamic = 'force-dynamic'

export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { id: ownerId } = await requireUser()

  const [profile] = await getDb()
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.ownerId, ownerId)))
    .limit(1)
  if (!profile) notFound()

  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const origin = `${protocol}://${host}`

  const admin = await adminId()
  // Solo el principal del admin del despliegue vive en `/`. El editor necesita saberlo
  // también para su propia vista previa de la URL, pero como componente de cliente no
  // tiene por qué conocer el id del admin: se resuelve acá y se le pasa ya el booleano.
  const ruta = rutaPublicaDe(profile, admin)
  const enRaiz = ruta === '/'
  // «Ver página» no siempre puede usar `ruta` tal cual: este host puede no servirla (la
  // principal de un invitado en un dominio que no es el del producto) o servirla en otra
  // parte (cualquier página en el dominio del producto, donde la raíz es la landing). Ver
  // el comentario de `enlacePublicoDe`.
  const hrefVerPagina = enlacePublicoDe(profile, admin, {
    enElProducto: esDominioDelProducto(host),
    dominioProducto: dominioProducto(),
  })

  const rows = await getAllLinks(ownerId, profile.id)
  const initialLinks: DraftLink[] = rows.map((link) => ({
    id: link.id,
    kind: link.kind,
    label: link.label,
    sublabel: link.sublabel ?? '',
    url: link.url,
    icon: link.icon ?? '',
    imageUrl: link.imageUrl,
    isActive: link.isActive,
    startsAt: toZonedInput(link.startsAt, SITE_TIMEZONE),
    endsAt: toZonedInput(link.endsAt, SITE_TIMEZONE),
  }))

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/admin/profiles"
          className="rounded-lg p-1.5 text-fg-faint transition-colors hover:text-fg"
          aria-label="Volver a perfiles"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <h1 className="font-titulo text-2xl font-semibold uppercase tracking-[0.03em]">
          {profile.displayName}
        </h1>
        <a
          href={hrefVerPagina}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          Ver página <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </header>

      <ProfileEditor profile={profile} initialLinks={initialLinks} origin={origin} enRaiz={enRaiz} />
    </>
  )
}
