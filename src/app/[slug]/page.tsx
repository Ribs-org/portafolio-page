import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { esDominioDelProducto } from '@/lib/dominios'
import { getProfileBySlug } from '@/lib/profiles'
import { profileMetadata, renderProfile, type SearchParams } from '@/lib/serve-profile'
import { adminId } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

/**
 * Un dominio sirve las páginas de su dueño; el del producto las sirve todas.
 *
 * «El dueño del dominio» hoy es siempre el admin, porque no existe una tabla que relacione
 * dominios con usuarios. Es deliberado: la regla queda escrita y el día que haya dominios
 * de terceros se reemplaza solo esta resolución.
 *
 * Envuelta en `cache()`: `load()` corre dos veces por petición (`generateMetadata` y la
 * página), y cada una llamaría a `adminId()` — un `SELECT` — de nuevo. `cache()` comparte
 * el resultado entre las dos pasadas del mismo render, así que la consulta sale una sola
 * vez por visita en vez de dos.
 */
const duenoDelDominio = cache(async (): Promise<string | undefined> => {
  const host = (await headers()).get('host')
  return esDominioDelProducto(host) ? undefined : await adminId()
})

async function load(slug: string) {
  try {
    const profile = await getProfileBySlug(slug, await duenoDelDominio())
    return profile?.isPublished ? profile : null
  } catch (error) {
    // Silencioso a propósito hacia el visitante (sigue siendo un 404), pero no hacia los
    // registros: si `adminId()` lanza (por ejemplo, ADMIN_EMAIL rota), esto deja el
    // dominio personal entero respondiendo 404 sin un solo indicio de por qué. Sin este
    // log, esa falla es indistinguible de «esta dirección no existe».
    console.error('[slug]/page: no se pudo resolver el perfil', { slug, error })
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const profile = await load((await params).slug)
  return profile ? profileMetadata(profile) : { title: 'No encontrado' }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const profile = await load((await params).slug)
  if (!profile) notFound()
  return renderProfile(profile, await searchParams)
}
