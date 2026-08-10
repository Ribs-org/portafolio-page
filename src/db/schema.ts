import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
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

export type Profile = typeof profiles.$inferSelect
export type Link = typeof links.$inferSelect
export type Visit = typeof visits.$inferSelect
export type Click = typeof clicks.$inferSelect
