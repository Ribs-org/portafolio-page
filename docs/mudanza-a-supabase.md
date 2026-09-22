# Mudanza de la base: de Neon a Supabase

El 2026-09-21 el plan gratis de Neon cortó producción con `HTTP 402` en cada consulta:
la base había gastado sus 100 CU-horas del mes. No fue el tráfico. El pinger de
cron-job.org golpea cada 5 minutos y Neon se duerme recién a los 5, así que la base nunca
alcanzaba a dormirse: 720 h × 0,25 CU = **180 CU-horas**, casi el doble del cupo, con un
solo usuario.

Neon cobra por tiempo encendido. Supabase no: su plan gratis es un tier fijo que solo se
pausa tras 7 días sin actividad, cosa que el pinger vuelve imposible. Por eso la mudanza.

El código ya está migrado (`postgres-js` en vez del driver HTTP de Neon). Falta mover los
datos, que es lo que describe este documento.

---

## Antes de empezar

Neon tiene que estar en plan **Launch**: con el cupo agotado no se puede ni leer, así que
tampoco se puede exportar. Al subir el plan, **pausá el job en cron-job.org**: sin pinger
la base se duerme y el mes de Launch cuesta centavos en vez de unos seis dólares.

De Supabase hacen falta las **dos** cadenas de conexión, y las dos salen del pooler
(`...pooler.supabase.com`), nunca de `db.<ref>.supabase.co`: la conexión directa del plan
gratis es solo IPv6, y los runners de Vercel y de GitHub son IPv4.

| Para | Cadena | Puerto |
|---|---|---|
| La app (`DATABASE_URL`) | Transaction pooler | 6543 |
| Migraciones, `pg_dump`, `pg_restore` (`DATABASE_URL_UNPOOLED`) | Session pooler | 5432 |

---

## 1. Sacar el respaldo de Neon

`pg_dump` va en contenedor porque el cliente tiene que ser de versión igual o mayor que el
servidor. La URL viaja como variable de entorno, no como argumento, para que no quede
escrita en la línea de comandos del proceso.

```bash
mkdir -p respaldo
NEON_URL='<DATABASE_URL_UNPOOLED de Neon>'

docker run --rm -e PGURL="$NEON_URL" -v "$PWD/respaldo:/salida" postgres:17 \
  sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --file=/salida/neon.dump'

# Una segunda copia en SQL plano, para poder mirarla con los ojos si algo sale raro.
docker run --rm -e PGURL="$NEON_URL" -v "$PWD/respaldo:/salida" postgres:17 \
  sh -c 'pg_dump "$PGURL" --format=plain --no-owner --no-privileges --file=/salida/neon.sql'
```

## 2. Anotar el conteo de filas del origen

Esto es lo que después prueba que la mudanza salió completa. Cuenta exacta, no estimada:

```bash
CONTEO="select table_name,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as filas
from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' order by table_name;"

docker run --rm -e PGURL="$NEON_URL" -e Q="$CONTEO" postgres:17 \
  sh -c 'psql "$PGURL" -At -F"|" -c "$Q"' | tee respaldo/conteo-neon.txt
```

## 3. Restaurar en Supabase

Contra una base recién creada y vacía. Trae el esquema, los datos y también la tabla
`drizzle.__drizzle_migrations`, que es lo que mantiene consistentes las migraciones
siguientes: por eso se restaura el volcado completo en vez de correr `db:migrate` primero.

```bash
SUPA_URL='<DATABASE_URL_UNPOOLED de Supabase — session pooler, 5432>'

docker run --rm -e PGURL="$SUPA_URL" -v "$PWD/respaldo:/entrada" postgres:17 \
  sh -c 'pg_restore --dbname "$PGURL" --no-owner --no-privileges /entrada/neon.dump'
```

Algunos avisos sobre extensiones o pertenencia son normales y no rompen nada; un error
sobre una **tabla** o sobre **datos**, no. Si hay que repetir el intento sobre una base ya
tocada, agregar `--clean --if-exists`.

## 4. Comprobar que llegó todo

```bash
docker run --rm -e PGURL="$SUPA_URL" -e Q="$CONTEO" postgres:17 \
  sh -c 'psql "$PGURL" -At -F"|" -c "$Q"' > respaldo/conteo-supabase.txt

diff respaldo/conteo-neon.txt respaldo/conteo-supabase.txt && echo "IDÉNTICO: las 18 tablas cuadran"
```

Si el `diff` no imprime nada, la mudanza está completa. Cualquier diferencia se investiga
antes de seguir: todavía no se tocó producción.

## 5. Apuntar la app a Supabase

```bash
# Local
#   DATABASE_URL=<transaction pooler, 6543>
#   DATABASE_URL_UNPOOLED=<session pooler, 5432>

# Vercel: las dos, en los tres entornos
vercel env add DATABASE_URL production
vercel env add DATABASE_URL_UNPOOLED production
# … y lo mismo para preview y development.
```

Las viejas de Neon (`PGHOST`, `POSTGRES_URL`, y compañía) las puso su integración y el
código no las usa: se quitan al final, cuando producción ya esté verde.

`npm run db:migrate:local` tiene que decir `[migraciones] al día` sin aplicar nada. Si
intenta aplicar migraciones, el volcado no trajo `drizzle.__drizzle_migrations` y hay que
volver al paso 3.

## 6. Desplegar y probar de verdad

Preview primero: entrar a `/ingresar`, pedir el código, entrar al panel y mirar que las
métricas muestren los números de siempre. Recién ahí el PR a `main`.

## 7. Cerrar

- Agregar el secreto `DATABASE_URL_UNPOOLED` en GitHub (Settings → Secrets → Actions):
  sin él, `.github/workflows/respaldo.yml` falla a propósito en su primera corrida.
- Correr el respaldo a mano una vez (`workflow_dispatch`) para verificar que funciona.
- Reactivar el pinger en cron-job.org, otra vez cada 5 minutos: Supabase no cobra por
  estar despierta, así que se recupera la precisión de publicación.
- Recién entonces, cancelar Neon.
