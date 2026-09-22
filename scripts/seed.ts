import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { links, profiles, users } from '../src/db/schema'

/**
 * Creates the two starter profiles so the site is never empty on first load.
 * Everything here is meant to be replaced from the admin panel.
 *
 * An ownerless profile is a profile nobody sees: the panel only lists what a person owns.
 * This script runs outside Next (its own `tsx`, its own drizzle client) so it can't import
 * `src/lib/usuarios.ts` — that file carries `server-only`. It resolves the admin the same
 * way `scripts/migrar.ts` does: a query of its own against `users` by `ADMIN_EMAIL`,
 * creating the row if it isn't there yet.
 */
// Un solo cliente, cerrado abajo: `postgres-js` abre un socket real y este script, que
// antes salía solo con el HTTP sin estado, ya no terminaría por su cuenta.
let cliente: postgres.Sql | null = null

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  cliente = postgres(url)
  const db = drizzle(cliente, { schema: { profiles, links, users } })

  const existing = await db.select({ id: profiles.id }).from(profiles).limit(1)
  if (existing.length > 0) {
    console.log('Ya hay perfiles. No se sembró nada.')
    return
  }

  // Mismo criterio que `scripts/migrar.ts`: BOM y espacios fuera, minúsculas, y una fila
  // por correo (crea al admin si todavía no existe).
  const correo = process.env.ADMIN_EMAIL?.replace(/^﻿/, '').trim().toLowerCase()
  if (!correo) throw new Error('ADMIN_EMAIL is not set')
  const [admin] = await db
    .insert(users)
    .values({ correo, rol: 'admin' })
    .onConflictDoUpdate({ target: users.correo, set: { rol: 'admin' } })
    .returning({ id: users.id })
  const ownerId = admin!.id

  const publicId = randomUUID()
  const privateId = randomUUID()

  await db.insert(profiles).values([
    {
      id: publicId,
      ownerId,
      slug: 'publico',
      displayName: 'Tu nombre',
      headline: 'Creador · Builder',
      bio: 'Cambia esto desde el panel. Foto, bio, colores y links: todo se edita en /admin.',
      accentColor: '#8b7cff',
      isDefault: true,
      isPublished: true,
      noindex: false,
    },
    {
      id: privateId,
      ownerId,
      slug: `circulo-${randomUUID().slice(0, 8)}`,
      displayName: 'Tu nombre',
      headline: 'Círculo cercano',
      bio: 'Este perfil vive en una URL que solo tú compartes. Cambia el slug cuando quieras.',
      accentColor: '#f0885a',
      isDefault: false,
      isPublished: true,
      noindex: true,
    },
  ])

  await db.insert(links).values([
    { profileId: publicId, kind: 'social', label: 'Instagram', icon: 'instagram', url: 'https://instagram.com/', position: 0 },
    { profileId: publicId, kind: 'social', label: 'TikTok', icon: 'tiktok', url: 'https://tiktok.com/', position: 1 },
    { profileId: publicId, kind: 'social', label: 'GitHub', icon: 'github', url: 'https://github.com/', position: 2 },
    { profileId: publicId, kind: 'social', label: 'LinkedIn', icon: 'linkedin', url: 'https://linkedin.com/in/', position: 3 },
    {
      profileId: publicId,
      kind: 'featured',
      label: 'Lo que estoy construyendo',
      sublabel: 'El proyecto en el que estoy metido ahora',
      icon: 'project',
      url: 'https://example.com',
      position: 4,
    },
    {
      profileId: publicId,
      kind: 'booking',
      label: 'Agenda una llamada',
      sublabel: '30 minutos, sin vueltas',
      icon: 'cal',
      url: 'https://cal.com/',
      position: 5,
    },
    { profileId: publicId, kind: 'standard', label: 'Mi sitio', icon: 'web', url: 'https://example.com', position: 6 },

    { profileId: privateId, kind: 'social', label: 'Instagram', icon: 'instagram', url: 'https://instagram.com/', position: 0 },
    { profileId: privateId, kind: 'social', label: 'LinkedIn', icon: 'linkedin', url: 'https://linkedin.com/in/', position: 1 },
    {
      profileId: privateId,
      kind: 'booking',
      label: 'Agenda conmigo',
      sublabel: 'Directo a mi calendario',
      icon: 'cal',
      url: 'https://cal.com/',
      position: 2,
    },
  ])

  console.log('Perfiles creados: /  y  /circulo-…')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => cliente?.end())
