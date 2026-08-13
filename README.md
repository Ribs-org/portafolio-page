# Portafolio

Un linktree propio: varios perfiles públicos, editables desde un panel, con analítica de
primera parte y sin cookies. Sin suscripción, sin marca de agua, sin que un tercero se
quede con tus números.

**[Ver uno funcionando →](https://portafolio-page-inky.vercel.app)**

| URL | Qué es |
| --- | --- |
| `/` | El perfil marcado como principal |
| `/<slug>` | Cualquier otro perfil. El privado usa un slug que no se adivina |
| `/admin` | Tu panel: resumen, analítica y editor |

Corre entero en el plan gratis de Vercel: Next.js 16, Postgres en Neon y Vercel Blob para
las imágenes.

---

## Desplegar el tuyo

Toma unos 10 minutos. Necesitas una cuenta de GitHub, una de Vercel y Node 20 o superior.

### 1. Genera tus dos secretos

El botón del paso siguiente te los va a pedir. Córrelo dos veces y guarda cada resultado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

El primero es `AUTH_SECRET` (firma tu sesión del panel), el segundo `FINGERPRINT_SALT`
(la sal del hash de visitantes). No los reutilices entre proyectos y no los publiques.

### 2. Aprieta el botón

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRibs-org%2Fportafolio-page&env=ADMIN_PASSWORD,AUTH_SECRET,FINGERPRINT_SALT&envDescription=La%20contrase%C3%B1a%20de%20tu%20panel%20y%20los%20dos%20secretos%20que%20generaste&envLink=https%3A%2F%2Fgithub.com%2FRibs-org%2Fportafolio-page%2Fblob%2Fmain%2F.env.example&project-name=portafolio&repository-name=portafolio)

Vercel copia este repositorio a tu cuenta de GitHub y te pide tres variables:

| Variable | Qué pones |
| --- | --- |
| `ADMIN_PASSWORD` | La contraseña con la que entrarás a `/admin`. Es la única puerta: que sea larga |
| `AUTH_SECRET` | El primer valor del paso 1 |
| `FINGERPRINT_SALT` | El segundo valor del paso 1 |

El deploy va a terminar bien, pero al abrir el sitio verás **"No se pudo leer la base de
datos"**. Es lo esperado: todavía no hay base de datos. Sigue.

### 3. Conecta la base de datos y el almacenamiento

En tu proyecto de Vercel, pestaña **Storage**:

- **Create Database → Neon** — inyecta `DATABASE_URL` sola. Obligatoria.
- **Create → Blob** — inyecta `BLOB_READ_WRITE_TOKEN` sola. Opcional: sin ella todo
  funciona, solo que no puedes subir fotos desde el panel.

### 4. Crea las tablas

Esto es lo único que no se puede hacer desde el navegador. En tu computador, sobre el
repositorio que Vercel acaba de crear en tu GitHub:

```bash
git clone https://github.com/TU-USUARIO/portafolio.git
cd portafolio
npm install

npx vercel link              # elige el proyecto que acabas de crear
npx vercel env pull .env.local
npm run db:setup             # crea las tablas y siembra dos perfiles de ejemplo
```

`db:setup` es idempotente en lo que importa: si ya existen perfiles, no siembra de nuevo.

### 5. Redespliega

Las variables que agregaron Neon y Blob no entran en un deploy que ya terminó. En Vercel:
**Deployments → ⋯ del último → Redeploy**. O desde la terminal:

```bash
npx vercel --prod
```

Abre el sitio: ahora se ve un perfil de ejemplo.

### 6. Hazlo tuyo

Entra a `/admin` con tu `ADMIN_PASSWORD`. Ahí cambias foto, bio, colores, links y slugs.
Los dos perfiles de ejemplo están para que los edites, no para que los borres y empieces
de cero.

> El segundo perfil nace con un slug aleatorio (`circulo-a1b2c3d4`) y con `noindex`, para
> que exista una versión que solo compartes a mano. Cámbialo por lo que quieras.

### 7. Tu dominio

En Vercel: **Settings → Domains → Add**, escribe tu dominio y copia los registros DNS que
te muestre en tu proveedor. El certificado HTTPS lo emite Vercel solo, en minutos.

<details>
<summary>Sin el botón (fork manual)</summary>

```bash
gh repo fork Ribs-org/portafolio-page --clone
cd portafolio-page
npm install
npm run setup        # crea .env.local con AUTH_SECRET y FINGERPRINT_SALT ya generados
```

Llena `DATABASE_URL` y `ADMIN_PASSWORD` en el `.env.local`, y después:

```bash
npm run db:setup
npm run dev
npx vercel           # cuando quieras subirlo
```

</details>

---

## Atribuir tráfico a una pieza de contenido

Agrega `?s=` al link que pones en la bio:

```
tudominio.com/?s=reel-agosto
tudominio.com/?s=tiktok-rutina
```

Cada etiqueta aparece por separado en **Analítica → Qué contenido te trae gente**, con sus
visitas, únicos, clicks y CTR. Es el mecanismo principal de atribución porque Instagram y
TikTok abren los links en su navegador interno y borran el referrer.

También se leen `utm_source`, `utm_medium`, `utm_campaign` y `utm_content`.

## Qué se guarda de cada visita

País, región, ciudad y zona horaria (headers de Vercel), dispositivo, sistema operativo,
navegador, referrer y red de origen, la etiqueta `?s=`, idioma del navegador y si es un bot.

**La IP nunca se guarda.** El identificador de visitante es
`SHA-256(IP + user-agent + FINGERPRINT_SALT + fecha UTC)`. Como la fecha entra en el hash,
el mismo visitante recibe uno distinto al día siguiente: "visitantes únicos" es una métrica
diaria. Ese es el precio deliberado de no usar cookies, y es lo que evita el banner de
consentimiento.

---

## Comandos

```bash
npm run dev          # servidor local
npm run typecheck    # tipos
npm run build        # build de producción
npm run lint         # eslint
```

**Base de datos**

```bash
npm run setup        # crea .env.local a partir de .env.example, con secretos generados
npm run db:setup     # db:push + db:seed, para un proyecto recién creado
npm run db:push      # aplica el esquema a Neon
npm run db:seed      # crea los dos perfiles iniciales (solo si no hay ninguno)
npm run db:studio    # explorador visual de las tablas
```

**Analítica**

```bash
npm run demo:seed        # llena el dashboard con 30 días de tráfico falso
npm run demo:clear       # borra solo ese tráfico falso
npm run analytics:reset  # borra TODAS las visitas y clicks, reales incluidos
npm run analytics:check  # imprime la última visita y el último click
```

`demo:seed` sirve para ver cómo se ve el dashboard antes de tener tráfico real. Las filas
que crea llevan un prefijo `demo:` en `visitor_hash`, así que `demo:clear` las quita sin
tocar nada real.

## Variables de entorno

La plantilla comentada está en [`.env.example`](.env.example). En producción viven en
Vercel y bajan con `vercel env pull .env.local`.

| Variable | Para qué | ¿Obligatoria? |
| --- | --- | --- |
| `DATABASE_URL` | Neon Postgres | Sí — la pone la integración |
| `ADMIN_PASSWORD` | Contraseña del panel | Sí |
| `AUTH_SECRET` | Firma de la cookie de sesión | Sí |
| `FINGERPRINT_SALT` | Sal del hash de visitante | Sí |
| `BLOB_READ_WRITE_TOKEN` | Subida de imágenes | No — sin ella no puedes subir fotos |
| `SITE_TIMEZONE` | Zona en la que el dashboard agrupa los días | No — por defecto `America/Santiago` |

Para cambiar la contraseña:

```bash
vercel env rm ADMIN_PASSWORD production --yes
printf '%s' 'tu-nueva-contraseña' | vercel env add ADMIN_PASSWORD production
vercel --prod
```

Repite para `preview` y `development` si quieres la misma en todos lados.

> En PowerShell, `"valor" | vercel env add ...` escribe un BOM al principio del valor y lo
> corrompe en silencio. Usa `printf` desde Git Bash, o la interfaz web de Vercel.

## Estructura

```
src/
  app/
    page.tsx               perfil principal
    [slug]/                perfiles por slug
    icon.svg               favicon
    api/track/click/       endpoint del sendBeacon
    admin/
      login/               entrada
      (dash)/              panel protegido
  components/
    profile-view.tsx       la página pública (también alimenta la vista previa del editor)
    click-tracker.tsx      escucha delegada de clicks
    charts/                gráficos y paleta validada
  lib/
    tracking.ts            contexto de la visita desde headers
    analytics.ts           consultas del dashboard
    auth.ts                sesión del panel
scripts/
  setup.ts                 genera el .env.local
  seed.ts                  perfiles iniciales
  demo-data.ts             tráfico falso para probar el dashboard
```

## Licencia

MIT — ver [LICENSE](LICENSE). Úsalo, cámbialo y publícalo como quieras. Si te sirvió, una
estrella en el repo se agradece.
