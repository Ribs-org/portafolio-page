CREATE TABLE "codigos_ingreso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"intentos" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correo" text NOT NULL,
	"nombre" text,
	"rol" text DEFAULT 'usuario' NOT NULL,
	"sesion_version" integer DEFAULT 1 NOT NULL,
	"invitado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"primer_ingreso_en" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_correo_unique" UNIQUE("correo")
);
--> statement-breakpoint
ALTER TABLE "codigos_ingreso" ADD CONSTRAINT "codigos_ingreso_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_ingreso_user_idx" ON "codigos_ingreso" USING btree ("user_id","created_at");