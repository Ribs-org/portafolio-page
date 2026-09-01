# Calendario de publicación — programar posts y que se publiquen solos

Fecha: 2026-08-31
Estado: aprobado, pendiente de plan de implementación

Fase 1 de 6 del plan acordado: **núcleo + Instagram**, Facebook, Threads, X, YouTube,
TikTok. Cada fase es su propio ciclo spec → plan → implementación. Las fases 2–6 son
«un publisher más»: esta fase construye todo lo demás.

## Problema

El panel lee lo que ya pasó: el sync nocturno trae posts y métricas. Publicar sigue
siendo artesanal — abrir cada app, pegar el texto, subir el archivo, acordarse de la
hora. No hay dónde planificar el contenido de la semana ni nada que publique por ti.

## Objetivo

Una sección nueva «Calendario» en el admin: compones una vez (texto + fotos o video +
plataformas destino + fecha y hora), y un cron publica cada destino a su hora sin
intervención. Lo publicado entra solo al catálogo de analítica en el siguiente sync
nocturno, cerrando el círculo con el panel existente.

## No objetivos

- **Facebook, Threads, X, YouTube, TikTok.** Fases 2–6; acá solo queda listo el
  enchufe (`PUBLISHERS[]`, checkboxes deshabilitados con «próximamente»).
- **Historias de Instagram.** Solo feed: foto, video/reel y carrusel.
- **Borradores.** Componer y programar es un solo gesto. Se agrega si se echa de menos.
- **Editar un post ya publicado, o publicar «ahora mismo».** Programar con la hora en
  el pasado inmediato cubre el segundo caso sin código extra.
- **Métricas propias del calendario.** La analítica ya existe; esto solo escribe.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Contrato `Publisher` + `PUBLISHERS[]`, espejo de `Connector` + `CONNECTORS[]` | Orquestar con Vercel Workflow (WDK) | La durabilidad que WDK regala se logra con estados entre corridas del cron, sin meter un runtime nuevo a un repo cuyo patrón ya funciona |
| Un post, varios destinos, **estado por destino** | Un post por plataforma | Compones una vez; si un destino falla y otro publica, el calendario muestra exactamente eso |
| Media en Vercel Blob | Subir el archivo a Meta directo desde el navegador | La Graph API de Instagram exige URLs públicas; Blob ya está configurado en el proyecto y las da |
| Video con máquina de estados entre corridas del cron | Esperar el procesamiento dentro de una corrida | Meta procesa video de forma asíncrona y sin plazo; un serverless esperando es un timeout esperando a ocurrir |
| Reintentos: 3 intentos entre corridas, después `fallido` + un email | Fallar a la primera / reintentar para siempre | Un blip de Meta no debe botar un post; un post imposible no debe reintentar eternamente ni mandar un correo por intento |
| Email por Resend (Vercel Marketplace) | SMTP a mano, u otro proveedor | Único proveedor de messaging del marketplace; provisión y variables de entorno unificadas |
| Hora editada en `SITE_TIMEZONE`, guardada en UTC | Guardar hora local | La convención del esquema existente; una sola verdad en la base |

## Modelo de datos

Tres tablas nuevas en `src/db/schema.ts`. Ninguna existente cambia.

- **`scheduled_posts`** — lo que compones una vez: `caption` (texto base),
  `scheduledAt` (timestamptz), timestamps. Sin columna de estado: el estado del post
  es el resumen de sus destinos.
- **`scheduled_post_targets`** — una fila por plataforma destino: `network`
  (`SocialNetwork`), `captionOverride` (null = usa el base), `status`
  (`scheduled → publishing → published | failed`), `containerId` (contenedor de Meta
  mientras un video procesa), `externalId` (el post ya publicado), `attemptCount`,
  `lastError` (frase fija en español, nunca texto upstream — la convención de todo el
  repo). Índice por (`status`, post vencido) para la consulta del cron.
- **`scheduled_post_media`** — una fila por archivo: `blobUrl`, `mediaType`
  (`image | video`), `position` (orden del carrusel).

## El contrato `Publisher`

`src/lib/social/publish/publisher.ts`, espejo deliberado de `connector.ts`:

```ts
type Publisher = {
  network: SocialNetwork
  publish(input: PublishInput): Promise<PublishOutcome>
}
// PublishInput: caption efectivo, media[], containerId (si venía procesando), token
// PublishOutcome:
//   { kind: 'published'; externalId: string }
// | { kind: 'processing'; containerId: string }
// | { kind: 'failed'; reason: string }        // frase fija en español
```

Registrado en `PUBLISHERS: Publisher[]` en `src/lib/social/publish/index.ts`.
Agregar una red en fases futuras = un archivo + una línea, igual que los connectors.

### Publisher de Instagram (`src/lib/social/publish/instagram.ts`)

Reusa `ensureCredential` del connector de Instagram existente — mismo token, mismo
cifrado, cero credenciales nuevas. `instagram_content_publish` está autorizado en la
app de Meta desde el primer consentimiento. Tres flujos de la Graph API:

- **Foto**: `POST /{ig-user}/media` (image_url, caption) → `POST /{ig-user}/media_publish`.
- **Video/reel**: `POST /{ig-user}/media` (video_url, media_type=REELS) → devuelve
  `processing` con el contenedor; corridas siguientes consultan
  `GET /{container}?fields=status_code` hasta `FINISHED` → `media_publish`.
  `ERROR` del contenedor → `failed` con frase fija.
- **Carrusel**: contenedores hijos (`is_carousel_item`) → contenedor padre
  (`media_type=CAROUSEL, children=`) → `media_publish`. Si algún hijo es video, el
  padre también pasa por `processing`.

Helpers puros y testeables para armar cada payload y para clasificar la respuesta,
siguiendo la densidad de comentarios de `instagram.ts`.

## El cron de publicación

`vercel.json` gana un segundo cron: `/api/cron/publish-social`, **cada 5 minutos**,
protegido por `CRON_SECRET` igual que el de sync. Cada corrida:

1. Toma los destinos vencidos: `scheduledAt <= now()` con `status = 'scheduled'`, más
   los `publishing` con `containerId` pendiente.
2. Llama al publisher de cada uno, secuencialmente (el volumen es de una persona, no
   hay apuro; la lección de los chunks del sync aplica).
3. Transiciones: `published` guarda `externalId` y termina; `processing` guarda el
   contenedor y espera la próxima corrida; `failed` suma intento — con menos de 3
   vuelve a `scheduled` (reintento en la corrida siguiente), al tercero queda
   `failed` con motivo y dispara **un solo email** por Resend («No se pudo publicar
   “…” en Instagram: …»). Nunca un correo por reintento.

**Plan de Vercel**: los crons de Hobby corren máximo una vez al día; cada 5 minutos
pide plan Pro. Alternativa sin costo: un pinger externo (p. ej. cron-job.org) llamando
al endpoint con el secret. El endpoint es idéntico en ambos casos; la decisión se toma
al implementar, no cambia el diseño.

## UI

Sección nueva **«Calendario»** en el dashboard (`/admin/(dash)/schedule`), junto a
Contenido y Analítica.

- **Compositor**: textarea del caption, subida de archivos a Vercel Blob (foto(s) o un
  video; varias fotos = carrusel, en el orden en que se suben), checkboxes de
  destino derivados de `SOCIAL_NETWORKS` — fase 1: solo Instagram habilitado, el resto
  visible pero deshabilitado con «próximamente» —, y fecha/hora en `SITE_TIMEZONE`.
- **Cola**: lista de próximos posts ordenada por fecha con chip de estado por destino
  (programado / publicando / publicado con link al post / fallido con su motivo).
- **Reprogramar**: en un destino `failed`, elegir nueva hora lo devuelve a
  `scheduled` con `attemptCount` en cero y `lastError` limpio.
- Server actions en `src/app/admin/actions.ts`, siguiendo las existentes (crear,
  reprogramar, eliminar un programado que aún no publicó).

## Manejo de errores

- Motivos de fallo que ve el dueño: frases fijas en español. El detalle upstream de
  Meta va al log del servidor, nunca a la UI ni al email — la regla de todo el repo.
- El email de fallo es best-effort: si Resend falla, se loguea y el estado `failed`
  en el calendario sigue siendo la fuente de verdad.
- Un destino `publishing` cuyo contenedor Meta reporta `ERROR` falla con frase fija;
  uno cuyo contenedor desaparece (404) también — nunca queda colgado para siempre:
  `publishing` con más de 24 horas pasa a `failed` («Instagram no terminó de procesar
  el video»).

## Testing

Convención del repo: helpers puros con Vitest, sin tests de route handlers ni de UI.

- Selección de vencidos (qué filas toma una corrida, incluidos `publishing` pendientes
  y el corte de 24 horas).
- Transiciones de estado (reintento vs fallo definitivo, reprogramar limpia intentos).
- Armado de payloads de Instagram (foto, video, carrusel) y clasificación de
  respuestas (`published` / `processing` / `failed`).
- El email se dispara exactamente una vez por destino fallido.

## Variables de entorno nuevas

- Las de **Resend** (las provisiona el marketplace al instalar la integración).
- Nada más: Blob (`BLOB_READ_WRITE_TOKEN`), `CRON_SECRET`, `SITE_TIMEZONE` y las
  credenciales de Meta ya existen.
