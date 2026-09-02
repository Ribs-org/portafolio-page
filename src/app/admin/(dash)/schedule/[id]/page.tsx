import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets, scheduledPostMedia } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'
import { toZonedInput } from '@/lib/utils'
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

  const db = getDb()
  const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id))
  if (!post) notFound()

  const [targets, media] = await Promise.all([
    db.select().from(scheduledPostTargets).where(eq(scheduledPostTargets.postId, id)),
    db
      .select()
      .from(scheduledPostMedia)
      .where(eq(scheduledPostMedia.postId, id))
      .orderBy(asc(scheduledPostMedia.position)),
  ])

  return (
    <Editor
      postId={id}
      volver={volver}
      caption={post.caption}
      scheduledAtLocal={toZonedInput(post.scheduledAt, SITE_TIMEZONE)}
      targets={targets.map((t) => ({ network: t.network, status: t.status }))}
      media={media.map((m) => ({ id: m.id, blobUrl: m.blobUrl, mediaType: m.mediaType }))}
    />
  )
}
