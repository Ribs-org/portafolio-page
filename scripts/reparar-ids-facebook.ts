/**
 * Repara los `externalId` de Facebook que quedaron en el espacio de ids equivocado.
 *
 * El publicador guardaba el id propio del video (o el `post_id` pelado), mientras el
 * conector de lectura lista `/{page}/published_posts` y guarda `páginaID_postID`. Sin
 * el mismo id en los dos lados, las métricas de un post de Facebook nunca se unen con
 * los atributos con que se programó. El publicador ya compone bien; esto arregla lo
 * que se publicó antes.
 *
 * Para cada destino publicado cuyo id no tenga la forma compuesta, pregunta a Graph
 * el `post_id` del video y lo guarda como `páginaID_postID`. Un id que ya viene
 * compuesto se deja; uno que Graph no resuelve se reporta y no se toca.
 *
 * Uso:
 *   npx dotenv -e .env.local -- npx tsx scripts/reparar-ids-facebook.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/reparar-ids-facebook.ts --aplicar
 *
 * Antes de aplicar escribe el mapa viejo→nuevo en scripts/fb-ids-<fecha>.json, para
 * poder revertir.
 */
import { createDecipheriv, hkdfSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const dbUrl = process.env.DATABASE_URL
const secret = process.env.AUTH_SECRET
if (!dbUrl || !secret) throw new Error('Faltan DATABASE_URL y AUTH_SECRET')
const sql = neon(dbUrl)
const aplicar = process.argv.includes('--aplicar')

/** Mismo esquema que `@/lib/social/crypto`: AES-256-GCM con clave derivada por HKDF. */
function decrypt(stored: string): string {
  const key = Buffer.from(hkdfSync('sha256', secret!, 'portafolio-social-v1', 'token', 32))
  const [, iv, tag, body] = stored.split('.')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv!, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag!, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body!, 'base64url')), decipher.final()]).toString(
    'utf8',
  )
}

async function main() {
  const [account] = await sql`
    select external_id, access_token from social_accounts where network = 'facebook'
  `
  if (!account?.access_token) throw new Error('Facebook no está conectado')

  const pageId = account.external_id as string
  const token = decrypt(account.access_token as string)

  const rotos = await sql`
    select t.id, t.external_id, p.caption
    from scheduled_post_targets t
    join scheduled_posts p on p.id = t.post_id
    where t.network = 'facebook'
      and t.status = 'published'
      and position('_' in t.external_id) = 0
    order by p.scheduled_at
  `

  console.log(`página: ${pageId}`)
  console.log(`destinos con id en el espacio equivocado: ${rotos.length}`)

  const cambios: Array<{ id: string; viejo: string; nuevo: string }> = []
  for (const row of rotos) {
    const viejo = row.external_id as string
    // Un post_id pelado (los que guardó la versión intermedia del publicador) solo
    // necesita el prefijo; un id de video hay que resolverlo contra Graph.
    let postId: string | null = null

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${viejo}?fields=post_id&access_token=${token}`,
    )
    const payload = (await response.json()) as { post_id?: string; error?: { message?: string } }
    if (typeof payload.post_id === 'string') postId = payload.post_id
    else if (payload.error?.message?.includes('singular statuses API is deprecated')) postId = viejo

    if (!postId) {
      console.log(`  ${viejo} → sin resolver: ${payload.error?.message?.slice(0, 60) ?? '?'}`)
      continue
    }

    const nuevo = `${pageId}_${postId}`
    const [metricas] = await sql`
      select 1 as x from social_posts where network = 'facebook' and external_id = ${nuevo}
    `
    console.log(
      `  ${viejo} → ${nuevo} ${metricas ? '(calza con métricas ✓)' : '(aún sin sincronizar)'} | ${String(row.caption ?? '').slice(0, 22)}`,
    )
    cambios.push({ id: row.id as string, viejo, nuevo })
  }

  console.log(`\nresueltos: ${cambios.length} de ${rotos.length}`)
  if (!aplicar) {
    console.log('Marcha en seco. Repite con --aplicar para escribir.')
    return
  }
  if (cambios.length === 0) return

  const respaldo = `scripts/fb-ids-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(respaldo, JSON.stringify(cambios, null, 2))
  console.log(`Respaldo en ${respaldo}`)

  for (const c of cambios) {
    await sql`update scheduled_post_targets set external_id = ${c.nuevo} where id = ${c.id}`
  }
  console.log('Reparados.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
