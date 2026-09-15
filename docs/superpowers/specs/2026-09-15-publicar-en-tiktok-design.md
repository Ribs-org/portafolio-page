# Publicar en TikTok — Content Posting API, y sus comentarios por la API for Business

Fecha: 2026-09-15
Estado: aprobado, pendiente de plan de implementación

Fase del calendario de publicación (spec base:
`2026-08-31-calendario-publicacion-design.md`) y de la cola de comentarios (spec base:
`2026-09-11-comentarios-design.md`). TikTok es la única red del panel que hoy solo lee:
el conector de `video.list` trae métricas desde agosto, pero el compositor la deja gris.
Esta fase la vuelve publicable y le suma comentarios, y de paso rehace la revisión de la
app en TikTok for Developers, que fue rechazada el 2026-09-14.

## Problema

Tres cosas a la vez:

1. **El compositor no publica en TikTok.** `PUBLISHABLE`, `ENABLED`, `NETWORKS` y
   `PUBLISHERS` la excluyen con el mismo comentario: «tiktok lee pero no puede postear
   todavía».
2. **La cola de comentarios no ve TikTok.** Y la app de TikTok for Developers no puede
   verla nunca: no existe scope de comentarios en ese portal. Leer y responder
   comentarios de videos orgánicos vive en la **TikTok API for Business**, otro portal,
   otra app, otras credenciales, otra revisión, y exige cuenta Business.
3. **La revisión de TikTok fue rechazada** por tres motivos: el video demo no mostraba
   el flujo completo en sandbox, había scopes sin demostrar, y el icono de Basic Info no
   coincidía con el favicon del sitio.

## Objetivo

Marcar TikTok en el compositor y que el cron publique a la hora programada un video o un
carrusel de fotos en la cuenta del dueño, con las opciones que TikTok obliga a pedir; o,
si el dueño lo marca, dejarlo en su bandeja de TikTok como borrador. Que los comentarios
de esos videos entren en la misma cola que Instagram, Facebook y YouTube. Y pasar la
revisión de TikTok for Developers de una vez, con los cuatro scopes demostrados.

## No objetivos

- **Publicar TikTok desde el teléfono.** La app Expo no tiene dónde mostrar el bloque de
  opciones obligatorias; `REDES_PUBLICABLES` del móvil no cambia en esta fase.
- **Webhooks de TikTok.** El estado se consulta desde el cron, como Instagram y YouTube.
- **Subida por trozos (`FILE_UPLOAD`).** TikTok descarga desde la URL pública de R2;
  las fotos solo aceptan ese modo, así que el video usa el mismo camino.
- **Etiqueta de contenido generado por IA (`is_aigc`), música automática
  (`auto_add_music`).** Quedan en `false`.
- **Editar las opciones de TikTok desde el editor de posts ya programados.** Se fijan en
  el compositor y en el lote; el editor las muestra pero no las cambia.
- **Privado (DM) para TikTok.** El módulo `privado.ts` sigue apagado y sin red nueva.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Columna `opciones` jsonb en `scheduled_post_targets` | Meterlas en `scheduled_posts.atributos`; valores fijos en código | `atributos` es la taxonomía libre del editor con IA y es por post, no por destino. Valores fijos violan la guía de TikTok: la privacidad no puede venir preseleccionada y la auditoría revisa justo esa pantalla |
| `PULL_FROM_URL` para video y fotos | `FILE_UPLOAD` para video | Las fotos solo aceptan URL, así que el dominio de R2 hay que verificarlo igual; con eso el video usa el mismo camino y la función no mueve bytes |
| Modo borrador (`video.upload`) además del directo (`video.publish`) | Solo directo | El portal agrega `video.upload` al sumar Content Posting API y no deja quitarlo; el revisor exige ver cada scope, así que hay que usarlo |
| Comentarios por la API for Business, credencial en tabla propia | Segunda fila en `social_accounts`; columnas extra en la fila de TikTok | Son dos apps con vidas distintas; una fila por `(network, external_id)` no puede tener dos pares de tokens, y una pseudo-red `tiktok_business` contaminaría cuentas, sync y KPIs |
| `processing(publish_id)` hasta `PUBLISH_COMPLETE` | Declarar publicado al recibir el `publish_id` | Mismo anti-adivinanza de Instagram y YouTube: TikTok puede fallar al descargar o moderar, y eso no debe figurar como publicado |
| Un error de red al consultar estado no gasta intento | Reintentar el `init` | Reintentar subiría una segunda copia; el `publish_id` ya existe y se vuelve a preguntar en la corrida siguiente |
| Caption de foto: título = primera línea recortada a 90, descripción = caption completo | Pedir título aparte | TikTok separa título (90) y descripción (4000) solo en fotos; misma regla de YouTube, cero UI nueva |
| TikTok entra en `tocaSondear` cada 30 minutos | Cada 5 como Meta | La API for Business tiene cuota diaria por app; misma cadencia que YouTube |

## 1. Scopes y OAuth de Login Kit

`connect/route.ts` pasa de `user.info.basic,video.list` a
`user.info.basic,video.list,video.upload,video.publish`. Nada más cambia en el connect ni
en el callback: TikTok devuelve el mismo `open_id` y el mismo par de tokens con los
scopes ampliados.

Las cuentas ya conectadas tienen tokens sin los scopes de escritura. `ensureCredential`
no puede saberlo hasta que `creator_info` responda `scope_not_authorized`; el publisher
convierte eso en la frase fija `TIKTOK_RECONECTAR` («Reconecta TikTok para autorizar la
publicación.») y el chip del destino en el calendario muestra esa frase y el bloque del
compositor la repite; la tarjeta de Cuentas no cambia, porque el publisher no escribe en
la cuenta.

## 2. Opciones por destino: `scheduled_post_targets.opciones`

Migración: columna `opciones jsonb` nullable. Solo TikTok la usa en esta fase.

```ts
type OpcionesTikTok = {
  modo: 'directo' | 'borrador'
  // Solo en modo directo:
  privacidad?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
  comentarios?: boolean   // true = permitir → disable_comment: false
  duo?: boolean           // solo video
  pegar?: boolean         // solo video
  comercial?: 'no' | 'marca_propia' | 'patrocinado'
}
```

Módulo nuevo `src/lib/social/publish/opciones.ts`: `validarOpciones(network, raw)`
devuelve `{ ok: true, opciones }` o `{ ok: false, error }` con una frase fija. Reglas
de TikTok:

- `modo` obligatorio.
- En `directo`: `privacidad` obligatoria (frase `TIKTOK_SIN_PRIVACIDAD`: «TikTok necesita
  que elijas la privacidad.»); `comercial = 'patrocinado'` con `privacidad = 'SELF_ONLY'`
  se rechaza (`TIKTOK_PATROCINADO_PRIVADO`: «Un contenido patrocinado no puede ser
  privado.»). Casillas ausentes valen `false`.
- En `borrador`: cualquier otro campo se ignora y no se guarda.
- Máximo 2000 caracteres serializados, plano, sin claves desconocidas.

Quién la escribe:

- **Compositor** (`composer.tsx` + acción en `actions.ts`): el bloque TikTok (§4) se
  serializa como `opciones[tiktok]` y la acción valida antes de insertar el destino.
- **Lote y CSV** (`batch.ts`, `csv.ts`, `/api/schedule/batch`): columna opcional
  `opciones` por fila con el mismo objeto en JSON. Una fila TikTok sin `opciones`
  válidas se rechaza con la frase de arriba, como se rechaza hoy una fila de X con
  video.
- **Editor** (`[id]/editor.tsx`): muestra las opciones en texto plano bajo el destino;
  no las edita.

## 3. El publisher: `src/lib/social/publish/tiktok.ts`

Base de API: `https://open.tiktokapis.com/v2`. Todas las llamadas con
`Authorization: Bearer` y `Content-Type: application/json; charset=UTF-8`.
`ensureCredential` no se define: el del connector de lectura (`tiktok.ts`) ya refresca el
token cada 24 horas y sirve para los dos usos.

### Primera corrida (sin `containerId`)

1. **Validación local** (en `validate.ts`, antes de llamar a nada): un solo video
   (MP4, MOV o WebM), o de 1 a 35 fotos (JPG o WebP), nunca mezcla; caption hasta 2200.
   Frases fijas: `TIKTOK_MEDIA` («TikTok recibe un video, o hasta 35 fotos JPG o
   WebP.»).
2. **Modo directo**: `POST /post/publish/creator_info/query/`. Guarda
   `creator_nickname` para el log. Si `privacy_level_options` no contiene la privacidad
   elegida → `failed` con `TIKTOK_PRIVACIDAD_NO_DISPONIBLE` («TikTok ya no permite esa
   privacidad en tu cuenta; edita la publicación.»). Si `comment_disabled`,
   `duet_disabled` o `stitch_disabled` vienen en `true` y la opción pide permitirlos, se
   fuerzan a no permitidos sin fallar (TikTok los deshabilitaría igual). La duración no se
   comprueba localmente: el repo no la conoce y `duration_check_failed` de TikTok la
   cubre con `TIKTOK_ARCHIVO`. Error `scope_not_authorized` → `TIKTOK_RECONECTAR`.
3. **Init**:
   - Video directo: `POST /post/publish/video/init/` con
     `post_info { title: caption, privacy_level, disable_comment, disable_duet,
     disable_stitch, video_cover_timestamp_ms: 0, brand_organic_toggle,
     brand_content_toggle }` y `source_info { source: 'PULL_FROM_URL', video_url }`.
   - Fotos directo: `POST /post/publish/content/init/` con `post_mode: 'DIRECT_POST'`,
     `media_type: 'PHOTO'`, `post_info { title: primeraLinea(caption, 90),
     description: caption, privacy_level, disable_comment, auto_add_music: false,
     brand_organic_toggle, brand_content_toggle }` y `source_info { source:
     'PULL_FROM_URL', photo_images: [urls en orden], photo_cover_index: 0 }`.
   - Video borrador: `POST /post/publish/inbox/video/init/` solo con `source_info`.
   - Fotos borrador: `POST /post/publish/content/init/` con `post_mode:
     'MEDIA_UPLOAD'`, `media_type: 'PHOTO'`, `post_info { title, description }` y el
     mismo `source_info`.
   - `brand_organic_toggle = comercial === 'marca_propia'`,
     `brand_content_toggle = comercial === 'patrocinado'`.
4. Respuesta `data.publish_id` → `{ kind: 'processing', containerId: publish_id }`.
   Error HTTP o `error.code !== 'ok'` → `failed` con `TIKTOK_RECHAZO` («TikTok rechazó
   la publicación.»); el detalle al `console.error`. `url_ownership_unverified` tiene
   su propia frase (`TIKTOK_DOMINIO`: «TikTok no reconoce el dominio de tus archivos;
   verifícalo en el portal.») porque el dueño lo arregla sin tocar el post.

`video_url` y `photo_images` son las URLs públicas de R2 tal como llegan en
`PublishMedia.url`. El cover subido por el dueño (`coverUrl`) no se usa: TikTok no
acepta portada externa; en video es el primer frame y en fotos la primera imagen.

### Corridas siguientes (con `containerId`)

`POST /post/publish/status/fetch/` con `{ publish_id }`:

| `status` | Resultado |
|---|---|
| `PUBLISH_COMPLETE` | `published` con `externalId` = primer `publicaly_available_post_id`, o `null` si la lista viene vacía: un post privado (lo único posible hasta la auditoría) puede no recibir el id nunca, y dejarlo 24 h en «publicando» para terminar en fallo sería mentir sobre un post que salió. Cuando llega, es el mismo `video.id` del connector de lectura y las métricas cruzan |
| `SEND_TO_USER_INBOX` | Solo en modo borrador: `published` con `externalId: null`. El destino queda en el calendario con la leyenda «En tu bandeja de TikTok» (§4) |
| `FAILED` | `failed` con frase según `fail_reason`: `file_format_check_failed`, `picture_size_check_failed`, `duration_check_failed`, `frame_rate_check_failed` → `TIKTOK_ARCHIVO` («TikTok no acepta el archivo: revisa formato, tamaño o duración.»); `auth_removed`, `scope_not_authorized` → `TIKTOK_RECONECTAR`; `url_ownership_unverified` → `TIKTOK_DOMINIO`; `spam_risk*` y el resto → `TIKTOK_RECHAZO` |
| `PROCESSING_DOWNLOAD`, `PROCESSING_UPLOAD`, otro | sigue `processing` |
| error HTTP o de red | sigue `processing` (no gasta intento) |

`PublishOutcome.published` pasa a admitir `externalId: string | null`; `resolveOutcome`
y `post-attributes.ts` ya toleran null porque el join es por igualdad.

### Límites de TikTok que el cron respeta

Seis `init` por minuto y treinta `status/fetch` por minuto por token. Una corrida
publica como mucho lo que venció en cinco minutos; no hace falta cola propia, pero el
publisher devuelve `processing` sin llamar si en la misma corrida ya hizo seis `init`
para esa cuenta (contador en memoria del módulo, se reinicia por invocación). En modo
borrador TikTok admite cinco pendientes por 24 horas; el sexto falla con
`spam_risk_too_many_pending_share` → `TIKTOK_BANDEJA_LLENA` («Tienes 5 borradores
pendientes en TikTok; publica alguno antes.»).

## 4. UI

### Compositor

Al marcar TikTok aparece el bloque «TikTok», debajo de los destinos, con:

1. **Cuenta**: avatar y nombre desde `creator_info` (se consulta con una acción de
   servidor al marcar la casilla; si falla, el bloque muestra «No pude leer tu cuenta
   de TikTok» y deja publicar igual, porque el cron vuelve a consultar).
2. **Casilla «Enviar como borrador a mi bandeja de TikTok»**. Apagada. Al encenderla se
   ocultan los puntos 3 a 5 y aparece: «Te llegará una notificación en TikTok para
   terminar la publicación desde el teléfono.»
3. **Privacidad**: select con placeholder «Elige quién puede verlo» y las opciones que
   devolvió `privacy_level_options`, traducidas: Todos, Amigos mutuos, Seguidores, Solo
   yo. Sin valor inicial. Requerido en el formulario.
4. **Permitir**: tres casillas apagadas, «Comentarios», «Dúos», «Pegar (Stitch)». Las
   dos últimas desaparecen si los archivos son fotos. Las que `creator_info` reporta
   deshabilitadas salen grises y apagadas.
5. **Contenido comercial**: interruptor apagado «Este contenido promociona una marca».
   Al encenderlo, dos opciones: «Mi marca» (texto: «Se etiquetará como Contenido
   promocional») y «Contenido patrocinado» (texto: «Se etiquetará como Colaboración
   pagada»). Si eliges patrocinado y la privacidad es «Solo yo», el formulario avisa y
   no envía.
6. **Aviso legal** fijo abajo: «Al publicar aceptas la Music Usage Confirmation de
   TikTok», con el enlace; si hay patrocinado: «Al publicar aceptas la Branded Content
   Policy y la Music Usage Confirmation de TikTok», con los dos enlaces. Y una línea
   más: «Después de publicar, TikTok puede tardar unos minutos en mostrarlo en tu
   perfil.»

La validación del cliente exige privacidad en modo directo; la del servidor repite todo
con `validarOpciones`.

### Calendario y editor

El chip de TikTok pasa por los mismos estados. En modo borrador, el estado final
`published` muestra «En tu bandeja de TikTok» en vez del enlace al post, porque no hay
`externalId`. El editor lista las opciones bajo el destino como texto («Directo · Solo
yo · sin comentarios · sin comercial»).

### Cuentas

La tarjeta de TikTok gana un segundo botón, «Conectar comentarios →», visible solo con la
cuenta conectada, que apunta a `/api/social/tiktok-business/connect`. Con credencial de
Business guardada el botón dice «Comentarios conectados» y hay un «Desconectar
comentarios». Sin credencial, bajo el handle: «Comentarios sin conectar».

### Los cuatro gemelos

`PUBLISHABLE` (`batch.ts`), `ENABLED` (`composer.tsx`) y `PUBLISHERS` (`publish/index.ts`)
tienen `tiktok`. `NETWORKS` del editor **no**: el editor no puede pedir las opciones y la
acción rechaza crear ese destino desde ahí, así que la casilla sería un callejón sin
salida; un destino TikTok ya existente se dibuja y se conserva igual.

## 5. Comentarios por la API for Business

### Credencial: tabla `tiktok_business_credentials`

```
id uuid pk
account_id uuid unique, FK social_accounts(id) on delete cascade
business_id text            -- identificador de la cuenta Business en esa API
access_token text           -- cifrado con crypto.ts
refresh_token text          -- cifrado
expires_at timestamptz
created_at timestamptz
```

Uno a uno con la fila `tiktok` de `social_accounts`. Borrar la cuenta borra la
credencial. Desconectar comentarios borra solo la fila de esta tabla.

### Conexión

Rutas nuevas `/api/social/tiktok-business/connect` y `/callback`, separadas de la
genérica `[network]` porque `tiktok-business` no es una red de `SOCIAL_NETWORKS`.

- **Connect**: exige una cuenta `tiktok` conectada (si hay varias, `?account=<id>`;
  por defecto la primaria de `cuentasPrimarias`). Redirige al portal de Business con
  `app_id = TIKTOK_BUSINESS_APP_ID`, `redirect_uri`, `state` firmado con
  `signOAuthState('tiktok-business')` que además lleva el `account_id`.
- **Callback**: canjea el código por `access_token`, `refresh_token`, `open_id` y
  `scope`. Comprueba que el `open_id` de Business corresponde a la misma cuenta: la
  API for Business expone el `username` de la cuenta y se compara con el handle de la
  fila de TikTok; si no coincide, error fijo «Esa cuenta Business no es la misma cuenta
  de TikTok que conectaste.» y no guarda nada. Si coincide, upsert en la tabla.
- Refresco: mismo molde que `ensureYoutubeCredential`, con la ventana de una hora, y
  re-cifrado de los dos tokens.

### Conector `src/lib/social/comentarios/tiktok.ts`

Implementa `Comentarista`:

- `ensureCredential(account)`: lee `tiktok_business_credentials` por `account.id`;
  null si no hay fila (la cola entonces no sondea esa cuenta y la tarjeta lo dice).
- `listar(account, token, postExternalId)`: lista de comentarios de primer nivel del
  video, paginando hasta 20 por pasada como las demás redes; mapea a `ComentarioLeido`
  con `externalId = comment_id`, `author = username`, `authorExternalId = user_id`,
  `text`, `publishedAt = create_time`.
- `responder(account, token, comentarioExternalId, texto)`: crea la respuesta al
  comentario en ese video y devuelve el `comment_id` de la respuesta. Necesita el
  `video_id`: se obtiene de la fila de `post_comments` que ya guarda
  `post_external_id`, así que la firma de `Comentarista.responder` no cambia; el
  conector recibe el `video_id` por un cuarto parámetro opcional que `responder.ts` pasa
  a todos (las otras redes lo ignoran).
- `limiteTexto = 150`.
- Comentario ya borrado → lanza `COMENTARIO_AUSENTE`; la cola lo descarta.
- `estadoInicial` marca como `propio` los comentarios cuyo `user_id` es el
  `business_id`.

`ventana.ts`: `tocaSondear('tiktok', now)` cada 30 minutos, con la misma mecánica de
`PASADAS_YOUTUBE`. `comments/page.tsx` suma `tiktok` a `REDES`.

### Lo que hay que confirmar antes de escribir el conector (tarea 0 del plan)

La documentación de la API for Business no se lee sin navegador, así que estos cuatro
puntos se comprueban con la cuenta del dueño, ya pasada a Business, antes de la primera
línea del conector:

1. Que el `video_id` de la API for Business es el mismo `id` que devuelve `video.list`
   del Display API. Si no, el conector construye el mapa por `share_url` y guarda el id
   de Business en `post_comments.post_external_id`; el diseño no cambia por fuera.
2. Los nombres exactos de endpoint, parámetros y scopes de listar y responder
   (`business/comment/list`, `business/comment/reply/create`, scopes `comment.list` y
   `comment.list.manage` o como se llamen hoy) y del OAuth (`tt_user/oauth2/token`).
3. El límite real de caracteres de la respuesta (asumido 150).
4. Cómo identifica la API la cuenta (`business_id`) y si expone el `username` para la
   comparación del callback.

## Manejo de errores

Mismo contrato de todo el repo: frases fijas en español hacia la base y la UI, detalle
de TikTok al `console.error`. Las nuevas se listan en `publish/tiktok.ts` y
`comentarios/tiktok.ts` junto a las existentes. El alerta por correo de
`sendFailureAlert` se dispara igual al tercer intento fallido.

## Testing

- **Publisher** (`publish/tiktok.test.ts`, fixtures en `fixtures/tiktok-*.json`):
  cuerpo exacto de los cuatro `init` (video directo, fotos directo, video borrador,
  fotos borrador); mapeo completo de `status/fetch`; `PUBLISH_COMPLETE` con lista vacía
  sigue esperando; error de red al consultar no gasta intento; `creator_info` sin la
  privacidad elegida falla con su frase; casillas forzadas cuando `creator_info` las
  deshabilita; tope de seis `init` por corrida; `fail_reason` a frase.
- **Opciones** (`publish/opciones.test.ts`): todas las reglas de §2.
- **Validación de media** (`validate.test.ts`): un video, 35 fotos, 36 fotos, mezcla,
  formato no permitido.
- **Compositor y lote**: la acción rechaza TikTok sin privacidad; CSV y API de lotes
  aceptan `opciones`; una fila TikTok sin `opciones` se rechaza.
- **Business**: refresco de credencial; `listar` y `responder` con respuestas grabadas;
  callback con cuenta distinta no guarda; borrar la cuenta borra la credencial.
- **Punta a punta en sandbox**, antes de grabar: un video directo, un carrusel directo,
  un video borrador; y al día siguiente el cruce de métricas del video directo.
- `npm test`, typecheck y lint verdes en cada commit.

## Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `TIKTOK_BUSINESS_APP_ID` | App de la API for Business (comentarios) |
| `TIKTOK_BUSINESS_APP_SECRET` | Su secreto |

`TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET` no cambian. Durante el desarrollo apuntan
al **sandbox** de la app en un despliegue de preview; en producción, a la app real.

## Trámite del dueño (paralelo al código)

### App de TikTok for Developers (una sola revisión)

Ya hecho el 2026-09-15: productos Login Kit y Content Posting API con Direct Post;
scopes exactamente `user.info.basic`, `video.list`, `video.upload`, `video.publish`.

Pendiente, sin depender del código:

1. **Icono**: subir `icono-tiktok-1024.png` (exportado de `src/app/icon.svg`), el mismo
   que ve la pestaña del navegador.
2. **URL properties**: verificar `vicente-pareja.cl` (el archivo
   `public/tiktok…txt` ya está servido) y el subdominio de R2 de `R2_PUBLIC_BASE` por
   registro TXT en Cloudflare. No por archivo en el bucket: el barrido diario lo borra.
3. **Sandbox**: crear uno, agregar al dueño como target user, registrar como redirect la
   URL del preview, y copiar sus credenciales a ese preview.

Al terminar el código:

4. **Description** (Basic Info): «Panel privado para publicar en mis redes y cruzar las
   métricas de cada publicación con el tráfico de mi sitio.»
5. **Explicación de revisión**: el texto de la sección siguiente.
6. **Video demo**: borrar el del 2026-08-26 y subir el nuevo, con el guion de más abajo.
7. **Submit for review**. La app queda en draft hasta ese momento.

Hasta que TikTok apruebe, `creator_info` solo devuelve `SELF_ONLY`; el selector del
compositor se llena de esa lista, así que se abre solo cuando aprueben, sin cambio de
código.

### Texto de revisión (inglés, máximo 1000 caracteres)

```
Portafolio is a single-owner private dashboard: the only user is the site owner. No signup, no feed, no third-party content.

Login Kit / user.info.basic: the owner authorizes their own TikTok account once from /admin/accounts. We keep open_id and display_name to label the account; tokens are encrypted at rest.

Display API / video.list: a daily job reads the owner's own public videos and counters (views, likes, comments, shares), shown only inside the dashboard next to the website visits each video drove.

Content Posting API / video.publish: from /admin/schedule the owner schedules a video or photo carousel to their own account. We call creator_info first; the owner picks privacy from the returned options (no default), sets comment/duet/stitch toggles (off by default) and commercial content disclosure, and sees the consent notice. Media is pulled from our verified domain.

video.upload: the same form can instead send the media to the owner's TikTok inbox as a draft.

We never read other users' data.
```

### Guion del video demo (4 a 5 minutos, una toma, subtítulos en inglés)

1. **Icono**: pestaña del sitio con el favicon, y Basic Info con el icono subido.
   Pestaña Sandbox visible con el target user. *"Same icon on website and Basic Info.
   Demo runs in sandbox."*
2. **Login Kit**: `/admin/accounts`, TikTok sin cuentas, «Conectar →», pantalla de
   permisos con los cuatro scopes legibles, autorizar, tarjeta con el nombre.
   *"user.info.basic: open_id and display_name label the account."*
3. **video.list**: «Sincronizar ahora», pestaña Contenido con los videos y sus
   contadores. *"video.list, read-only, owner's own videos."*
4. **video.publish, video**: Calendario, nueva publicación con un video, marcar
   TikTok. Mostrar el bloque: nombre de la cuenta, privacidad sin elegir, casillas
   apagadas, contenido comercial, aviso legal. Intentar enviar sin privacidad y ver el
   bloqueo. Elegir «Solo yo», programar para dentro de un minuto. Esperar la corrida:
   chip «publicando», luego «publicado». Abrir TikTok y mostrar el video en el perfil
   como privado. *"video.publish: creator_info, privacy chosen by the user, direct
   post, status polled until complete."*
5. **video.publish, fotos**: lo mismo con tres fotos, más rápido, hasta verlas en el
   perfil.
6. **video.upload**: nueva publicación con un video, marcar «Enviar como borrador».
   Programar, esperar, chip «En tu bandeja de TikTok». Abrir TikTok, mostrar la
   notificación de la bandeja y el borrador listo para editar. *"video.upload: media
   sent to the creator's inbox as a draft."*
7. **Desconectar**: «Desconectar» en Cuentas, la tarjeta desaparece. Revocar la app
   desde Ajustes de TikTok. *"Disconnect deletes stored tokens; the user can also revoke
   from TikTok settings."*
8. Cierre en `/privacidad`.

### App de TikTok for Business (trámite aparte, no frena la anterior)

1. Pasar la cuenta de TikTok del dueño a cuenta Business (Ajustes → Cuenta).
2. Crear la app en business-api.tiktok.com con el redirect
   `https://www.vicente-pareja.cl/api/social/tiktok-business/callback`.
3. Completar el formulario de acceso al scope de cuentas («TikTok Accounts»),
   obligatorio desde marzo de 2026, y pedir los scopes de comentarios.
4. Cuando el conector esté listo, grabar un segundo video corto: «Conectar
   comentarios», la cola con un comentario de TikTok, aprobar la respuesta, verla en
   TikTok. Enviar a revisión en ese portal.

## Las entregas

1. **Opciones y validación**: migración de `opciones`, `opciones.ts`, reglas de media
   en `validate.ts`, compositor con el bloque TikTok, lote y CSV, editor. Sin publisher
   todavía: TikTok sigue fuera de los gemelos hasta la entrega 2, así el bloque se puede
   probar sin publicar.
2. **Publisher**: `publish/tiktok.ts`, scopes nuevos en connect, los cuatro gemelos,
   calendario con «En tu bandeja de TikTok». Punta a punta en sandbox. Aquí se graba el
   video y se envía la revisión de Developers.
3. **Comentarios**: tarea 0 de confirmación contra la API for Business, tabla y rutas
   de credencial, conector, ventana, panel. Video corto y revisión en Business.

Las entregas 1 y 2 se apilan en la rama `publicar-en-tiktok` y salen en **un solo PR a
`main`**: sin publisher, un destino de TikTok programado fallaría en el cron con
`NO_PUBLISH_TOKEN` y dispararía la alerta. La entrega 3 es su propio PR.

Actualización 2026-09-15: la entrega 1 se fusionó sola (PR #83) a pedido del dueño para
probar en producción; la 2 va en su propio PR y cierra la ventana en que un destino
TikTok vencido fallaba en el cron.
