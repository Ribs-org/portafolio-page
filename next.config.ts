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
  // `postgres` abre sockets con `node:net`/`node:tls`. No está en la lista que Next
  // excluye sola (ahí figura `pg`, que es otro paquete), así que se declara acá para que
  // el compilador de Server Components no lo empaquete y lo cargue con `require` nativo.
  serverExternalPackages: ['postgres'],

  /**
   * El compositor manda los archivos dentro del formulario, así que el video cruza la
   * función y queda bajo el tope de cuerpo de las acciones de servidor, que por defecto
   * es de 1 MB. Con ese default, programar una publicación con un video real devuelve
   * `413 Content Too Large` y el panel muestra la pantalla de error genérica.
   *
   * Esto es un parche: el archivo sigue cargándose entero en memoria de la función. El
   * arreglo de fondo es que el panel suba directo a R2 con una URL firmada, como ya hace
   * la app del teléfono en `api/mobile/upload-url`. Ver `docs/deuda-tecnica.md`.
   */
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
  },
  images: {
    remotePatterns: [
      // El host sale de R2_PUBLIC_BASE en vez de ir literal: así ambos no pueden
      // desincronizarse. Si falta o está mal formada, se omite el patrón —el avatar
      // del perfil público (src/components/profile-view.tsx) deja de renderizar,
      // pero el build no se rompe.
      ...(hostnameR2 ? [{ protocol: 'https' as const, hostname: hostnameR2 }] : []),
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
