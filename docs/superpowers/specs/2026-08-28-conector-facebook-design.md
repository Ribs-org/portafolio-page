# Conector de Facebook — páginas con métricas por post

Fecha: 2026-08-28
Estado: aprobado, pendiente de plan de implementación

Fase 1 de 4 del plan acordado: **Facebook**, Threads, X (solo publicar), multicuenta.
Cada fase es su propio ciclo spec → plan → implementación.

## Problema

El panel de contenido une métricas de plataforma con tráfico propio para Instagram,
TikTok y YouTube. Las publicaciones de la página de Facebook del dueño quedan fuera:
sus views y su arrastre no existen en la tabla, aunque la atribución por `?s=` ya
capta las visitas que traen.

## Objetivo

Una card más en `/admin/content`: conectar la página de Facebook por OAuth, y que el
sync nocturno traiga sus publicaciones con métricas por post, exactamente con el mismo
contrato que las tres redes existentes. Cero cambios de esquema.

## No objetivos

- **Threads, X y multicuenta.** Son las fases 2–4, cada una con su propio spec.
- **Varias páginas a la vez.** Esta fase conecta una página; elegir entre varias en
  paralelo llega con multicuenta. Si el login administra varias, se desambigua por
  variable de entorno (ver *Elección de página*).
- **Publicar en Facebook.** Esto lee, no escribe.
- **Métricas de audiencia de la página** (fans, alcance de página). Solo por post.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Reutilizar la app de Meta de Instagram | App OAuth aparte | La app ya existe, ya pide `pages_show_list`, `pages_read_engagement` y `business_management`; una segunda solo duplicaría secretos sin aislar nada |
| Guardar el **page access token** | Guardar el token de usuario y pedir el de página en cada sync | El token de página derivado de un token de usuario largo no vence; una llamada menos por noche y un modo de fallo menos |
| `expiresAt` null para el token de página | Inventar una fecha | La lección de Instagram (commit `dc49b91`): una fecha falsa hace que el refresh nunca corra o corra de más |
| Desambiguar página por `FACEBOOK_PAGE_ID` | Conectar la primera de la lista | El orden de `me/accounts` no es una promesa; conectar otra página archiva el catálogo entero de la anterior (mismo argumento que `pickInstagramAccount`) |

## Flujo OAuth

Reusa la infraestructura genérica existente (`/api/social/[network]/connect` y
`/callback`, estado firmado, guard `mayConnectAccount`).

- **Connect** (`connect/route.ts`): entrada `facebook` en `SCOPES` con
  `pages_show_list,pages_read_engagement,read_insights,business_management`
  (`read_insights` es el único scope nuevo respecto de lo que Instagram ya pide).
  Mismo diálogo `facebook.com/v23.0/dialog/oauth`, con `client_id` =
  `INSTAGRAM_APP_ID`.
- **Callback** (`callback/route.ts`): `facebookCredential()` espejo de
  `instagramCredential()` — canje de código por token corto, `fb_exchange_token` por
  el largo (fallar fuerte si el largo no llega, como Instagram), y luego
  `me/accounts?fields=id,name,access_token` para descubrir las páginas y su token.
- **Se guarda**: `externalId` = id de página, `handle` = nombre de página,
  `accessToken` = **page access token** cifrado, `refreshToken` null,
  `expiresAt` null (los tokens de página derivados de un token de usuario largo no
  vencen). Errores con frases fijas en español vía `OAuthError`, nunca texto upstream.

### Elección de página

`pickFacebookPage(pages, pinnedId?)` en el conector, espejo de `pickInstagramAccount`
y con la misma disciplina de errores (`FacebookPageError` con frases fijas; candidatos
solo al log del servidor):

- Cero páginas → error fijo: ninguna página administrable.
- Una página → esa.
- Varias → error que pide definir `FACEBOOK_PAGE_ID`; con la variable definida, se
  exige que coincida con una candidata (mensajes distintos para "no hay páginas" y
  "ninguna coincide con la fijada", como aprendimos con Instagram).

## Conector (`src/lib/social/facebook.ts`)

Implementa el contrato `Connector` (`network`, `ensureCredential`, `fetchPosts`).

- **`ensureCredential`**: descifra y devuelve el token. Sin ventana de refresh — el
  token de página no vence. Si Meta lo invalida (contraseña cambiada, permisos
  revocados), el Graph 190 cae en `lastSyncError` y la card se pone roja: el camino de
  recuperación es reconectar, igual que hoy.
- **`fetchPosts`**: pagina `/{page-id}/published_posts` con
  `fields=id,message,permalink_url,full_picture,attachments{media_type},created_time,shares,likes.summary(true),comments.summary(true)`,
  `limit=50`, hasta `MAX_POSTS_PER_SYNC` (200) con tope de páginas propio
  (`MAX_MEDIA_PAGES`, contra el cursor-sin-datos que Instagram ya sufrió) y
  `windowWasCapped` honesto: tope alcanzado **o** cursor todavía en mano.
- **Insights por post**: `/{post-id}/insights?metric=post_impressions,post_impressions_unique`,
  en chunks secuenciales de 5 como Instagram (evitar 429). Un 404 o un error que Graph
  marque como "este post no tiene insights" vale `{}` para ese post; cualquier otro
  fallo (token muerto, rate limit, 5xx) aborta el sync — el mismo razonamiento de
  `isMediaWithoutInsights`, con helper propio.

### Mapeo de métricas

| `PostMetricValues` | Fuente en Graph |
|---|---|
| `views` | `post_impressions` |
| `reach` | `post_impressions_unique` |
| `likes` | `likes.summary.total_count` |
| `comments` | `comments.summary.total_count` |
| `shares` | `shares.count` (ausente = null, no cero) |
| `saves` | null — Facebook no lo reporta |

`mediaType`: desde `attachments.data[0].media_type` — `video` → `video`, `photo` →
`image`, `album` → `carousel`, cualquier otro (incl. sin attachment) → `link` como
valor nuevo del vocabulario, que hoy es abierto (`text` en el esquema).

## Esquema y registro

- `'facebook'` entra a `SOCIAL_NETWORKS` en `src/db/schema.ts`. Ninguna migración: las
  tablas ya son genéricas por red.
- `facebookConnector` entra a `CONNECTORS` en `src/lib/social/index.ts`; `syncAll` lo
  recorre solo, y un fallo suyo no cuesta el snapshot de las demás redes
  (`Promise.allSettled` existente).
- La etiqueta `?s=` sale de `campaignTagFor('facebook', id)` como en las demás redes.

## UI

`connections.tsx` itera las filas de `getConnections()` (`src/lib/posts.ts`), pero esa
función lista las redes con un literal propio `['instagram', 'tiktok', 'youtube']` y un
set `OAUTH_NETWORKS = new Set(['instagram', 'tiktok'])` aparte. Cambios:

- El literal pasa a derivarse de `SOCIAL_NETWORKS` del esquema, para que esta fase y
  las siguientes agreguen redes en un solo lugar.
- `'facebook'` entra a `OAUTH_NETWORKS` (conecta por botón, no por entorno).
- La grilla `sm:grid-cols-3` pasa a una forma que acomode 4 cards sin una fila coja
  (p. ej. `sm:grid-cols-2 lg:grid-cols-4`).

## Errores

- OAuth: frases fijas en español vía `OAuthError`, candidatos solo al log — contrato
  existente del callback.
- Sync: el error del conector cae en `lastSyncError` (truncado a 500), la card muestra
  el triángulo y el texto; `lastSyncedAt` no se estampa en un run fallido.
- `mayConnectAccount` protege contra reconectar con otra página; el mensaje existente
  del callback ya explica por qué no se cambia de cuenta desde el panel.

## Credenciales y entorno

- Reusa `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` (la app de Meta es una sola; el
  nombre queda — renombrarlas a `META_*` es un cambio de entorno en Vercel que no paga
  su riesgo en esta fase).
- Nueva opcional: `FACEBOOK_PAGE_ID` para desambiguar cuando hay varias páginas.
- Tokens cifrados con `lib/social/crypto`, como todos.

## Testing

`facebook.test.ts` + fixture `fixtures/facebook-posts.json`, siguiendo el patrón de
`instagram.test.ts`:

- `pickFacebookPage`: cero / una / varias páginas, con y sin `FACEBOOK_PAGE_ID`,
  mensajes distintos por diagnóstico.
- Normalización: mapeo completo de métricas, `shares` ausente → null, `saves` siempre
  null, `mediaType` por attachment.
- Paginación: corta en `MAX_POSTS_PER_SYNC`, respeta `MAX_MEDIA_PAGES` con cursor que
  no avanza, `windowWasCapped` en sus dos causas.
- Insights: el error "sin insights" por post vale `{}`; el error sistémico aborta.
