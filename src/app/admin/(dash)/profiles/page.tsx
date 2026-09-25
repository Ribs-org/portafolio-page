import { headers } from 'next/headers'
import Link from 'next/link'
import { ExternalLink, Plus, Star } from 'lucide-react'
import { Submit } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { dominioProducto, esDominioDelProducto } from '@/lib/dominios'
import { getAllLinks, getAllProfiles } from '@/lib/profiles'
import { adminId } from '@/lib/usuarios'
import { enlacePublicoDe, rutaMostradaDe } from '@/lib/utils'
import { createProfile, makeDefault } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function ProfilesPage() {
  const { id: ownerId } = await requireUser()
  // Solo el principal del admin del despliegue vive en `/`; el de cualquier otro usuario
  // vive en su propia dirección. Ver el comentario de `rutaPublicaDe`.
  const admin = await adminId()
  const host = (await headers()).get('host')
  // Para que «abrir» enlace a un host que de verdad sirva la página. Ver el comentario de
  // `enlacePublicoDe`.
  const dominio = { enElProducto: esDominioDelProducto(host), dominioProducto: dominioProducto() }
  const profiles = await getAllProfiles(ownerId)
  const counts = await Promise.all(
    profiles.map(async (profile) => (await getAllLinks(ownerId, profile.id)).length),
  )

  return (
    <>
      <header className="mb-6 flex items-end gap-4">
        <div>
          <h1 className="font-titulo text-2xl font-semibold uppercase tracking-[0.03em]">Perfiles</h1>
          <p className="mt-1 text-sm text-fg-muted">
            El perfil principal se sirve en <code className="font-mono">/</code>. El resto vive en
            su propia URL.
          </p>
        </div>
        <form action={createProfile} className="ml-auto">
          <Submit pendingLabel="Creando…" icono={<Plus className="h-4 w-4" aria-hidden />}>
            Nuevo perfil
          </Submit>
        </form>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {profiles.map((profile, i) => (
          <li key={profile.id} className="chapa chapa-hover rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-1 h-10 w-1 shrink-0 rounded-full"
                style={{ background: profile.accentColor }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-titulo font-semibold uppercase tracking-[0.03em]">
                    {profile.displayName}
                  </h2>
                  {profile.isDefault ? (
                    <span className="rounded-md bg-white/[0.1] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-fg-muted">
                      principal
                    </span>
                  ) : null}
                  {!profile.isPublished ? (
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-fg-faint">
                      borrador
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate font-mono text-[0.72rem] text-fg-faint">
                  {rutaMostradaDe(profile, admin, dominio)}
                </p>
                <p className="mt-2 text-[0.78rem] text-fg-muted">
                  {counts[i]} link{counts[i] === 1 ? '' : 's'}
                  {profile.noindex ? ' · oculto a buscadores' : ''}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Link
                href={`/admin/profiles/${profile.id}`}
                className="rounded-xl bg-white/[0.1] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/[0.16]"
              >
                Editar
              </Link>
              <a
                href={enlacePublicoDe(profile, admin, dominio)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
              >
                Abrir <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              {!profile.isDefault ? (
                <form action={makeDefault.bind(null, profile.id)} className="ml-auto">
                  {/* Cambia qué perfil ve cualquiera que entre a la raíz del sitio: es la
                      única acción de esta página que se nota fuera del panel. */}
                  <Submit
                    variant="ghost"
                    title="Servir este perfil en /"
                    className="border-transparent px-2.5 py-1.5 text-xs text-fg-faint"
                    pendingLabel="Cambiando…"
                    icono={<Star className="h-3.5 w-3.5" aria-hidden />}
                    confirm={`«${profile.displayName}» se servirá en / y el perfil principal de ahora pasará a su propia URL. Si era borrador, queda publicado. ¿Seguir?`}
                  >
                    Hacer principal
                  </Submit>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
