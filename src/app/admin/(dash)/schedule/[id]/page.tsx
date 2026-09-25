import { notFound } from 'next/navigation'
import { and, asc, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia, reglasClave } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { requireUser } from '@/lib/auth'
import { getCuentas } from '@/lib/posts'
import { toZonedInput } from '@/lib/utils'
import { resumenOpciones } from '@/lib/social/publish/opciones'
import { Editor } from './editor'

export const dynamic = 'force-dynamic'

export default async function EditScheduledPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const volver =
    typeof query.volver === 'string' && query.volver.startsWith('/admin/schedule')
      ? query.volver
      : '/admin/schedule'

  const { id: ownerId } = await requireUser()
  const db = getDb()
  const [post] = await db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.ownerId, ownerId)))
  if (!post) notFound()

  const [targets, media, [regla], cuentas] = await Promise.all([
    db.select().from(scheduledPostTargets).where(eq(scheduledPostTargets.postId, id)),
    db
      .select()
      .from(scheduledPostMedia)
      .where(eq(scheduledPostMedia.postId, id))
      .orderBy(asc(scheduledPostMedia.position)),
    db.select().from(reglasClave).where(eq(reglasClave.postId, id)),
    getCuentas(ownerId),
  ])

  return (
    <Editor
      postId={id}
      volver={volver}
      caption={post.caption}
      scheduledAtLocal={toZonedInput(post.scheduledAt, SITE_TIMEZONE)}
      cuentas={cuentas}
      targets={targets.map((t) => ({
        accountId: t.accountId,
        network: t.network,
        status: t.status,
        opciones: resumenOpciones(t.network, t.opciones),
      }))}
      media={media.map((m) => ({ id: m.id, blobUrl: m.blobUrl, mediaType: m.mediaType }))}
      coverUrl={post.coverUrl}
      atributos={post.atributos ? JSON.stringify(post.atributos, null, 2) : ''}
      regla={regla ? { palabra: regla.palabra, mensaje: regla.mensaje, respuestaPublica: regla.respuestaPublica } : null}
    />
  )
}
