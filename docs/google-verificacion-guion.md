# Google y YouTube: qué preparar, qué grabar y qué escribir

Fecha: 2026-09-30. Son **dos trámites** en Google Cloud y **uno** en YouTube, y conviene
hacerlos en paralelo porque cada uno tarda semanas:

1. **Verificación del OAuth** (pantalla de consentimiento de *Testing* a *Production*).
   Sin ella: solo 100 *test users*, tokens que caducan a los 7 días, y el cartel «Google no
   ha verificado esta app».
2. **Auditoría y extensión de cuota de la YouTube Data API.** Sin ella: 10.000 unidades al
   día para todos los usuarios juntos (subir un video cuesta 1.600) y **los videos subidos
   quedan privados** aunque el usuario pida público.
3. El proyecto ya usa `youtube.upload` y `youtube.force-ssl` (`SCOPES.youtube` en
   `src/app/api/social/[network]/connect/route.ts`); son *sensibles*, no *restringidos*: no
   hay auditoría de seguridad externa (CASA).

Formato igual al de los otros guiones: qué dejar listo, el texto que se pega, las escenas
con su subtítulo, y lo que suele fallar.

## Antes de apretar grabar

### En Google Cloud Console (APIs y servicios → Pantalla de consentimiento de OAuth)

1. **Tipo de usuario: externo.** Nombre de la app «Tu Parrilla», correo de asistencia,
   **logo** (el mismo de `public/`; subirlo es lo que dispara la verificación con marca),
   dominio de la app `tu-parrilla.cl`, página principal `https://tu-parrilla.cl`,
   privacidad `https://tu-parrilla.cl/privacidad`, términos `https://tu-parrilla.cl/terminos`.
2. **Dominios autorizados:** `tu-parrilla.cl`, verificado en **Search Console** con el
   mismo usuario de Google que es dueño del proyecto (DNS TXT o el archivo HTML en
   `public/`; el DNS es lo estable).
3. **Permisos** (*Scopes*): exactamente `…/auth/youtube.upload` y
   `…/auth/youtube.force-ssl`, con la justificación de cada uno (tabla de abajo). No pedir
   `youtube.readonly`: `force-ssl` lo cubre y pedir de más alarga el review.
4. **Cliente OAuth (tipo Web):** *URIs de redireccionamiento autorizados* con
   `https://tu-parrilla.cl/api/social/youtube/callback`. El `GOOGLE_CLIENT_ID` de Vercel es
   el de este cliente.
5. **YouTube Data API v3** habilitada en el mismo proyecto (ya lo está: es el de
   `YOUTUBE_API_KEY`).

### La página principal tiene que explicar la app

Google mira `https://tu-parrilla.cl` y exige que diga **qué hace la app y para qué usa los
datos de Google**, con enlace a la privacidad, sin pedir ingreso. La landing del producto
(`src/components/landing.tsx`, servida en `DOMINIO_PRODUCTO`) ya explica qué hace y enlaza
a Términos y Privacidad en el pie; lo que le falta es nombrar a YouTube: una frase del tipo
«conecta tu canal de YouTube para programar videos y leer y responder comentarios; solo
tocamos tu propio canal». Sin esa mención, Google suele rechazar por «Homepage requirements
not met».

### La política de privacidad tiene que nombrar a Google

`/privacidad` tiene que decir, con estas palabras o parecidas, que el uso de la
información de las APIs de Google se ajusta a la *Google API Services User Data Policy*,
incluidos los requisitos de *Limited Use*; qué datos de YouTube se guardan (título, id,
contadores y comentarios de **tu** canal), por cuánto tiempo, y cómo revocar (desde Los
Fierros o desde myaccount.google.com/permissions). Comprobar que esté; si no, una frase.

### La cuenta de prueba y su contenido

Un canal de YouTube que administres, con dos videos subidos y un par de comentarios de
otra cuenta. La cuenta de Google del canal agregada como **test user** en la pantalla de
consentimiento (hasta que esté en producción).

### Justo antes de rodar

- Revocar Tu Parrilla en myaccount.google.com → Seguridad → Acceso de terceros, para que
  el consentimiento salga entero.
- Cerrar sesión del panel. Ventana limpia, 1280×800 o más.
- Un video vertical corto listo para subir.

## Texto de verificación (inglés)

Justificación por permiso, en el formulario de la pantalla de consentimiento:

| Permiso | Justificación |
|---|---|
| `youtube.upload` | «The creator schedules a video from the Calendar; at the scheduled time we upload it to the creator's own channel with the title, description and privacy they chose. We never upload to any other channel. Shown at 1:10–2:00 in the demo video.» |
| `youtube.force-ssl` | «We read new comments on the creator's own recent videos and show them in a queue; the creator approves a reply with one tap, and can set a keyword rule that replies automatically. force-ssl is required to post comment replies (youtube.readonly cannot). 2:00–2:40.» |

Y la nota general, la misma que en Meta: panel privado, sin registro público, cada creador
ve solo su canal.

## Qué hacer, en orden (video de la verificación del OAuth)

Google pide ver: la URL de la app, el flujo completo de consentimiento **con el nombre de
la app y del proyecto visibles**, cada permiso en uso, y cómo se revoca.

| # | Acción | Subt. |
|---|---|---|
| 1 | `tu-parrilla.cl` con la barra de direcciones visible; bajar al párrafo que explica la app y su enlace a privacidad. | 1 |
| 2 | `/ingresar`: correo, código, entrar. | 2 |
| 3 | Engranaje → **Los Fierros**. Bajo YouTube, el aviso «Hasta que Google apruebe la cuota…». Pulsar **Conectar →**. | 3 |
| 4 | Pantalla de consentimiento de Google: **detenerse tres segundos** en el nombre «Tu Parrilla» y en los dos permisos con su descripción. Continuar. | 4 |
| 5 | Volver a Los Fierros con la tarjeta del canal. Pulsar **Sincronizar**; **Los Cortes** muestra los videos con sus números. | 5 |
| 6 | **La Parrilla → Poner al fuego**: subir el video, marcar **YouTube**, título, «Ahora», **Programar**. En El Fuego, verlo pasar a publicado. Abrir YouTube Studio y mostrar el video (privado, hasta la auditoría de cuota: decirlo en el subtítulo). | 6 |
| 7 | Desde otra cuenta, comentar en el video. Esperar la corrida de YouTube (cada media hora: mejor tener un comentario **anterior** ya en la cola y usar ese). | |
| 8 | **La Mesa**: el comentario, la respuesta propuesta, **Aprobar**. Abrir YouTube y mostrar la respuesta publicada. | 7 |
| 9 | Los Fierros → **Desconectar**. Y myaccount.google.com → Seguridad → Acceso de terceros → quitar Tu Parrilla. | 8 |
| 10 | `/privacidad`, en la parte que nombra a Google y el *Limited Use*. | 9 |
| 11 | Terminar la grabación. | |

## Los subtítulos

1. Tu Parrilla: a private dashboard for creators. This page explains the app.
2. Invited by email, one-time code. No public signup.
3. Accounts: the creator connects their own YouTube channel.
4. Google consent: app name and the two scopes, shown in full.
5. Their own videos and counters, read once a day.
6. youtube.upload: a video scheduled and uploaded to their own channel.
7. youtube.force-ssl: a comment on their own video, replied with one tap.
8. Disconnect removes the stored tokens; revoking in Google works too.
9. Privacy policy: Google API Services User Data Policy, Limited Use.

## La auditoría de cuota de YouTube (formulario aparte)

Es el «YouTube API Services – Audit and Quota Extension Form». Pide:

- **Qué hace la app con la API**, funcionalidad por funcionalidad, con capturas: (a)
  listar los videos y contadores del propio canal (`videos.list`, `channels.list`), (b)
  subir videos programados (`videos.insert`), (c) leer comentarios de los propios videos
  (`commentThreads.list`) y responder (`comments.insert`). Las mismas escenas 5, 6 y 8.
- **Cuánta cuota y por qué.** Cálculo honesto: por usuario y día, un sync de métricas
  (≈ 3 llamadas × 1 unidad), la corrida de comentarios cada media hora (48 ×
  `commentThreads.list` ≈ 48 unidades, acotada en `src/lib/social/comentarios/ventana.ts`),
  y las subidas (1.600 cada una). Con 30 creadores y un video diario cada uno: ≈ 50.000
  unidades/día. Pedir **100.000** con ese cálculo escrito.
- **Cumplimiento de los términos de YouTube**: que los datos de la API se muestran solo al
  dueño del canal; que los contadores se refrescan al menos cada 30 días (se refrescan a
  diario); que el usuario puede revocar (Los Fierros y Google); que no se venden ni se
  cruzan con otras fuentes; que se borran al desconectar (credenciales) y a petición.
- **Enlaces**: privacidad, términos, y el video de arriba sirve.

Sin esta auditoría, la app funciona para leer y responder comentarios, pero **no para
publicar en público**: el aviso de Los Fierros lo dice hasta que pase.

## Errores que Google castiga

- **La portada no explica la app** o no enlaza a la privacidad: rechazo inmediato.
- **El dominio no está verificado** en Search Console con el mismo usuario del proyecto.
- **El video no muestra el nombre de la app en el consentimiento**, o el consentimiento
  está recortado.
- **Pedir permisos que el video no usa** (`youtube.readonly` además de `force-ssl`).
- **La privacidad no nombra la User Data Policy / Limited Use.**
- Para la cuota: un cálculo sin números, o números que no cuadran con las funciones
  mostradas.

## Después de aprobar

- Pantalla de consentimiento en **Production**: los tokens dejan de caducar a los 7 días
  (los usuarios ya conectados tienen que **reconectar una vez** para recibir un refresh
  token de larga duración).
- Con la cuota aprobada: quitar el aviso de YouTube en `AVISO_ANTES_DE_CONECTAR`
  (`src/lib/networks.ts`) y su test, y la frase del README.
