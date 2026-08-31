import { asc, eq } from 'drizzle-orm'
import { getDb, scheduledPosts, scheduledPostTargets } from '@/db'
import { Composer } from './composer'
import { Queue } from './queue'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const db = getDb()
  const rows = await db
    .select({ post: scheduledPosts, target: scheduledPostTargets })
    .from(scheduledPosts)
    .innerJoin(scheduledPostTargets, eq(scheduledPostTargets.postId, scheduledPosts.id))
    .orderBy(asc(scheduledPosts.scheduledAt))

  const posts = new Map<string, { post: (typeof rows)[number]['post']; targets: Array<(typeof rows)[number]['target']> }>()
  for (const row of rows) {
    const entry = posts.get(row.post.id) ?? { post: row.post, targets: [] }
    entry.targets.push(row.target)
    posts.set(row.post.id, entry)
  }

  return (
    <div className="space-y-6">
      <Composer />
      <Queue items={[...posts.values()]} />
    </div>
  )
}
