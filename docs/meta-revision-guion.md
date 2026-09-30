# Meta: qué preparar, qué grabar y qué escribir en el App Review

Fecha: 2026-09-30. Para pasar la app de Meta (Instagram y Facebook, una sola app) de modo
desarrollo a **Live**, que es lo único que hoy impide que otra persona conecte su Instagram.
Primera vuelta: los permisos que la app ya usa en pantalla. Los del privado
(`instagram_manage_messages`, `pages_messaging`) quedan para una segunda vuelta (ver
`docs/levantamiento-terceros.md` §2.2).

Formato igual al de `docs/tiktok-revision-guion.md`: qué dejar listo antes, el texto en
inglés que se pega en el formulario, las escenas en orden con su subtítulo, y los errores
que Meta suele castigar.

## Antes de apretar grabar

### En el panel de desarrolladores (developers.facebook.com → tu app)

1. **Verificación de negocio** (Settings → Basic → *Verification*, o desde Business
   Manager). Es lo primero que se pide y lo que más tarda: sin ella Meta no da acceso
   avanzado a ninguno de estos permisos. Documentos de la empresa o de la persona con giro;
   el nombre legal tiene que coincidir con el del dominio o con la política de privacidad.
2. **App Settings → Basic**, todo lleno: nombre de la app «Tu Parrilla», icono (el mismo
   de `public/`), categoría *Business and pages*, correo de contacto, **Privacy Policy
   URL** `https://tu-parrilla.cl/privacidad`, **Terms of Service URL**
   `https://tu-parrilla.cl/terminos`, **Deauthorize callback URL**
   `https://tu-parrilla.cl/api/social/meta/baja`, **Data deletion request URL**
   `https://tu-parrilla.cl/api/social/meta/borrado` (las dos existen desde el PR #129;
   pruébalas con «Test» si el panel lo ofrece).
3. **Facebook Login → Settings**: *Valid OAuth Redirect URIs* con
   `https://tu-parrilla.cl/api/social/instagram/callback` y
   `https://tu-parrilla.cl/api/social/facebook/callback`; *Client OAuth Login* y *Web OAuth
   Login* encendidos; *Login with the JavaScript SDK* apagado (no se usa).
4. **Casos de uso** activos: el que da `instagram_content_publish` y
   `instagram_manage_comments` (*Instagram API with Facebook Login*), el que da
   `pages_manage_engagement`/`pages_manage_posts` (*Administrar páginas*), y *Business
   Management*. Si en el diálogo sale «Invalid Scopes», falta uno (el README lo cuenta).
5. **App Review → Permissions and Features**: pedir acceso avanzado a **todos** los de la
   tabla de abajo de una vez. Meta revisa cada uno por separado, pero un solo video puede
   servir a varios si está claro en qué segundo aparece cada permiso (las notas por
   permiso dicen «ver 1:20–1:45»).

### Lo que Meta necesita para probar la app por su cuenta

El ingreso es solo por correo con código de seis dígitos, y el revisor no puede leer
nuestro correo. Meta pide **credenciales de prueba** que le dejen entrar solo: hay que
darle una puerta. La salida más limpia es un código fijo para un solo correo de revisión,
encendido por variables de entorno mientras dure la revisión:

- `REVISION_CORREO=revision@tu-parrilla.cl` y `REVISION_CODIGO=<seis dígitos>`: si el
  correo que pide entrar es ese, el código que vale es el fijo y no se manda nada.
- Ese usuario existe en Los Maestros, invitado como cualquier otro, con **su propia**
  cuenta de Instagram Business de prueba conectada (una cuenta que administres tú, con
  página de Facebook, y con dos o tres publicaciones y comentarios).
- Se quita la variable el día que la app pasa a Live.

Está hecho (entrega D, `codigoDeRevision` en `src/lib/ingreso.ts`; las variables se
documentan en `.env.example` y en la sección de Meta del README). Sin esa puerta, Meta
rechaza por «no pudimos acceder a la app».

### La cuenta de prueba y su contenido

Una cuenta de Instagram **Business o Creator**, ligada a una **página de Facebook** que
administres, con:

- tres publicaciones recientes (un reel, una foto, un carrusel) con algunos comentarios de
  otra cuenta tuya;
- una publicación en la página de Facebook con un comentario;
- la cuenta agregada como **Tester** de la app (App Roles) hasta que esté en Live, porque
  en desarrollo solo los roles pueden autorizar.

Y en el panel: una regla de palabra clave en La Mesa (por ejemplo «GUÍA» → responde con un
texto y manda un enlace público a un PDF), para la escena de comentarios.

### El ensayo, entero y sin grabar

Recorrer las diez escenas una vez sin grabar. Lo que más se traba: el diálogo de Meta
saltándose la pantalla de permisos porque la app ya estaba autorizada (revocarla antes en
facebook.com → Configuración → Apps y sitios web), y el sync de comentarios, que corre cada
cinco minutos (La Mesa no muestra un comentario nuevo al instante).

### Justo antes de rodar

- Revocar la app en Facebook y en Instagram, para que el diálogo de permisos salga entero.
- Cerrar sesión del panel. Ventana limpia, 1280×800 o más, sin extensiones.
- Tener a mano un video vertical corto y una foto para publicar.

## Texto de revisión (inglés)

Meta pide, por permiso, «cómo lo usa tu app» y «por qué lo necesitas», más una nota general.
Cabe en los límites del formulario. Lo mismo en todos: **Tu Parrilla es un panel privado de
creadores, sin registro público; cada creador conecta sus propias cuentas y ve solo lo suyo.**

```
Tu Parrilla is a private scheduling and analytics dashboard for content creators. There is no public signup: an admin invites an email address and the person signs in with a six-digit code. Each creator connects their own Instagram professional account and Facebook Page and only ever sees their own data. We never read or act on other people's accounts.
```

| Permiso | «How is your app using this permission» |
|---|---|
| `pages_show_list` | «After Facebook Login we list the Pages the creator manages so they can pick which Page (and its linked Instagram account) to connect. Shown at 0:40–1:05 in the screencast.» |
| `pages_read_engagement` | «We read the creator's own Page posts and their reactions, comments and shares to show them in the Content and Numbers tabs. 1:30–1:50.» |
| `instagram_basic` | «We read the creator's own Instagram professional account (id, username) and their media list to label the account and show their posts. 1:05–1:30.» |
| `instagram_manage_insights` | «We read reach, impressions and follower counts of the creator's own account and media, once a day, to draw the charts in the Numbers tab. 1:50–2:10.» |
| `instagram_content_publish` | «The creator schedules a reel, a photo or a carousel from the Calendar; at the scheduled time we create the media container and publish it to their own account. Includes the optional trial-reel flag chosen by the creator. 2:10–3:00.» |
| `instagram_manage_comments` | «We fetch new comments on the creator's own recent media and show them in a queue; the creator approves a reply with one tap, and can set a keyword rule that replies automatically with a fixed public text. 3:00–3:40.» |
| `pages_manage_engagement` | «Same as above for comments on the creator's own Page posts: read them and post the creator's reply. 3:40–3:55.» |
| `pages_read_user_content` | «Needed to read comments left by other people on the creator's own Page posts, so the queue can show them. 3:40–3:55.» |
| `pages_manage_posts` / `publish_video` | «The creator schedules a video or photo to their own Page from the Calendar; we publish it at the scheduled time. 3:55–4:20.» |
| `business_management` | «Some creators manage their Page through a Business Manager; without this permission those Pages do not appear in the list at connection time. 0:40–1:05.» |

Los minutos son orientativos: se ajustan al video final y se pegan iguales en cada nota.

## Qué hacer, en orden

Una sola toma, sin narración; subtítulos después. Meta acepta un video por varios
permisos si cada uno tiene su tramo claro.

| # | Acción | Subt. |
|---|---|---|
| 1 | `tu-parrilla.cl` (portada) y al lado App Settings → Basic con el mismo icono y el mismo nombre. Dos segundos. | 1 |
| 2 | `/ingresar`: correo, «Mandarme un código», el código, entrar. (Con la cuenta de revisión y su código fijo.) | 2 |
| 3 | Engranaje → **Los Fierros**. Bajo Instagram se lee el aviso «Cuenta Business o Creator, enlazada a una página de Facebook…». Pulsar **Conectar →**. | 3 |
| 4 | Diálogo de Facebook: **detenerse tres segundos** en la pantalla de permisos; se ven todos los de la tabla. Continuar. | 4 |
| 5 | Si hay varias páginas, la pantalla de elegir: marcar la de prueba. Volver a Los Fierros con la tarjeta de Instagram. | 5 |
| 6 | **Facebook → Conectar →**, mismo diálogo, misma página. Tarjeta de Facebook. | 6 |
| 7 | Pulsar **Sincronizar**. Pestaña **Los Cortes**: las tres publicaciones con sus números. | 7 |
| 8 | Pestaña **Los Números**: alcance, seguidores, la serie por día. | 8 |
| 9 | **El Fuego → «Poner al fuego»** (abre el compositor en La Parrilla): subir el video, marcar **Instagram**, elegir «Ahora», **Programar**. Mostrar el corte en la parrilla y, de vuelta en El Fuego, pasar a publicado. Abrir Instagram y mostrar el reel. | 9 |
| 10 | Lo mismo con la foto marcando **Facebook**; mostrar la publicación en la página. | 10 |
| 11 | Desde otra cuenta, comentar «GUÍA» en el reel recién publicado. Esperar la corrida (hasta cinco minutos). | |
| 12 | Pestaña **La Mesa**: el comentario en la cola, la respuesta propuesta, **Aprobar**; y la regla de palabra clave que ya respondió sola. Abrir Instagram y mostrar las dos respuestas. | 11 |
| 13 | El comentario de la página de Facebook, mismo flujo. | 12 |
| 14 | Engranaje → **Tu Cuenta** (nombre y zona) y **La Vitrina**, para que se vea que es un panel de una persona. | 13 |
| 15 | Los Fierros → **Desconectar** en Instagram: la tarjeta queda sin credencial. | 14 |
| 16 | facebook.com → Configuración → Apps y sitios web → quitar Tu Parrilla; y «Enviar solicitud» de borrado. Mostrar la página `/borrado/<código>` que devuelve. | 15 |
| 17 | `/privacidad`: qué se guarda, qué borra desconectar y qué borra el borrado. | 16 |
| 18 | Terminar la grabación. | |

**Los pasos 9–12 se hacen en ese orden a propósito:** el comentario tiene que ir sobre un
reel publicado por la app, y la corrida de comentarios tarda hasta cinco minutos; los pasos
10 y 13 llenan la espera.

## Los subtítulos

1. Tu Parrilla: a private dashboard for creators. No public signup.
2. Invited by email, signed in with a one-time code.
3. Accounts: the creator connects their own Instagram professional account.
4. All requested permissions, shown at once. Nothing hidden.
5. pages_show_list / business_management: the creator picks their own Page.
6. Same for their Facebook Page.
7. instagram_basic / pages_read_engagement: their own posts and counters.
8. instagram_manage_insights: reach and followers, once a day.
9. instagram_content_publish: a reel scheduled and published to their own account.
10. pages_manage_posts: a photo published to their own Page.
11. instagram_manage_comments: comments on their own media, replied with one tap or by a keyword rule.
12. pages_manage_engagement / pages_read_user_content: the same for Page comments.
13. One person, one account, their own settings.
14. Disconnect removes the stored tokens.
15. Removing the app from Facebook calls our deauthorize and data-deletion URLs.
16. Privacy policy: what we keep and how it is deleted.

## Errores que Meta castiga

- **Un permiso pedido que no aparece en el video.** Cada fila de la tabla tiene su escena;
  si se quita un permiso del review, se quita también de `SCOPES` en
  `src/app/api/social/[network]/connect/route.ts`, porque un permiso no aprobado hace fallar
  el diálogo entero cuando la app esté en Live.
- **El revisor no pudo entrar.** Es la primera causa de rechazo en apps sin registro
  público: por eso el código fijo de revisión.
- **Pantalla de permisos recortada.** Meta quiere ver el diálogo completo con todos los
  permisos; si el navegador la abre en un popup pequeño, agrandarlo antes de grabar.
- **Texto que promete lo que el video no muestra** (o al revés): las notas por permiso
  citan minutos; que los minutos existan.
- **Verificación de negocio pendiente.** El review no avanza sin ella; empezarla el mismo
  día que se decide grabar.

## Después de aprobar

- Pasar la app a **Live** (interruptor arriba del panel).
- Quitar `META_EN_REVISION` y `REVISION_CORREO`/`REVISION_CODIGO` de Vercel; redesplegar.
- Actualizar el aviso de Los Fierros si cambia lo que exige Instagram (hoy: cuenta Business
  con página), y la sección de Meta del README («Mientras la app esté en modo desarrollo…»).
