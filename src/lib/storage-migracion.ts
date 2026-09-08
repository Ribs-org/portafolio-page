/**
 * Reconoce una URL que todavía apunta a Vercel Blob.
 *
 * Existe solo para la migración a R2: cuando ninguna fila devuelva true, este módulo
 * y su prueba se borran junto con `scripts/migrate-blobs.ts`.
 */
export function esUrlVercelBlob(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  // El host completo, no un `includes`: `blob.vercel-storage.com.otracosa.com` no es esto.
  return host === 'blob.vercel-storage.com' || host.endsWith('.blob.vercel-storage.com')
}
