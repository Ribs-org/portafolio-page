CREATE TABLE "account_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"followers" integer,
	"total_views" integer,
	"video_count" integer,
	"profile_views" integer,
	"reach" integer,
	"views" integer,
	"accounts_engaged" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_metrics_account_day_key" UNIQUE("day","account_id")
);
--> statement-breakpoint
CREATE TABLE "ajustes" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid,
	"link_id" uuid,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ms_on_page" integer,
	"position" integer,
	"is_bot" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"label" text NOT NULL,
	"sublabel" text,
	"url" text NOT NULL,
	"icon" text,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"network" text NOT NULL,
	"post_external_id" text NOT NULL,
	"external_id" text NOT NULL,
	"author" text,
	"author_external_id" text,
	"text" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"draft" text,
	"draft_error" text,
	"state" text DEFAULT 'pendiente' NOT NULL,
	"reply_external_id" text,
	"error" text,
	"dm_state" text DEFAULT 'no' NOT NULL,
	"dm_error" text,
	"automatico" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_comments_account_external_key" UNIQUE("account_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer,
	"likes" integer,
	"comments" integer,
	"shares" integer,
	"saves" integer,
	"reach" integer,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_metrics_post_day_key" UNIQUE("post_id","day")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"headline" text,
	"bio" text,
	"avatar_url" text,
	"accent_color" text DEFAULT '#8b7cff' NOT NULL,
	"background_style" text DEFAULT 'aurora' NOT NULL,
	"og_image_url" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"noindex" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reglas_clave" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"palabra" text NOT NULL,
	"mensaje" text NOT NULL,
	"respuesta_publica" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reglas_clave_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"media_type" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_post_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"network" text NOT NULL,
	"account_id" uuid NOT NULL,
	"caption_override" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"container_id" text,
	"external_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"opciones" jsonb,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_post_targets_post_account_key" UNIQUE("post_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"caption" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"cover_url" text,
	"atributos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"handle" text,
	"external_id" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_accounts_network_external_key" UNIQUE("network","external_id")
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"permalink" text,
	"caption" text,
	"thumbnail_url" text,
	"media_type" text,
	"published_at" timestamp with time zone NOT NULL,
	"campaign" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_posts_campaign_unique" UNIQUE("campaign"),
	CONSTRAINT "social_posts_account_external_key" UNIQUE("external_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "source_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"username" text NOT NULL,
	"external_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"since_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_authors_network_username_key" UNIQUE("network","username")
);
--> statement-breakpoint
CREATE TABLE "source_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"network" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"author_handle" text NOT NULL,
	"original_text" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"draft" text,
	"draft_error" text,
	"state" text DEFAULT 'cruda' NOT NULL,
	"scheduled_post_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_posts_author_external_key" UNIQUE("author_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_hash" text NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"timezone" text,
	"latitude" double precision,
	"longitude" double precision,
	"device_type" text,
	"os" text,
	"browser" text,
	"referrer" text,
	"referrer_network" text,
	"campaign" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"language" text,
	"is_bot" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_metrics" ADD CONSTRAINT "account_metrics_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clicks" ADD CONSTRAINT "clicks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_clave" ADD CONSTRAINT "reglas_clave_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post_media" ADD CONSTRAINT "scheduled_post_media_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post_targets" ADD CONSTRAINT "scheduled_post_targets_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post_targets" ADD CONSTRAINT "scheduled_post_targets_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_author_id_source_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."source_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_scheduled_post_id_scheduled_posts_id_fk" FOREIGN KEY ("scheduled_post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_metrics_day_idx" ON "account_metrics" USING btree ("day");--> statement-breakpoint
CREATE INDEX "clicks_profile_created_idx" ON "clicks" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "clicks_link_idx" ON "clicks" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "clicks_visit_idx" ON "clicks" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "links_profile_position_idx" ON "links" USING btree ("profile_id","position");--> statement-breakpoint
CREATE INDEX "post_comments_state_idx" ON "post_comments" USING btree ("state");--> statement-breakpoint
CREATE INDEX "post_comments_published_idx" ON "post_comments" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "post_metrics_day_idx" ON "post_metrics" USING btree ("day");--> statement-breakpoint
CREATE INDEX "scheduled_post_media_post_idx" ON "scheduled_post_media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "scheduled_post_targets_status_idx" ON "scheduled_post_targets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_post_targets_account_external_idx" ON "scheduled_post_targets" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "social_posts_campaign_idx" ON "social_posts" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "social_posts_published_idx" ON "social_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "source_posts_state_idx" ON "source_posts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "source_posts_published_idx" ON "source_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "visits_profile_created_idx" ON "visits" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "visits_created_idx" ON "visits" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visits_campaign_idx" ON "visits" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "visits_hash_idx" ON "visits" USING btree ("visitor_hash");