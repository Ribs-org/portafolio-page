-- La PK vieja de `ajustes` nació sin nombre (0000 declaró `"clave" text PRIMARY KEY NOT
-- NULL`), así que Postgres se lo puso solo y drizzle-kit no supo leerlo. En vez de
-- adivinarlo, se busca en el catálogo: si el nombre no fuera el esperado, un DROP a ciegas
-- tumbaría el despliegue, y un DROP IF EXISTS dejaría la clave vieja en pie sin avisar.
DO $$
DECLARE nombre text;
BEGIN
  SELECT conname INTO nombre FROM pg_constraint
   WHERE conrelid = 'ajustes'::regclass AND contype = 'p';
  IF nombre IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "ajustes" DROP CONSTRAINT %I', nombre);
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "ajustes" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_owner_clave_key" UNIQUE("owner_id","clave");
