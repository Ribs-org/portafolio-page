# TikTok: qué grabar y qué escribir en la revisión

Fecha: 2026-09-17, revisado el 2026-09-22 (mudanza a Supabase y dominios del portal). Reemplaza al guion de
`docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md`, escrito cuando Parrilla
era el panel de una sola persona. Ahora es multiusuario por invitación, y el texto de
revisión tiene que decirlo: el revisor va a ver una pantalla de ingreso por correo.

## Antes de apretar grabar

Nada de esto depende del código; si falta algo, el video se cae solo. Lo marcado ya quedó
resuelto: lo de 2026-09-17 en su momento, y lo de 2026-09-22 verificado uno por uno.

### En el portal de TikTok

- [x] **Sandbox activo** (`portafolio-demo`) con tu cuenta como *target user*. La revisión
      exige que la demo corra en sandbox.
- [x] **El sandbox se llama `Tu Parrilla`.** Su nombre y su icono son los que aparecen en la
      pantalla de permisos, o sea en cámara. TikTok le agrega «(Sandbox)» y eso está bien.
- [x] **Icono** subido en Basic Info de las dos apps, el mismo de la pestaña del navegador.
- [x] **Las tres URLs declaradas apuntan a `tu-parrilla.cl`** —Web/Desktop, Terms y
      Privacy—, el mismo dominio donde se graba. Declararlas en otro dominio es la clase de
      contradicción que ya costó un rechazo.

      Ojo con el `www`: `www.vicente-pareja.cl` existe, **`www.tu-parrilla.cl` no**. Tres
      veces seguidas se coló ese prefijo el 2026-09-22 y deja los links rotos, que es
      rechazo automático sin que el revisor llegue a ver el video.
- [x] **`https://tu-parrilla.cl/api/social/tiktok/callback`** en los redirects del sandbox,
      guardado con «Apply changes». El sandbox es una app aparte: lo que agregas en
      producción no llega ahí. El código arma la URL de retorno con `new URL(request.url).origin`,
      o sea con el dominio que navegas, así que tiene que ser exactamente ese.
- [x] **URL properties verificadas en esta app** (confirmado 2026-09-22: las dos figuran en «Verified properties»): `tu-parrilla.cl` y
      `media-bucket.vicente-pareja.cl`, de donde TikTok descarga la media. Sin la segunda,
      `PULL_FROM_URL` falla a mitad del video. Cada app emite su propio token y el diálogo
      genera uno nuevo cada vez que se abre: hay que copiarlo, crear el TXT **sin cerrar la
      ventana**, y verificar ahí mismo.

### En la app de producción (la que TikTok revisa de verdad)

El sandbox solo sirve para que la demo corra aislada. **El revisor mira la app de
producción** —su nombre, descripción, URLs y permisos— y la contrasta con el video. Todo lo
de arriba hay que replicarlo acá, o el video y la ficha se contradicen.

- [x] **Las tres URLs en `tu-parrilla.cl`** y los cuatro scopes.
- [x] **URL properties verificadas** (2026-09-22): `tu-parrilla.cl` y
      `media-bucket.vicente-pareja.cl`. Queda un `https://www.vicente-pareja.cl/` como *URL
      prefix* del dominio viejo; es inofensivo pero se puede borrar.
- [x] **Texto de revisión** cargado, 991/1000. Dice desde la primera línea que el panel es
      por invitación, que es lo que el revisor va a ver en la escena 2.
- [x] **Icono** subido también acá (confirmado 2026-09-22).
- [x] **Redirect URIs limpios** (2026-09-22): quedó solo `https://tu-parrilla.cl/api/social/tiktok/callback`, el mismo dominio del Web URL declarado y del video.
- [x] **Descripción en inglés**, la misma que lee el revisor en el texto de revisión.
- [x] **Enviada a revisión el 2026-09-24.** El video viejo del 26 de agosto se reemplazó por la toma nueva: 1920x1032, sin audio, con los veinte subtítulos quemados y comprimida a 8 MB para entrar en el límite de 50 del formulario. Motivo declarado: «New demo video: the full flow in sandbox, a scene per scope, and the app icon now matches the site.»

### Qué credenciales están desplegadas

El código usa **un solo par** (`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`) y no distingue
sandbox de producción: la app que se abre al conectar es la dueña de esa llave. Para que la
demo corra en sandbox, el despliegue tiene que tener las **del sandbox**.

Como en Vercel son «Secret» y no se pueden releer, se comprueba así: pulsar **Conectar** en
Cuentas y leer el `client_key` de la barra de direcciones —el código lo pone en la URL de
autorización— y compararlo con el Client key del sandbox en el portal. Si cambias las
variables, hay que **redesplegar**: un cambio de variable no afecta a los despliegues ya
hechos.

### El ensayo, entero y sin grabar

Desde la mudanza a Supabase (2026-09-22) el camino de **escritura** al publicar no se ha
ejercitado: marcar el destino como publicando, guardar el `external_id`, pasar a publicado.
Lo que sí está verificado es la lectura, el `jsonb` de las opciones y la transición de
estado a nivel de base. El ensayo dejó de ser opcional.

- [x] **Revocar la app desde TikTok** (Perfil → Ajustes y privacidad → Seguridad y permisos
      → Aplicaciones conectadas) **y desconectar TikTok en Cuentas**. Sin esto, la pantalla
      de permisos solo pide lo que aún no concediste y saldrían dos permisos en vez de cuatro.
- [x] **Reconectar** y comprobar que la pantalla muestra los cuatro permisos. Hecho el 2026-09-23: la pantalla dijo «Tu Parrilla (Sandbox)» y pidió los cuatro, que además confirma que el despliegue tiene las credenciales del sandbox.
- [x] **Sincronizar** y ver los videos con contadores en Contenido. Hecho el 2026-09-23.
- [x] **Un video directo «Solo yo»** y un **carrusel de tres fotos**: hechos el 2026-09-23, con un archivo de 8,5 MB a propósito, para probar que la subida ya no cruza la función.
- [x] **Un borrador** (`video.upload`): probado el 2026-09-24. Con eso los cuatro scopes quedaron ejercitados contra Supabase, incluida la escritura al publicar.
- [x] **Desconectar** y ver que la tarjeta desaparece.
- [ ] Borrar los posts de prueba de la parrilla.

### Justo antes de rodar

- [ ] **Revocar y desconectar otra vez**: el ensayo te dejó conectado.
- [ ] Media lista: un video vertical corto y tres fotos JPG o WebP.
- [ ] Ventana limpia: sin pestañas de más, sin notificaciones, sin datos de otra persona
      en pantalla.

Todo se graba entrando por **`tu-parrilla.cl`**: el código arma la URL de retorno con el
dominio que navegas, y TikTok exige que coincida con la Web URL declarada en el formulario.

## Texto de revisión (inglés)

Cabe en los 1000 caracteres del formulario.

```
Parrilla is a private dashboard for creators. There is no public signup: an admin invites an email and the person signs in with a six-digit code. Each creator connects their own accounts and sees only their own data.

Login Kit / user.info.basic: the creator authorizes their own TikTok account from Accounts. We keep open_id and display_name to label it; tokens are encrypted at rest.

Display API / video.list: a daily job reads that creator's own public videos and counters.

Content Posting API / video.publish: from the Calendar the creator schedules a video or photo carousel to their own account. We call creator_info first; the creator picks a privacy level from the returned options (never a default), sets comment, duet and stitch toggles (off by default) and the commercial disclosure, and sees the consent notice. Media is pulled from our verified domain.

video.upload: the same form sends the media to the creator's inbox as a draft instead.

We never read other people's data.
```

## Qué hacer, en orden

Una sola toma, sin narración. El número de la derecha es el subtítulo que va en ese
momento; la lista completa está más abajo. No hay que medir tiempos: los saca después
quien arma los subtítulos, del archivo grabado.

| # | Acción | Subt. |
|---|---|---|
| 1 | Pestaña del sitio con su icono, y al lado Basic Info con el mismo icono. Detenerse dos segundos. | 1 |
| 2 | Pestaña **Sandbox**, con `vicente_pareja` como target user. | 2 |
| 3 | Ir a `tu-parrilla.cl/ingresar`. Escribir el correo. Pulsar «Mandarme un código». | 3 |
| 4 | Abrir el correo, mostrar el código de seis dígitos, escribirlo, entrar. | 4, 5 |
| 5 | **Cuentas**. TikTok aparece sin conectar. Pulsar Conectar. | 6 |
| 6 | **Detenerse tres segundos** en la pantalla de permisos. Contar que sean **cuatro**. | 7, 8 |
| 7 | Autorizar. Volver y mostrar la tarjeta con el nombre de la cuenta. | |
| 8 | Pulsar **Sincronizar**. Abrir **Contenido** y mostrar los videos con sus contadores. | 9 |
| 9 | **Calendario** → Programar una publicación. Subir `prueba-video-vertical.mp4`. Marcar **TikTok**. | 10 |
| 10 | Enseñar el bloque de TikTok **sin tocarlo**: la cuenta, la privacidad sin elegir, comentarios/dúo/pegar apagados, el contenido comercial y el aviso. | 11 |
| 11 | Intentar **Programar** sin elegir privacidad. Dejar ver que se bloquea. | 13 |
| 12 | Elegir **«Solo yo»**. | 12 |
| 13 | Pulsar **Ahora** y **Programar**. | 14 |
| 14 | **Sin esperar**: publicación nueva con las tres fotos, TikTok, «Solo yo», Ahora, Programar. | 16 |
| 15 | Volver al calendario y mostrar el video pasando a **publicando** y luego a **publicado**. | 15 |
| 16 | Abrir TikTok y mostrar el video en el perfil, privado. Y el carrusel. | |
| 17 | Publicación nueva con el video, marcar **«Enviar como borrador»**, Ahora, Programar. | 17 |
| 18 | Esperar la etiqueta, abrir TikTok y mostrar el borrador listo para editar. | |
| 19 | **Cuentas** → Desconectar. La tarjeta desaparece. | 18 |
| 20 | Ajustes de TikTok → Seguridad y permisos → revocar la app desde ahí también. | 19 |
| 21 | Abrir `/privacidad` y enseñar qué se guarda y cómo se borra. | 20 |
| 22 | Terminar la grabación. | |

**Si en el paso 6 salen dos permisos en vez de cuatro, cortar ahí.** Significa que la app
no quedó revocada, y esa escena es la que demuestra los cuatro scopes de una sola vez: sin
ella el video no sirve y no se arregla editando.

**Los pasos 13 a 15 están en ese orden a propósito.** El pinger corre cada cinco minutos,
así que entre programar el video y verlo publicado puede pasar ese rato. Hacer el carrusel
en el medio llena la espera con contenido en vez de con una pantalla quieta, y la toma
sigue siendo una sola.

## Cómo grabar

La toma del 2026-09-23 se hizo con Google Meet y eso costó casi medio minuto de video en
la interfaz de la reunión —la cámara, «You are presenting», el link, el correo del dueño—
y dejó la pantalla ocupando media imagen a 720p. El formulario de TikTok pide
explícitamente que la interfaz se vea con claridad.

**Grabar solo la ventana del navegador, a pantalla completa, en 1080p.** Con la barra de
juegos de Windows alcanza:

1. Poner el navegador en primer plano, maximizado, con las pestañas que hacen falta y
   ninguna más.
2. `Win + G` para abrir la barra, y empezar a grabar con `Win + Alt + R`.
3. Grabar **la ventana**, no la pantalla entera: así no entran la barra de tareas ni una
   notificación que aparezca.
4. Cámara apagada. El revisor mira el producto, no a quien lo muestra.
5. `Win + Alt + R` otra vez para terminar. El archivo queda en `Vídeos\Capturas`.

Empezar a grabar **después** de tener todo listo, y terminar **antes** de cerrar nada: los
segundos de armado y de cierre no muestran el producto y son los primeros que el revisor
ve.

**Sin narración.** Los subtítulos se bastan solos, así que el video va en silencio y con el
micrófono apagado: en la barra de juegos, `Win + Alt + M` lo silencia, y conviene
confirmarlo antes de empezar porque graba con él encendido por defecto.

La decisión no es de comodidad. El resumen automático de la toma del 2026-09-23 decía «the
archive permission enables automated posting every 3 to 5 minutes»: no existe ningún
«archive permission», y esos cinco minutos son el pinger propio y no un permiso de TikTok.
Da igual si se dijo mal o si la transcripción lo deformó —**un revisor que escucha una cosa
y lee otra encuentra una contradicción donde no la hay**, y este proyecto ya fue rechazado
una vez por contradicciones. En silencio, lo único que el revisor puede juzgar es lo que
pasa en pantalla, que es lo que de verdad importa.

## Los subtítulos

El panel está en español y el revisor lee inglés: sin subtítulos no puede seguir lo que
pasa en pantalla. No son una transcripción de lo que se dice, sino el rótulo de lo que se
está demostrando, uno o dos por escena.

Cada línea va sola o en dos renglones, corta para que se lea mientras pasa la acción. En
orden, con la escena a la que pertenece:

| # | Escena | Línea |
|---|---|---|
| 1 | 1 | Same icon on the site and in Basic Info. |
| 2 | 1 | This demo runs in the sandbox app. |
| 3 | 2 | No public signup: an admin invites an email address. |
| 4 | 2 | The creator signs in with a six-digit code. |
| 5 | 2 | Each creator only ever sees their own data. |
| 6 | 3 | Login Kit asks for all four scopes at once. |
| 7 | 3 | user.info.basic: we keep open_id and display_name to label the account. |
| 8 | 3 | Tokens are encrypted at rest. |
| 9 | 4 | video.list is read-only, over the creator's own videos. |
| 10 | 5 | Content Posting API, direct post. |
| 11 | 5 | We call creator_info first. |
| 12 | 5 | The privacy level is chosen by the creator, never defaulted. |
| 13 | 5 | Scheduling is blocked until they choose one. |
| 14 | 5 | Media is pulled from our verified domain. |
| 15 | 5 | We poll the publish status until it completes. |
| 16 | 6 | The same form posts a photo carousel. |
| 17 | 7 | video.upload sends the media to the creator's inbox as a draft. |
| 18 | 8 | Disconnecting deletes the stored tokens. |
| 19 | 8 | The creator can also revoke access from TikTok. |
| 20 | 9 | What we store, and how it is deleted. |

Se quemarán en el video con `ffmpeg` cuando la toma esté lista: los tiempos salen de dónde
empieza cada escena, que se sacan del archivo grabado y no se adivinan.

## Errores que ya costaron un rechazo

- El video anterior no mostraba el flujo **entero en sandbox**. Que se vea la pestaña de
  sandbox al principio.
- Había permisos pedidos y no demostrados. Los cuatro tienen su escena: 3, 4, 5 y 7.
- El icono no coincidía con el del sitio. Escena 1.
- Si el texto de revisión describe un panel de una sola persona y el video muestra un
  ingreso por correo con invitaciones, es una contradicción: por eso este texto lo dice
  desde la primera línea.

## La auditoría de Direct Post (2026-09-30)

La app está aprobada y en producción desde el 2026-09-28 (Login Kit y Content Posting
API). Lo que falta es la **auditoría de Direct Post**: sin ella, todo lo que la app publica
queda como «Solo yo» aunque el usuario pida otra privacidad, y la app tiene un cupo de
**5 usuarios distintos por día**. Se pide desde el portal: Manage apps → tu app → Content
Posting API → **Apply** (bajo *Direct Post*). Es un formulario y un video; no depende de
ningún otro trámite y se puede mandar hoy.

### Qué preparar

- La app de producción con las credenciales desplegadas (ya está: `TIKTOK_CLIENT_KEY` y
  `TIKTOK_CLIENT_SECRET` de la app real, no del sandbox).
- Una cuenta de TikTok tuya conectada en Los Fierros, con el aviso «Hasta que TikTok
  apruebe la publicación directa…» visible bajo el título de la red.
- Un video vertical y tres fotos, como en el guion de arriba.
- El vídeo de la aprobación anterior sirve de base: TikTok quiere ver **el mismo flujo**,
  esta vez con la privacidad elegida por el usuario y las opciones de interacción y de
  contenido comercial, tal como las devuelve `creator_info`.

### Las respuestas del formulario (inglés)

**General information / describe your use case:**

```
Tu Parrilla is a private scheduling dashboard for content creators (invite-only, no public signup; each creator connects their own TikTok account and only ever sees their own data). Creators schedule a video or a photo carousel from the Calendar to their own account. Before publishing we call creator_info and show the creator the privacy levels returned for their account; the creator must pick one (there is no default), sets the comment/duet/stitch toggles (off by default), declares commercial content when it applies, and sees TikTok's consent notice. At the scheduled time we publish via Direct Post; alternatively the creator can send the media to their inbox as a draft (video.upload).
```

**API client information / which endpoints and fields you use:**

```
POST /v2/post/publish/creator_info/query/ — creator_username, creator_nickname, privacy_level_options, comment_disabled, duet_disabled, stitch_disabled, max_video_post_duration_sec.
POST /v2/post/publish/video/init/ (Direct Post, source PULL_FROM_URL from our verified domain) and POST /v2/post/publish/content/init/ for photo carousels — publish_id.
POST /v2/post/publish/status/fetch/ — status, publicaly_available_post_id, fail_reason.
POST /v2/post/publish/inbox/video/init/ — for drafts.
GET /v2/video/list/ — id, title, cover_image_url, share_url, view_count, like_count, comment_count, share_count (the creator's own videos, for the Content tab).
GET /v2/user/info/ — open_id, display_name (to label the connected account).
```

**Explain how you determined the daily usage estimate:**

```
Each connected creator publishes at most a handful of posts per day (typically 1–3). Per published post we make one creator_info query, one init call and up to 12 status polls (every 5 minutes until PUBLISH_COMPLETE). Metrics are read once a day per creator (one video/list call). For the first year we plan for up to 100 connected creators: ~300 posts/day ≈ 4,200 Content Posting API calls/day, plus ~100 video/list calls/day. We do not batch or retry beyond the polling described.
```

**Supporting documents:** el video (guion abajo), `https://tu-parrilla.cl/privacidad`,
`https://tu-parrilla.cl/terminos`.

### Qué grabar, en orden

Mismo molde que el video de aprobación; las escenas nuevas son la privacidad elegida y
las opciones.

| # | Acción | Subt. |
|---|---|---|
| 1 | Portal de TikTok: la app **en producción** (no sandbox), Content Posting API con Direct Post. | 1 |
| 2 | `/ingresar`, código, entrar. | 2 |
| 3 | Los Fierros → TikTok, el aviso bajo el título, **Conectar →**; pantalla de permisos con los cuatro scopes; autorizar. | 3 |
| 4 | **El Fuego → «Poner al fuego»** (abre el compositor en La Parrilla): subir el video, marcar TikTok. Mostrar el bloque **sin tocar**: privacidad sin elegir (las opciones vienen de `creator_info`), comentarios/dúo/pegar apagados, contenido comercial, el aviso de TikTok. | 4 |
| 5 | Intentar **Programar** sin privacidad: se bloquea. | 5 |
| 6 | Elegir **«Público»** (o la más abierta que devuelva la cuenta), encender comentarios, marcar «Contenido comercial → Tu marca». | 6 |
| 7 | «Ahora», **Programar**. Sin esperar: el carrusel de tres fotos, TikTok, «Amigos», Programar. | 7 |
| 8 | El Fuego: el video pasa a publicado. Abrir TikTok y mostrarlo **con la privacidad elegida** y la etiqueta de contenido comercial. Y el carrusel. | 8 |
| 9 | Los Fierros → Desconectar; Ajustes de TikTok → Seguridad y permisos → revocar. | 9 |
| 10 | `/privacidad`. Terminar. | 10 |

Subtítulos: 1 «Production app, Direct Post enabled.» 2 «Invite-only sign-in.» 3 «The
creator connects their own account; four scopes.» 4 «Privacy options come from
creator_info; nothing is pre-selected.» 5 «Publishing is blocked until the creator picks
a privacy level.» 6 «The creator chooses privacy, interactions and commercial
disclosure.» 7 «Scheduled now.» 8 «Published with the chosen privacy level.» 9 «Disconnect
and revoke.» 10 «Privacy policy.»

### Después de aprobar

- El cupo de 5 usuarios/día desaparece y la privacidad elegida se respeta.
- Quitar la frase de TikTok de `AVISO_ANTES_DE_CONECTAR` (`src/lib/networks.ts`) y su test,
  y la nota del bloque de TikTok «Mientras TikTok no apruebe la app…» (`schedule/tiktok-opciones.tsx`),
  y las frases correspondientes del README.
