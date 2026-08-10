# Portafolio / Linktree multi-perfil con analítica propia

Fecha: 2026-08-10
Estado: aprobado, en implementación

## Problema

Hoy el contenido vive en dos Linktree separados: uno público orientado a tráfico de
redes sociales y otro privado que se comparte con pocas personas. Linktree no entrega
los datos crudos de visitas, limita la estética y obliga a mantener dos cuentas.

## Objetivo

Una sola aplicación que sirva N perfiles públicos independientes, cada uno editable
desde un dashboard propio, con analítica de primera parte más detallada que la de
Linktree y desplegada en Vercel.

## No objetivos

- Multi-usuario. La aplicación tiene un solo dueño.
- Consentimiento de cookies. El tracking es sin cookies por diseño.
- App móvil nativa.

## Stack

| Capa | Elección | Razón |
|---|---|---|
| Framework | Next.js 16 App Router + TypeScript | Server Components para tracking sin JS en el cliente |
| Estilos | Tailwind CSS v4 | |
| Base de datos | Neon Postgres vía Vercel Marketplace | Env vars automáticas, facturación unificada |
| ORM | Drizzle | Migraciones tipadas, sin runtime pesado |
| Imágenes | Vercel Blob | Subida directa desde el admin |
| Gráficos | Recharts | |
| Reordenar links | dnd-kit | |
| Sesión admin | JWT firmado con `jose` en cookie httpOnly | Sin proveedor externo |

## Rutas

### Públicas

- `/` — perfil marcado como `is_default`. El perfil público.
- `/[slug]` — cualquier otro perfil. El perfil íntimo usa un slug no adivinable,
  editable desde el admin.
- Query `?s=<etiqueta>` en cualquier ruta pública etiqueta la visita con una campaña.
  También se leen `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`.

### Admin

- `/admin/login` — formulario de contraseña.
- `/admin` — resumen: KPIs y gráficos principales.
- `/admin/profiles` — lista de perfiles.
- `/admin/profiles/[id]` — editor con preview en vivo del celular.
- `/admin/analytics` — dashboard completo con filtros.

### API

- `POST /api/track/click` — registra un click. Se llama con `navigator.sendBeacon`.
- `POST /api/admin/upload` — token de subida a Blob.

## Modelo de datos

### `profiles`

`id`, `slug` (único), `display_name`, `headline`, `bio`, `avatar_url`,
`accent_color`, `background_style`, `og_image_url`, `is_default` (único parcial),
`is_published`, `noindex`, `created_at`, `updated_at`.

`noindex` va en `true` para el perfil íntimo: emite `robots: noindex, nofollow` y se
excluye del sitemap.

### `links`

`id`, `profile_id`, `kind` (`featured` | `standard` | `social` | `booking`),
`label`, `sublabel`, `url`, `icon` (nombre de icono o emoji), `image_url`,
`position`, `is_active`, `starts_at`, `ends_at`, `created_at`.

Los cuatro `kind` se renderizan distinto: `featured` es una tarjeta grande con imagen,
`standard` una fila, `social` un icono en la fila horizontal de arriba, `booking` un
bloque destacado con acento de color para cal.com.

`starts_at` / `ends_at` son opcionales: si están, el link solo se muestra dentro de esa
ventana.

### `visits`

`id`, `profile_id`, `created_at`, `visitor_hash`, `country`, `region`, `city`,
`timezone`, `latitude`, `longitude`, `device_type`, `os`, `browser`, `referrer`,
`referrer_network`, `campaign`, `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `language`, `is_bot`.

### `clicks`

`id`, `visit_id`, `link_id`, `profile_id`, `created_at`, `ms_on_page`, `position`.

`profile_id` se denormaliza en `clicks` para no tener que hacer join en las consultas
del dashboard.

## Tracking

### Identidad del visitante

`visitor_hash = SHA256(ip + user_agent + FINGERPRINT_SALT + fecha_utc)`

La IP cruda nunca se persiste. La sal rota implícitamente cada día porque la fecha
entra en el hash, así que el mismo visitante recibe un hash distinto mañana. Esto hace
que "visitantes únicos" sea una métrica diaria, no histórica — es el precio de no usar
cookies, y es la decisión deliberada tomada para evitar el banner de consentimiento.

### Geolocalización

Desde los headers que inyecta Vercel: `x-vercel-ip-country`, `x-vercel-ip-country-region`,
`x-vercel-ip-city`, `x-vercel-ip-timezone`, `x-vercel-ip-latitude`, `x-vercel-ip-longitude`.
Sin servicio externo ni costo.

### Red de origen

Se infiere del hostname del `referer` mapeado contra una tabla conocida: Instagram,
TikTok, X/Twitter, YouTube, Facebook, LinkedIn, WhatsApp, Telegram, Reddit, Threads,
Google, Bing. Sin referrer y sin campaña, la visita es `direct`.

Instagram y TikTok abren links en su navegador embebido y suelen strippear el referrer.
Por eso el parámetro `?s=` es el mecanismo principal para atribuir tráfico a una pieza
de contenido específica: cada reel o TikTok lleva su propia etiqueta en el link de la bio.

### Registro de la visita

Ocurre en el Server Component de la página, en un `after()` para no bloquear el render.
No requiere JavaScript en el cliente.

### Registro del click

`navigator.sendBeacon` a `/api/track/click` con el `visit_id` que el servidor incrustó
en el HTML, más los milisegundos transcurridos desde el `load`. Se dispara antes de la
navegación; `sendBeacon` sobrevive al unload de la página.

### Bots

Se detectan por user-agent y se marcan con `is_bot`. No se borran — se filtran por
defecto en el dashboard, con un toggle para incluirlos.

## Dashboard

Filtros globales: rango de fecha (hoy, 7d, 30d, 90d, todo, personalizado) y perfil.

1. KPIs — visitas, únicos, clicks, CTR. Cada uno con delta contra el período anterior.
2. Serie temporal de visitas y clicks.
3. Tabla de campañas `?s=` ordenable por visitas, clicks y CTR. Responde
   "¿qué reel me trae más tráfico y cuál convierte mejor?".
4. Top links por clicks y por CTR.
5. Fuentes de tráfico.
6. Países y ciudades.
7. Dispositivo, OS, navegador.
8. Heatmap hora del día × día de la semana.
9. Embudo: visitas → visitas con al menos un click → clicks totales.
10. Feed de las últimas visitas.

## Autenticación del admin

`ADMIN_PASSWORD` como variable de entorno. El login la compara en tiempo constante y
emite un JWT firmado con `AUTH_SECRET` en una cookie httpOnly, secure, sameSite lax,
con 30 días de vigencia. El middleware protege todo `/admin` salvo `/admin/login`.
El endpoint de login tiene rate limit en memoria por IP.

## Estética

Mobile-first. Fondo con gradiente en movimiento lento derivado del `accent_color` del
perfil. Tarjetas con superficie translúcida y borde luminoso. En desktop, hover que
eleva la tarjeta y un brillo que sigue el cursor. Entrada escalonada de los links.
Todo el movimiento se desactiva bajo `prefers-reduced-motion`. Tema oscuro por defecto.

## Errores

- Slug inexistente o perfil no publicado → 404.
- Fallo al registrar visita o click → se traga silenciosamente. La analítica nunca
  puede romper la página pública.
- Fallo de conexión a la base en el admin → mensaje de error explícito, no 500 en blanco.

## Verificación

- La página pública renderiza y hace LCP sin depender de JavaScript.
- Una visita a `/?s=prueba` crea una fila en `visits` con `campaign = 'prueba'`.
- Un click crea una fila en `clicks` ligada a esa visita.
- Dos visitas del mismo navegador el mismo día comparten `visitor_hash`.
- El admin rechaza contraseña incorrecta y acepta la correcta.
- Reordenar links en el editor persiste el nuevo orden.
- `npm run build` pasa sin errores de tipos.
