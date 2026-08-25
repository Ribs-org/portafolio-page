# Analítica de posts — métricas de plataforma unidas al tráfico propio

Fecha: 2026-08-25
Estado: aprobado, pendiente de plan de implementación

## Problema

La analítica actual mide todo lo que pasa *dentro* del sitio: visitas, únicos, clicks,
CTR, y las atribuye a una pieza de contenido mediante la etiqueta `?s=`. Lo que no sabe
es cuánta gente vio el post que generó ese tráfico.

Sin ese denominador, un reel con 300 visitas parece bueno o malo según el ánimo del día.
Con él, la pregunta se vuelve respondible: ¿de los 91.000 que lo vieron, cuántos llegaron
acá? Herramientas como Buffer tienen la mitad de plataforma (views, likes, comentarios)
pero no la de primera parte; este proyecto tiene la de primera parte pero no la de
plataforma. Ninguna de las dos calcula lo que resulta de unirlas.

## Objetivo

Una pestaña nueva en el panel donde cada post publicado en Instagram, TikTok o YouTube
aparece como una fila con sus métricas de plataforma **y** el tráfico que trajo al sitio,
ordenable por cualquier columna, y con una columna derivada — el arrastre — que solo
existe porque las dos mitades están unidas.

## No objetivos

- **Publicar o programar posts.** Esto lee, no escribe. Es analítica, no un Buffer completo.
- **Multi-usuario.** Igual que el resto del proyecto: un solo dueño.
- **Métricas de audiencia agregada** (seguidores, alcance de cuenta). Solo por post.
- **Comentarios individuales.** Se guarda el conteo, no el contenido.
- **Tiempo real.** Un snapshot diario es la granularidad del modelo.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| APIs oficiales de las redes | Carga manual, importar exports | El usuario quiere números que no dependan de recordar copiarlos |
| Las tres redes en una entrega | YouTube primero, resto después | Decisión explícita del usuario, asumiendo el riesgo de TikTok |
| Snapshots diarios acumulados | Guardar solo el último valor | El panel entero está construido sobre períodos; sin historia el `FilterBar` no puede decir nada sobre views |
| Etiqueta generada desde el id nativo | Emparejar a mano cada post | El cruce queda automático y para siempre, sin un paso manual por post |
| Cruce por string `campaign` | Foreign key de `visits` a `social_posts` | Las visitas se escriben mucho antes de que el post exista en la base; además editar la etiqueta re-liga el histórico sin migrar filas |

## Modelo de datos

Tres tablas nuevas en `src/db/schema.ts`.

### `social_accounts`

Una fila por red conectada. `network` es único: no se soportan dos cuentas de la misma
red.

`id`, `network` (`instagram` | `tiktok` | `youtube`), `handle`, `external_id`,
`access_token`, `refresh_token`, `expires_at`, `last_synced_at`, `last_sync_error`,
`created_at`.

`access_token` y `refresh_token` se guardan cifrados (ver *Credenciales*). YouTube no usa
OAuth: entra con `external_id` = channel id y ambos tokens en `null`. La misma forma
absorbe los tres casos sin ramificar el esquema.

### `social_posts`

Una fila por pieza de contenido publicada.

`id`, `network`, `external_id`, `permalink`, `caption`, `thumbnail_url`, `media_type`
(`reel` | `video` | `short` | `image` | `carousel`), `published_at`, `campaign` (único),
`archived_at`, `created_at`, `updated_at`.

Índices: único sobre `(network, external_id)`, índice sobre `campaign`.

- **`campaign`** es la etiqueta `?s=` que une este post con `visits`. Se genera desde el
  id nativo (`ig-C8xK2Lp`, `yt-dQw4w9WgXcQ`, `tt-7234...`) y es editable desde el panel.
  El upsert del sync **nunca la pisa**: en cuanto el usuario la edita, es suya. Como el
  cruce es por string, cambiarla a `reel-gimnasio` engancha retroactivamente todo el
  histórico de esa etiqueta.
- **`archived_at`** se marca cuando un post deja de venir en el fetch — borrado en la red.
  La fila no se elimina: perdería la historia de tráfico que ya trajo. Sale de la tabla
  por defecto, con un interruptor para verlos.

Se modela **una etiqueta por post**. En Instagram un reel y una story son objetos
distintos con ids distintos, así que cada uno es su propio post. Si aparece un caso real
que esto no cubra, ahí se agrega una tabla puente.

### `post_metrics`

Un snapshot acumulado por post por día local.

`id`, `post_id` (FK a `social_posts`, `on delete cascade`), `day` (date), `views`,
`likes`, `comments`, `shares`, `saves`, `reach`, `captured_at`.

Índice único sobre `(post_id, day)`.

- Los contadores son **acumulados**, no incrementos: es lo que devuelven las tres APIs.
  El delta de un período sale de restar el snapshot del borde inicial contra el final.
- Todas las métricas son **nullable**. `null` significa "esta red no reporta esto", que no
  es lo mismo que cero. TikTok no da `saves` ni `reach`; la Data API de YouTube no da
  `shares` ni `saves`. La UI muestra `—`, nunca `0`.
- El único sobre `(post_id, day)` hace el sync idempotente: correrlo diez veces el mismo
  día deja una sola fila.

`day` se calcula en `SITE_TIMEZONE`, igual que el resto del panel — no en UTC.

## Conectores

`src/lib/social/connector.ts` define el contrato:

```ts
export type FetchedPost = {
  externalId: string
  permalink: string | null
  caption: string | null
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: Date
  metrics: {
    views: number | null
    likes: number | null
    comments: number | null
    shares: number | null
    saves: number | null
    reach: number | null
  }
}

export type Connector = {
  network: string
  /** Refreshes the stored credential when it is close to expiring. */
  ensureCredential(account: SocialAccount): Promise<string | null>
  fetchPosts(account: SocialAccount, token: string | null): Promise<FetchedPost[]>
}
```

`instagram.ts`, `tiktok.ts` y `youtube.ts` lo implementan y son los **únicos** archivos
que saben cómo se llama un campo en cada API. El orquestador, las consultas y la vista
solo ven `FetchedPost`. Es la frontera que hace que agregar Threads algún día sea un
archivo nuevo más una línea en el registro de `index.ts`.

| Red | Endpoint | Auth | Métricas |
|---|---|---|---|
| Instagram | `/me/media` + `/{media-id}/insights` | Business Login for Instagram (OAuth). No requiere página de Facebook. App en modo desarrollo: sin App Review mientras el dueño sea el único usuario | views, likes, comments, shares, saves, reach |
| TikTok | Display API `video.list` | OAuth, scope `video.list`. Sandbox alcanza para la cuenta propia | view_count, like_count, comment_count, share_count |
| YouTube | Data API v3 `videos.list?part=statistics` | Solo API key. Sin OAuth, sin revisión | viewCount, likeCount, commentCount |

**Ventana de sincronización:** la lista completa de posts en cada corrida, con tope en los
200 más recientes — no solo los nuevos. Un reel de hace seis meses sigue ganando views, y
congelarlo el día que sale de la ventana sería mentir. El costo es despreciable: YouTube
gasta 1 unidad de cuota por lote de 50 videos sobre 10.000 diarias, y en Instagram y
TikTok son unas pocas páginas.

## Sincronización

`src/lib/social/sync.ts`:

```
syncAll()
  └─ Promise.allSettled sobre los conectores registrados
       └─ syncNetwork(network)
            1. lee la cuenta; si no existe o no tiene credencial → skip silencioso
            2. ensureCredential (refresca si expira en < 7 días)
            3. fetchPosts
            4. upsert de posts por (network, external_id) — sin tocar `campaign`
            5. upsert de métricas por (post_id, day)
            6. marca `archived_at` en los posts que faltaron *dentro de la ventana*
            7. escribe last_synced_at / last_sync_error
```

**Regla de archivado, con cuidado:** el fetch trae los 200 posts más recientes. Solo se
archivan los posts conocidos cuyo `published_at` cae **dentro** del rango que cubrió esa
respuesta — es decir, posteriores al más antiguo que sí vino. Sin esa acotación, el post
201 se marcaría como borrado en la primera corrida solo por quedar fuera del tope.

**Aislamiento de fallos:** cada conector corre en su propio try/catch y su error se guarda
en el `last_sync_error` de *esa* cuenta. TikTok caído significa un badge rojo en TikTok;
Instagram y YouTube terminan y guardan su snapshot igual. Esto es lo que hace defendible
haber elegido las tres redes juntas.

**Disparadores:**

- `GET /api/cron/sync-social` — protegido con `CRON_SECRET`, declarado en un `vercel.json`
  nuevo con `{ "crons": [{ "path": "/api/cron/sync-social", "schedule": "0 6 * * *" }] }`.
  El plan gratis permite una corrida diaria, que es exactamente la granularidad de
  `post_metrics`.
- Server action `syncSocialNow()` en `src/app/admin/actions.ts`, detrás de la sesión admin,
  con un freno de 5 minutos entre corridas para no quemar cuota a botonazos.

## Credenciales

`src/lib/social/crypto.ts`: AES-256-GCM con clave derivada de `AUTH_SECRET` vía HKDF.
Los tokens se cifran antes de escribirse y se descifran al leerse.

La base de datos es del dueño, pero un token de Instagram en texto plano dentro de un
backup de Neon es una llave a la cuenta de Instagram, y ya existe un secreto del cual
colgar la clave.

**Vida de los tokens:** el token largo de Instagram dura 60 días y se renueva con el uso —
el cron diario lo mantiene vivo sin intervención. El de TikTok dura 24 horas y se refresca
con su `refresh_token` (365 días). YouTube no tiene token que expirar.

## Rutas

### Admin

- `/admin/content` — la vista nueva. Pestaña *Contenido* en `nav.tsx`.

### API

- `GET /api/cron/sync-social` — corrida diaria, autenticada con `CRON_SECRET`.
- `GET /api/social/[network]/connect` — arma la URL de autorización con `state` firmado
  con `jose`. Detrás de la sesión admin. Solo aplica a `instagram` y `tiktok`.
- `GET /api/social/[network]/callback` — canjea el código, cifra y guarda los tokens.

**YouTube no pasa por OAuth.** Se configura con `YOUTUBE_API_KEY` y `YOUTUBE_CHANNEL_ID`
en el entorno, y su fila en `social_accounts` la crea el propio sync la primera vez que
corre con esas variables presentes. Su tarjeta en el panel no dice *Conectar*: dice
*Configurado por entorno*, o explica qué variable falta. Es la única de las tres que no
tiene botón.

## La vista

`/admin/content`, reusando el `FilterBar` existente. El selector de perfil sigue teniendo
sentido: filtra la mitad de primera parte. El rango es lo que hace que los snapshots
sirvan.

**Tira de conexiones** (arriba): tres tarjetas — Instagram, TikTok, YouTube — con handle,
última sincronización, botón *Conectar* / *Desconectar*, y el badge del `last_sync_error`
si esa red falló. Al lado, *Sincronizar ahora*. Discreta cuando todo está bien.

**KPIs**, con los `StatTile` y `delta()` existentes: Views, Interacciones
(likes + comentarios + compartidos), Visitas desde posts, Arrastre.

**Tabla de posts**, una fila por post, ordenable por cualquier columna:

| Post | Views | Likes | Coment. | Visitas | Clicks | CTR | Arrastre |
|---|---|---|---|---|---|---|---|
| miniatura + caption + red + fecha | acumulado, con delta del período | | | de `visits` por `campaign` | de `clicks` | clicks / visitas | visitas / views |

**Arrastre** es la columna que justifica el feature: de cada mil personas que vieron el
post, cuántas llegaron efectivamente al sitio. Buffer no puede calcularlo porque no sabe
qué pasa en el sitio; la analítica actual no puede porque no sabe cuánta gente vio el
post. Solo existe por haber unido las dos mitades.

Cada fila lleva el link completo con su etiqueta y un botón de copiar
(`https://<sitio>/?s=ig-C8xK2Lp`), y la etiqueta es editable en línea. Un post sin
tráfico todavía no muestra ceros: muestra el empujón *pega este link en el post*.

**Gráfico**, reusando `TrafficChart`: views ganadas por día contra visitas que trajeron.

**Coherencia con Analítica:** el panel *"Qué contenido te trae gente"* se queda — sigue
cubriendo etiquetas que no son un post (un link por WhatsApp, un QR en un flyer). Las
etiquetas que sí corresponden a un post pasan a mostrar su caption y miniatura en vez del
string pelado, y el panel gana un enlace *Ver por post →*. Las dos vistas se complementan
en vez de competir.

### Reglas de presentación

- `—` y nunca `0` cuando no hay dato: red que no reporta la métrica, o post cuya etiqueta
  aún no se pegó en ninguna parte.
- El arrastre solo se calcula con `views > 0` y etiqueta existente; si no, `—`.
- Un post publicado *dentro* del período no tiene snapshot inicial: su delta es el
  acumulado completo y la fila se marca como nueva, para no leerlo como crecimiento.
- Los posts archivados quedan ocultos tras un interruptor.

### Mejora puntual al código existente

`CampaignTable` ya implementa ordenamiento por columna con estado local. La tabla de posts
necesita lo mismo con más columnas. Se extrae **solo el hook de ordenamiento**
(`useSortedRows`) a `src/components/charts/use-sorted-rows.ts` y ambas lo usan. No se
generaliza la tabla entera: las celdas y el renderizado difieren lo suficiente como para
que una abstracción común sea peor que la duplicación.

## Variables de entorno

Todas **opcionales**. Sin ellas la red aparece como "no conectada" y el resto del sitio
funciona idéntico — se mantiene la promesa del README de forkear y desplegar en diez
minutos sin tocar una sola API.

| Variable | Para qué |
|---|---|
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | OAuth de Business Login for Instagram |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | OAuth de la Display API |
| `YOUTUBE_API_KEY` | Data API v3 |
| `YOUTUBE_CHANNEL_ID` | Canal a sincronizar |
| `CRON_SECRET` | Autentica la corrida diaria. La inyecta Vercel |

Se documentan en `.env.example` y en la sección correspondiente del README.

## Tests

Se agrega **vitest** al proyecto, que hoy no tiene infraestructura de tests: la
dependencia, un `vitest.config.ts` mínimo y un script `"test": "vitest run"` en
`package.json`. Cubre las piezas puras donde los bugs se esconden y que se prueban sin
tocar la red:

- **`crypto.ts`** — cifrar y descifrar da el valor original; un texto cifrado manipulado
  falla en vez de devolver basura.
- **Resta entre snapshots** — el delta de un período, incluyendo los bordes: post sin
  snapshot inicial, período sin ningún snapshot, contador que retrocede (Instagram corrige
  views a la baja a veces) → el delta se piso en 0, no en negativo.
- **Generación de etiquetas** — determinista por `(network, externalId)`, y estable ante
  ids con caracteres que no sirven en una query string.
- **Normalizadores de cada conector** — una respuesta grabada de cada API como fixture, y
  la aserción de que produce el `FetchedPost` esperado, con `null` donde esa red no
  reporta la métrica.

Fuera de alcance: los conectores contra la red real y los componentes de UI.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| TikTok resulta inviable en la práctica (aprobación, scopes) | El aislamiento de fallos hace que las otras dos funcionen igual. Si se traba, se entrega sin TikTok y la fila se agrega después sin rediseñar nada |
| Meta cambia la API o exige App Review | El conector es un archivo aislado. Mientras tanto, el modo desarrollo cubre al dueño como único usuario |
| Un post sin etiqueta pegada se ve "vacío" y parece un bug | La celda muestra el empujón para pegar el link, no ceros |
| El cron diario se salta un día y se pierde un snapshot | El delta se calcula contra el snapshot más cercano al borde, no contra uno exacto |

## Criterios de aceptación

1. Conectar Instagram, TikTok y YouTube desde `/admin/content` deja las tres tarjetas en
   verde con su handle y la fecha de sincronización.
2. *Sincronizar ahora* trae los posts y escribe un snapshot; correrlo dos veces seguidas
   no duplica filas.
3. La tabla ordena por views, likes, comentarios, visitas, clicks, CTR y arrastre.
4. Pegar el link con la etiqueta de un post y visitarlo hace que esa fila muestre visitas
   y arrastre en la siguiente carga.
5. Desconectar una red no borra sus posts ni su historia de métricas.
6. Con las tres variables de entorno ausentes, el sitio compila, despliega y funciona
   igual que antes.
7. `npm run lint`, `npm run typecheck` y `npm test` pasan.
