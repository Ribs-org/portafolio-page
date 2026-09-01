# Publishers de Threads y X — texto primero, con OAuth propio cada uno

Fecha: 2026-09-01
Estado: aprobado, pendiente de plan de implementación

Fases 4–5 del calendario de publicación (spec base:
`2026-08-31-calendario-publicacion-design.md`). Las fases 1–3 (Instagram, Facebook,
YouTube) están en producción. Estas dos redes son simétricas — texto primero, OAuth
nuevo, sin connector de lectura — y comparten un solo spec y un solo plan.

## Problema

El calendario publica en las tres redes de video/foto; Threads y X quedan fuera — y
son justamente las redes donde el dueño publica texto, el formato que el compositor
hoy ni siquiera permite (exige al menos un archivo).

## Objetivo

Marcar Threads y/o X en el compositor — incluso sin archivos — y que el cron publique
a la hora señalada: texto puro, o con imagen/video según lo que cada red acepte.

## No objetivos

- **Leer de Threads/X.** Sin connector: lo publicado no entra a la tabla de Contenido
  ni a la analítica, y sus cards dirán «Sincronizado nunca». Fase futura propia.
- **Video en X** (upload fragmentado) y **carrusel en Threads**. Fases futuras.
- **Texto alternativo por red en el compositor.** El límite se valida al programar
  (decisión del dueño: rechazar, no recortar ni pedir campos extra).
- **Métricas del tope mensual de X.** El tier Free (~500 posts/mes) sobra; si el tope
  llegara, el fallo es el visible de siempre.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Texto puro permitido cuando los destinos son solo Facebook/Threads/X | Exigir media siempre | Es el formato natural de estas redes; Instagram/YouTube siguen exigiendo archivo |
| Caption sobre el límite (X 280, Threads 500) se rechaza al programar | Recorte automático con «…»; captionOverride en la UI | Elegido por el dueño: honesto, sin cortes a ciegas y sin UI nueva |
| `code_verifier` de PKCE en cookie httpOnly | Meterlo en el `state` | El state viaja en URLs de X y sus logs; el verifier debe quedarse en el navegador↔servidor |
| Publishers con `ensureCredential` propio | Connectors de lectura mínimos | No hay lectura que hacer; el contrato ya prefiere la credencial del publisher (fase 3) |
| Refresh de X re-guarda access Y refresh token | Conservar el refresh original | X rota el refresh token en cada uso; conservar el viejo mata la sesión en 2 horas |
| Facebook gana el post de solo-texto | Restringir texto puro a Threads/X | `/feed` con `message` ya existe; negárselo sería una regla artificial |
| Un spec y un plan para las dos redes | Ciclo separado por red | Simetría total: mismo contrato, mismas costuras, tareas hermanas |

## OAuth

### Threads (molde de Instagram, app de Meta con el caso de uso «API de Threads»)

- **Connect**: `https://threads.net/oauth/authorize` con `client_id` =
  `THREADS_APP_ID`, scope `threads_basic,threads_content_publish`, state firmado.
- **Callback**: canje en `https://graph.threads.net/oauth/access_token` (corto) →
  `access_token?grant_type=th_exchange_token` (largo, ~60 días) → `GET /v1.0/me?fields=id,username`
  para id y handle. Guarda access token cifrado, `refreshToken` null, `expiresAt` real.
- **Refresh**: el `ensureCredential` del publisher llama
  `GET /refresh_access_token?grant_type=th_refresh_token` cuando quedan menos de 7
  días, y re-guarda cifrado — el molde del refresh de Instagram.
- Env nuevas: `THREADS_APP_ID`, `THREADS_APP_SECRET`.

### X (OAuth 2.0 + PKCE, primera vez en el repo)

- **Connect**: `https://x.com/i/oauth2/authorize` con `client_id` = `X_CLIENT_ID`,
  scope `tweet.read tweet.write users.read offline.access`, `code_challenge` S256.
  El `code_verifier` (aleatorio, base64url) viaja en una **cookie httpOnly, Secure,
  SameSite=Lax, max-age 10 min** que el callback lee y borra.
- **Callback**: canje en `https://api.x.com/2/oauth2/token` (form + Basic auth con
  client_id:client_secret) → `GET /2/users/me` para id y username. Guarda access y
  refresh cifrados, `expiresAt` real (~2 h).
- **Refresh**: `grant_type=refresh_token`; la respuesta trae refresh token NUEVO —
  se re-guardan ambos, cifrados (el molde de TikTok ya rota refresh tokens).
- Env nuevas: `X_CLIENT_ID`, `X_CLIENT_SECRET`.

## Publishers

Ambos con `ensureCredential` propio (no hay connector) y frases de rechazo propias
(«Threads rechazó la publicación.», «X rechazó la publicación.»).

### Threads

- **Texto**: `POST /v1.0/{user}/threads` con `media_type=TEXT, text=` → contenedor →
  `POST /{user}/threads_publish` con `creation_id` — publica en la misma corrida.
- **Imagen (una)**: igual con `media_type=IMAGE, image_url=` — misma corrida.
- **Video (uno)**: `media_type=VIDEO, video_url=` → `processing(containerId)`; las
  corridas siguientes consultan `GET /{container}?fields=status` (`FINISHED` →
  publicar; `ERROR` → fallo; resto → esperar) — la máquina de estados de siempre.
- **Más de un archivo** → fallo fijo «Threads recibe un solo archivo por post.»
- Límite de texto: 500 (validado al programar; el publisher no recorta).

### X

- **Texto**: `POST /2/tweets` con `{ text }` — misma corrida; el id del tweet es el
  `externalId`.
- **Imágenes (hasta 4)**: cada una se descarga del Blob y se sube binaria a
  `POST /2/media/upload` → `media_ids` en el tweet. Sin estados intermedios.
- **Video** → fallo fijo «X aún no recibe video desde el calendario.»
- Límite de texto: 280 (validado al programar).

## Validación por-destino

`validateScheduleDraft` aprende las reglas nuevas (sigue puro y testeado):

- `files === 0` es válido **solo si** ningún destino está en `{instagram, youtube}`
  — mensaje si no: «Instagram y YouTube necesitan al menos un archivo.»
- X marcado y `caption.length > 280` → «El texto excede los 280 caracteres de X.»
- Threads marcado y `caption.length > 500` → «El texto excede los 500 de Threads.»
- El límite general de 2200 y el resto de reglas quedan igual.

Facebook además gana la rama de solo-texto en su publisher: `POST /{page}/feed` con
`message` cuando no hay media.

## Esquema, registro y UI

- `SOCIAL_NETWORKS` gana `'threads'` y `'x'` (tipo TS; sin migración).
- Prefijos de campaña: `threads: 'th'`, `x: 'x'`.
- `networkLabel`: «Threads» y «X».
- `PUBLISHERS` gana los dos; `OAUTH_NETWORKS` y `ENABLED` del compositor también.
- Las cards nuevas en `/admin/content` muestran «Conectar →»; su «Sincronizado
  nunca» es permanente y esperado (no hay connector de lectura).

## Manejo de errores

Las reglas de siempre: frases fijas en español, detalle upstream al log truncado,
3 intentos, email al agotarse, corte de 24 h para `publishing`, claim contra corridas
solapadas.

## Testing

Helpers puros con Vitest: payloads de contenedores de Threads y clasificación de su
`status`; armado del tweet (texto, media_ids) y del cuerpo binario de subida;
reglas nuevas de validación (texto puro permitido/prohibido según destinos, límites
280/500 con sus bordes); frases fijas. Rutas y HTTP sin test, como todo el repo.

## Variables de entorno nuevas

`THREADS_APP_ID`, `THREADS_APP_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET` —
documentadas en el README.

## Trámites del dueño (paralelos al código)

- **Threads**: app de Meta → Casos de uso → agregar «API de Threads» → copiar el
  Threads App ID/Secret que genera → Vercel. El redirect a registrar en su config:
  `https://www.vicente-pareja.cl/api/social/threads/callback` (y la variante
  `.vercel.app`).
- **X**: cuenta en developer.x.com (Free) → proyecto + app → User authentication
  settings: OAuth 2.0, tipo Web App, permisos Read and write, los dos redirect
  (`.../api/social/x/callback`), website `https://www.vicente-pareja.cl` → copiar
  Client ID/Secret → Vercel.
