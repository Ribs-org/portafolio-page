-- drizzle-kit no pudo leer el nombre de la PK vieja (ver su comentario original en el
-- historial de este archivo). "ajustes_pkey" es el nombre que Postgres le puso solo:
-- 0000_fuzzy_pet_avengers.sql declaró `"clave" text PRIMARY KEY NOT NULL` sin CONSTRAINT
-- explícito, y esa es la convención de nombres por defecto para una PK sin nombre.
ALTER TABLE "ajustes" DROP CONSTRAINT "ajustes_pkey";--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_owner_clave_key" UNIQUE("owner_id","clave");