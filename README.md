# Portafolio

Un linktree propio: varios perfiles públicos, editables desde un panel, con analítica de
primera parte y sin cookies.

## Cómo funciona

| URL | Qué es |
| --- | --- |
| `/` | El perfil marcado como principal |
| `/<slug>` | Cualquier otro perfil. El privado usa un slug que no se adivina |
| `/admin` | Tu panel: resumen, analítica y editor |

### Atribuir tráfico a una pieza de contenido

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

## Desarrollo

```bash
npm run dev          # servidor local
npm run typecheck    # tipos
npm run build        # build de producción
```

## Base de datos

```bash
npm run db:push      # aplica el esquema a Neon
npm run db:seed      # crea los dos perfiles iniciales (solo si no hay ninguno)
npm run db:studio    # explorador visual de las tablas
```

## Analítica

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

Todas viven en Vercel y bajan con `vercel env pull .env.local`.

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Neon Postgres (la pone la integración) |
| `BLOB_READ_WRITE_TOKEN` | Subida de imágenes (la pone el store de Blob) |
| `ADMIN_PASSWORD` | Contraseña del panel |
| `AUTH_SECRET` | Firma de la cookie de sesión |
| `FINGERPRINT_SALT` | Sal del hash de visitante |
| `SITE_TIMEZONE` | Zona en la que el dashboard agrupa los días |

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
```
