CREATE TABLE "solicitudes_borrado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"red" text NOT NULL,
	"meta_user_id" text NOT NULL,
	"cuentas" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitudes_borrado_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "solicitudes_borrado" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD COLUMN "meta_user_id" text;--> statement-breakpoint
CREATE INDEX "social_accounts_meta_user_idx" ON "social_accounts" USING btree ("meta_user_id");