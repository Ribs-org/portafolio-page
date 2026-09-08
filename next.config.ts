import type { NextConfig } from 'next'

/**
 * `next.config.ts` no forma parte del grafo de módulos de la app —importar `env()`
 * de `src/lib/env.ts` aquí no vale la pena—, así que este es el único lugar del
 * código donde leer `process.env` directamente es correcto. Next.js evalúa este
 * archivo en build time y Vercel expone las variables de entorno en ese momento.
 */
function hostR2(): string | null {
  const base = process.env.R2_PUBLIC_BASE?.trim()
  if (!base) return null
  try {
    const { protocol, hostname } = new URL(base)
    if (protocol !== 'https:') return null
    return hostname
  } catch {
    // R2_PUBLIC_BASE mal formado: se omite el patrón en vez de romper el build.
    return null
  }
}

const hostnameR2 = hostR2()

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // El host sale de R2_PUBLIC_BASE en vez de ir literal: así ambos no pueden
      // desincronizarse. Si falta o está mal formada, se omite el patrón —el avatar
      // del perfil público (src/components/profile-view.tsx) deja de renderizar,
      // pero el build no se rompe.
      ...(hostnameR2 ? [{ protocol: 'https' as const, hostname: hostnameR2 }] : []),
      // Transitorios: la migración de Vercel Blob a R2 (scripts/migrate-blobs.ts)
      // todavía no corrió, así que toda URL en la base de datos hoy sigue apuntando
      // acá. Deben quedarse hasta que la migración termine — se borran en el mismo
      // commit que borra src/lib/storage-migracion.ts y scripts/migrate-blobs.ts,
      // que es cuando ninguna fila puede referenciar ya este host.
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '**.blob.vercel-storage.com' },
      // Post thumbnails from the connected networks. Rendered with `unoptimized`:
      // these URLs expire in hours, so caching an optimized copy just goes stale.
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
  },
}

export default nextConfig
