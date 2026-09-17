ALTER TABLE "ajustes" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "source_authors" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_authors" ADD CONSTRAINT "source_authors_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_owner_idx" ON "ajustes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "profiles_owner_idx" ON "profiles" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_owner_idx" ON "scheduled_posts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "social_accounts_owner_idx" ON "social_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "social_posts_owner_idx" ON "social_posts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "source_authors_owner_idx" ON "source_authors" USING btree ("owner_id");