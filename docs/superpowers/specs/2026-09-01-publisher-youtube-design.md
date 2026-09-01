# Publisher de YouTube — subir videos programados con OAuth de Google

Fecha: 2026-09-01
Estado: aprobado, pendiente de plan de implementación

Fase del calendario de publicación (spec base:
`2026-08-31-calendario-publicacion-design.md`). Las fases 1–2 (núcleo + Instagram,
Facebook) están en producción. Esta fase agrega el primer publisher cuya credencial de
escritura no es la de lectura: OAuth de Google para subir, API key intacta para el sync.

## Problema

El calendario publica en Instagram y Facebook; YouTube sigue siendo manual. Y a
diferencia de las redes de Meta, el repo no tiene nada de OAuth de Google: el YouTube
actual es solo-lectura por `YOUTUBE_API_KEY`, sin tokens, sin refresh, sin callback.

## Objetivo

Marcar YouTube en el compositor y que el cron suba el video a la hora programada:
título = primera línea del caption, descripción = caption completo, público, y el chip
pasando por los mismos estados que las demás redes.

## No objetivos

- **Tocar el sync de YouTube.** Sigue por API key; esta fase solo escribe.
- **Thumbnails, playlists, etiquetas, categoría.** Defaults de YouTube.
- **Shorts como tipo aparte.** YouTube clasifica solo: un vertical corto ES un Short.
- **Threads y X.** Fases siguientes.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Verificar la app OAuth de Google (trámite en paralelo) | Quedarse en modo Testing | En Testing los refresh tokens mueren a los 7 días — reconexión semanal perpetua. Mientras Google revisa, Testing con el dueño como test user permite construir y probar ya |
| Título = primera línea del caption, recortada a 100 | Campo de título propio; reusar captionOverride | Cero UI y cero columnas nuevas; los títulos reales del canal ya tienen esa forma. captionOverride mezclaría dos conceptos |
| `Publisher.ensureCredential` opcional; el orquestador lo prefiere al del connector | Hacer OAuth-aware al connector de YouTube | El connector de lectura no debe saber de escritura; una condición en `run.ts` y las otras redes ni se enteran |
| Tokens de Google en la fila `youtube` de `social_accounts` | Tabla nueva de credenciales de escritura | La fila existe y tiene las columnas exactas (access/refresh/expiresAt cifradas); el sync la ignora |
| `processing(videoId)` hasta `status.uploadStatus = processed` | Declarar publicado al recibir el id | Mismo anti-adivinanza de Instagram/Facebook: un video que YouTube rechaza al procesar no debe figurar publicado |
| `selfDeclaredMadeForKids: false`, `privacyStatus: public` | Preguntar por post | El canal es de negocios/emprendimiento — no es contenido infantil; público es el único caso de uso del calendario |

## OAuth de Google

Rama `youtube` en las rutas genéricas `/api/social/[network]/connect|callback`:

- **Connect**: `https://accounts.google.com/o/oauth2/v2/auth` con `client_id` =
  `GOOGLE_CLIENT_ID`, scopes `youtube.upload` **y** `youtube.readonly` (corrección
  post-producción: upload es solo-escritura y no autoriza `channels.list` ni
  `videos.list` — el descubrimiento del canal y el poll de procesamiento fallaban
  con 403; ambos scopes son sensibles de la misma clase),
  `access_type=offline` y `prompt=consent` — sin ese par Google no entrega refresh
  token en re-consentimientos. `state` firmado igual que las demás redes.
- **Callback**: `youtubeCredential()` canjea el código en
  `https://oauth2.googleapis.com/token` y guarda: `accessToken` cifrado (dura ~1 h),
  `refreshToken` cifrado, `expiresAt` real (de `expires_in`), `externalId` = id del
  canal (de `channels?part=id&mine=true`), `handle` = título del canal. Frases de
  error fijas en español; el detalle de Google al log.
- La card de YouTube en `/admin/content` se vuelve una card OAuth estándar:
  `OAUTH_NETWORKS` gana `'youtube'`, con lo que muestra «Conectar →» hasta otorgar la
  credencial de escritura (la etiqueta «Configurado por entorno» desaparece — el sync
  por API key sigue intacto por debajo, solo cambia lo que la card enfatiza).

## Contrato: `ensureCredential` opcional en `Publisher`

```ts
type Publisher = {
  network: string
  ensureCredential?(account: SocialAccount): Promise<string | null>
  publish(input: PublishInput): Promise<PublishOutcome>
}
```

`run.ts`: `publisher.ensureCredential ?? connector.ensureCredential`. El de YouTube
refresca cuando `expiresAt` venció: canje del refresh token, re-guardado cifrado
(mismo molde que el refresh de TikTok/Instagram en los connectors), null si no hay
refresh token — que el orquestador ya convierte en fallo con `NO_PUBLISH_TOKEN`.

## El publisher

- **Solo video**: media con fotos → fallo fijo «YouTube solo recibe video.» (mismo
  patrón que la mezcla de Facebook). La validación global del compositor no cambia.
- **Subida**: el cron descarga el video del Blob y lo sube con `videos.insert`
  (`uploadType=multipart`, snippet + status en JSON, el binario a continuación;
  dentro del límite de cuerpo de las functions). `snippet.title` = primera línea del
  caption recortada a 100 (helper puro `youtubeTitle(caption)`; con caption vacío el
  título es `Video` — YouTube exige título no vacío), `snippet.description`
  = caption completo, `status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }`.
- **Estados**: la respuesta trae el id del video de inmediato → `processing(videoId)`.
  Corridas siguientes: `videos.list?part=status&id=` → `uploadStatus` `processed` →
  publicado (`externalId` = video id, que además es link directo `youtu.be/<id>`);
  `failed`/`rejected` → fallo con frase fija; el resto sigue esperando.
- Cuota: `videos.insert` cuesta ~1600 unidades de las 10.000 diarias — sobra para un
  calendario personal; sin manejo especial.

## UI

Solo `ENABLED` del compositor gana `'youtube'`. Chips, reintentos, email y
reprogramar ya funcionan por el contrato.

## Manejo de errores

Las reglas de siempre: frases fijas en español al dueño, detalle upstream al log,
3 intentos, email al agotarse, corte de 24 h en `publishing`.

## Testing

Helpers puros con Vitest: `youtubeTitle` (primera línea, recorte a 100, caption
vacío), armado del multipart/metadata, clasificación de `uploadStatus`, rechazo de
media con fotos. Rutas y subida real sin test, como todo el repo.

## Variables de entorno nuevas

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (el OAuth client que el dueño crea en
  Google Cloud Console, mismo proyecto de la API key). Documentadas en el README.

## Trámite del dueño (paralelo al código)

En Google Cloud Console: OAuth Client ID tipo Web con redirect
`https://www.vicente-pareja.cl/api/social/youtube/callback`; pantalla de
consentimiento External con dominio y política (`/privacidad`) y el scope
`youtube.upload`; agregarse como test user; enviar a verificación. El código funciona
en Testing desde el día uno (tokens de 7 días) y queda duradero al aprobarse.
