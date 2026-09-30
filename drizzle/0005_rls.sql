ALTER TABLE "account_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ajustes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clicks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "codigos_ingreso" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "post_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reglas_clave" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_post_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_post_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scheduled_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "source_authors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "source_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Supabase da a `anon` y `authenticated` (los roles de su Data API, cuya llave es pública
-- por diseño) todos los permisos sobre cada tabla de `public`. Esta app nunca usa esa API:
-- entra como `postgres`, que tiene BYPASSRLS y es dueño de las tablas, así que RLS sin
-- políticas le da igual y a la Data API la deja a ciegas. Los REVOKE cierran la puerta por
-- fuera además, también para las tablas que vengan después (default privileges). Va
-- guardado por si la base no es Supabase (un Postgres local no tiene esos roles).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
END $$;
