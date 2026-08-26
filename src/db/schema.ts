import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/** A public page. The default one is served at `/`, the rest at `/<slug>`. */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  headline: text('headline'),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  accentColor: text('accent_color').notNull().default('#8b7cff'),
  backgroundStyle: text('background_style').notNull().default('aurora'),
  ogImageUrl: text('og_image_url'),
  isDefault: boolean('is_default').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  /** Private profiles opt out of search engines and the sitemap. */
  noindex: boolean('noindex').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** `featured` renders as a large image card, `social` as an icon in the top row. */
export const LINK_KINDS = ['featured', 'standard', 'social', 'booking'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('standard'),
    label: text('label').notNull(),
    sublabel: text('sublabel'),
    url: text('url').notNull(),
    icon: text('icon'),
    imageUrl: text('image_url'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('links_profile_position_idx').on(t.profileId, t.position)],
)

/**
 * One row per page view. `visitorHash` is SHA-256 over IP + user agent + a secret
 * salt + the UTC date, so the raw IP is never stored and the hash rotates daily.
 */
export const visits = pgTable(
  'visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    visitorHash: text('visitor_hash').notNull(),
    country: text('country'),
    region: text('region'),
    city: text('city'),
    timezone: text('timezone'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    deviceType: text('device_type'),
    os: text('os'),
    browser: text('browser'),
    referrer: text('referrer'),
    /** Normalised source: instagram, tiktok, x, youtube, direct, ... */
    referrerNetwork: text('referrer_network'),
    /** The `?s=` tag — which specific reel or post drove this visit. */
    campaign: text('campaign'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    language: text('language'),
    isBot: boolean('is_bot').notNull().default(false),
  },
  (t) => [
    index('visits_profile_created_idx').on(t.profileId, t.createdAt),
    index('visits_created_idx').on(t.createdAt),
    index('visits_campaign_idx').on(t.campaign),
    index('visits_hash_idx').on(t.visitorHash),
  ],
)

/**
 * `profileId` is denormalised so dashboard queries never need a join to `visits`.
 *
 * `visitId` deliberately carries no foreign key: the visit row is written in an
 * `after()` callback once the response has been flushed, so a very fast click could
 * otherwise race the insert and be rejected. Analytics tolerates a dangling id far
 * better than it tolerates dropped clicks.
 */
export const clicks = pgTable(
  'clicks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitId: uuid('visit_id'),
    linkId: uuid('link_id').references(() => links.id, { onDelete: 'set null' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Milliseconds between page load and the click. */
    msOnPage: integer('ms_on_page'),
    position: integer('position'),
    /** Denormalised from the visit so dashboard filters never need a join. */
    isBot: boolean('is_bot').notNull().default(false),
  },
  (t) => [
    index('clicks_profile_created_idx').on(t.profileId, t.createdAt),
    index('clicks_link_idx').on(t.linkId),
    index('clicks_visit_idx').on(t.visitId),
  ],
)

export const SOCIAL_NETWORKS = ['instagram', 'tiktok', 'youtube'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

/**
 * One connected network. Tokens are stored encrypted — see `lib/social/crypto`.
 * YouTube needs no OAuth, so it lands here with both tokens null and only a channel id.
 */
export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  network: text('network').notNull().unique(),
  handle: text('handle'),
  externalId: text('external_id'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A published piece of content.
 *
 * `campaign` is the `?s=` tag that joins this post to `visits`. The join is by string
 * and not by foreign key on purpose: visits are written long before the post exists
 * here, and editing the tag re-links the whole history without migrating a row.
 * The sync never overwrites it.
 *
 * `archivedAt` marks a post deleted on the network. The row survives — dropping it
 * would erase traffic that really happened.
 */
export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    network: text('network').notNull(),
    externalId: text('external_id').notNull(),
    permalink: text('permalink'),
    caption: text('caption'),
    thumbnailUrl: text('thumbnail_url'),
    mediaType: text('media_type'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    campaign: text('campaign').notNull().unique(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('social_posts_network_external_key').on(t.network, t.externalId),
    index('social_posts_campaign_idx').on(t.campaign),
    index('social_posts_published_idx').on(t.publishedAt),
  ],
)

/**
 * One cumulative snapshot per post per local day — cumulative because that is what
 * all three APIs return. A period's growth is the difference between two snapshots.
 *
 * Every metric is nullable: null means the network does not report it, which is not
 * the same as zero. TikTok has no saves or reach; the YouTube Data API has no shares
 * or saves.
 *
 * The unique on `(postId, day)` is what makes the sync idempotent.
 */
export const postMetrics = pgTable(
  'post_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views'),
    likes: integer('likes'),
    comments: integer('comments'),
    shares: integer('shares'),
    saves: integer('saves'),
    reach: integer('reach'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('post_metrics_post_day_key').on(t.postId, t.day), index('post_metrics_day_idx').on(t.day)],
)

export type Profile = typeof profiles.$inferSelect
export type Link = typeof links.$inferSelect
export type Visit = typeof visits.$inferSelect
export type Click = typeof clicks.$inferSelect
export type SocialAccount = typeof socialAccounts.$inferSelect
export type SocialPost = typeof socialPosts.$inferSelect
export type PostMetric = typeof postMetrics.$inferSelect
