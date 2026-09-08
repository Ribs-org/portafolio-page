/**
 * Mueve a R2 toda la media que todavía vive en Vercel Blob.
 *
 * Por cada URL de Vercel Blob guardada en las cinco columnas: la descarga (son
 * públicas, basta un fetch), la sube a R2 con la misma key, y reescribe la columna.
 * No borra nada de Vercel: eso se hace de una vez eliminando el store completo desde
 * el panel, cuando la verificación del final diga que ya no queda ninguna fila
 * apuntando ahí.
 *
 * Idempotente: una URL que ya apunta a R2 se salta. Si la subida o la reescritura
 * fallan, la fila queda apuntando a donde el archivo todavía está — se reintenta sin
 * pérdida.
 *
 * Uso:
 *   npm run blobs:migrar             # dry-run: imprime el plan, no escribe nada
 *   npm run blobs:migrar -- --aplicar
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import { links, profiles, scheduledPostMedia, scheduledPosts } from '../src/db/schema'
import { esUrlVercelBlob } from '../src/lib/storage-migracion'
import { guardar } from '../src/lib/storage'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('Falta DATABASE_URL')
const db = drizzle(neon(dbUrl), { schema: { profiles, links, scheduledPosts, scheduledPostMedia } })
const aplicar = process.argv.includes('--aplicar')

type Pendiente = { etiqueta: string; url: string; escribir: (nueva: string) => Promise<void> }

/** La key es el pathname del blob: así el archivo conserva su nombre en R2. */
function keyDesdeBlob(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

async function pendientes(): Promise<Pendiente[]> {
  const lista: Pendiente[] = []

  for (const p of await db.select().from(profiles)) {
    if (p.avatarUrl && esUrlVercelBlob(p.avatarUrl)) {
      lista.push({
        etiqueta: `profiles.avatar_url ${p.id}`,
        url: p.avatarUrl,
        escribir: async (nueva) =>
          void (await db.update(profiles).set({ avatarUrl: nueva }).where(eq(profiles.id, p.id))),
      })
    }
    if (p.ogImageUrl && esUrlVercelBlob(p.ogImageUrl)) {
      lista.push({
        etiqueta: `profiles.og_image_url ${p.id}`,
        url: p.ogImageUrl,
        escribir: async (nueva) =>
          void (await db.update(profiles).set({ ogImageUrl: nueva }).where(eq(profiles.id, p.id))),
      })
    }
  }

  for (const l of await db.select().from(links)) {
    if (l.imageUrl && esUrlVercelBlob(l.imageUrl)) {
      lista.push({
        etiqueta: `links.image_url ${l.id}`,
        url: l.imageUrl,
        escribir: async (nueva) =>
          void (await db.update(links).set({ imageUrl: nueva }).where(eq(links.id, l.id))),
      })
    }
  }

  for (const p of await db.select().from(scheduledPosts)) {
    if (p.coverUrl && esUrlVercelBlob(p.coverUrl)) {
      lista.push({
        etiqueta: `scheduled_posts.cover_url ${p.id}`,
        url: p.coverUrl,
        escribir: async (nueva) =>
          void (await db.update(scheduledPosts).set({ coverUrl: nueva }).where(eq(scheduledPosts.id, p.id))),
      })
    }
  }

  for (const m of await db.select().from(scheduledPostMedia)) {
    if (esUrlVercelBlob(m.blobUrl)) {
      lista.push({
        etiqueta: `scheduled_post_media.blob_url ${m.id}`,
        url: m.blobUrl,
        escribir: async (nueva) =>
          void (await db
            .update(scheduledPostMedia)
            .set({ blobUrl: nueva })
            .where(eq(scheduledPostMedia.id, m.id))),
      })
    }
  }

  return lista
}

async function main() {
  const lista = await pendientes()
  console.log(`${lista.length} URLs por migrar${aplicar ? '' : ' (dry-run, no se escribe nada)'}\n`)

  let migradas = 0
  let fallidas = 0
  for (const item of lista) {
    const key = keyDesdeBlob(item.url)
    if (!aplicar) {
      console.log(`  ${item.etiqueta}  →  ${key}`)
      continue
    }
    try {
      const respuesta = await fetch(item.url)
      if (!respuesta.ok) throw new Error(`descarga ${respuesta.status}`)
      const contentType = respuesta.headers.get('content-type') ?? 'application/octet-stream'
      const nueva = await guardar(key, await respuesta.blob(), contentType)
      await item.escribir(nueva)
      migradas += 1
      console.log(`  ✓ ${item.etiqueta}  →  ${nueva}`)
    } catch (error) {
      fallidas += 1
      console.error(`  ✗ ${item.etiqueta}: ${String(error).slice(0, 200)}`)
    }
  }

  if (aplicar) {
    console.log(`\nMigradas: ${migradas}. Fallidas: ${fallidas}.`)
    const quedan = await pendientes()
    console.log(`Filas que todavía apuntan a Vercel Blob: ${quedan.length}`)
    if (quedan.length === 0) {
      console.log('Listo. Ya puedes eliminar el store de Blob desde el panel de Vercel.')
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
