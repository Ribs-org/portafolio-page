# Abrir la app a terceros: el código que los trámites piden

Fecha: 2026-09-30. Implementa el §5 de `docs/levantamiento-terceros.md`, salvo el reparto de
los crons por cupos (§5.4), que ese documento deja para cuando la beta pase de diez usuarios.
Vercel Pro no es código. Va en tres entregas, cada una con su rama y su PR, en este orden:

- **A. Meta: baja y borrado.** Los dos callbacks que Meta exige para el App Review.
- **B. La zona horaria de cada usuario.** Hoy hay una sola para todo el sitio.
- **C. Avisos antes de conectar.** Lo que cada red exige, dicho junto al botón y no después
  del error.

Después del código, y no antes, se escriben los guiones de los videos de revisión (§5).

## 1. Principios

- **Nada de lo que ya funciona cambia de sitio.** Las rutas del panel no cambian; las
  frases de error existentes no se tocan (tienen tests letra por letra); lo nuevo se suma.
- **Toda lectura de la base atada al dueño**, salvo las dos rutas de Meta, que por diseño
  buscan por el id de usuario de Facebook (Meta no sabe quién es nuestro dueño). Esa
  excepción queda escrita en el código y en `docs/deuda-tecnica.md`.
- **Documentación con cada entrega**, según la tabla de `AGENTS.md`: README (setup de Meta,
  tabla de variables, tabla de URLs), `.env.example`, la página de privacidad.
- **Comentarios en español, código en inglés y en llano**, con el estilo del archivo.

## 2. Entrega A — Meta: baja y borrado

### 2.1 Qué pide Meta

En App Settings → Basic, dos URLs. **Deauthorize callback**: cuando alguien quita la app
desde su cuenta de Facebook, Meta hace `POST` con un `signed_request`. **Data deletion
request**: cuando alguien pide borrar sus datos desde Facebook, el mismo `POST`, y la app
tiene que responder JSON `{ "url": "<estado>", "confirmation_code": "<código>" }` y sostener
esa URL de estado. Las dos llegan como `application/x-www-form-urlencoded` con un campo
`signed_request` de la forma `<firma>.<payload>`, ambos base64url; el payload es JSON con
`algorithm: "HMAC-SHA256"`, `user_id` (el id de usuario **de la app**, no el de la página ni
el de Instagram) e `issued_at`. La firma es HMAC-SHA256 del payload con el **app secret**
(`INSTAGRAM_APP_SECRET`: la app de Meta es una sola para las dos redes).

### 2.2 Para poder encontrar a quién se refiere

`social_accounts.external_id` guarda el id de la página o de la cuenta de Instagram; el
`user_id` del `signed_request` es otro. Hace falta guardarlo al conectar:

- Columna nueva **`social_accounts.meta_user_id`** (`text`, nulable, con índice). La
  llena `fetchCredential` para `instagram` y `facebook` con una llamada más al Graph,
  `GET /me?fields=id` con el token de usuario, y viaja hasta `guardarCuenta` tanto en la
  rama de una sola candidata como por la cookie pendiente hasta la elección en
  `/admin/accounts/elegir`.
- Las cuentas conectadas **antes** de este cambio quedan con `meta_user_id` nulo hasta que
  su dueño reconecte. Si Meta manda un callback por uno de esos usuarios, la ruta responde
  igual (Meta lo exige) con cero cuentas afectadas. El README lo dice: «reconecta Instagram
  y Facebook para quedar cubierto».
- Una cookie pendiente escrita **antes** del cambio no trae el campo, y se acepta con
  `metaUserId` en `null` en vez de tomarse por sesión vencida: quien está eligiendo su
  cuenta en ese momento no tiene por qué empezar de nuevo, y esa fila rellena su nulo al
  reconectar como cualquier otra.

### 2.3 Qué hace cada callback

- **Baja** (`POST /api/social/meta/baja`): las cuentas de Meta (`instagram` y `facebook`)
  con ese `meta_user_id` quedan **sin credencial** —`access_token`, `refresh_token` y
  `expires_at` a `NULL`—, igual que «Desconectar» en Los Fierros, y con
  `last_sync_error = 'Quitaste la app desde Facebook: vuelve a conectar.'` para que la
  tarjeta diga por qué. El historial se queda.
- **Borrado** (`POST /api/social/meta/borrado`): en **una transacción**, para cada cuenta
  de Meta con ese `meta_user_id`, se borra lo que vino de Meta: `post_metrics` de sus
  `social_posts`, `post_comments`, `social_posts`, `account_metrics`,
  `scheduled_post_targets` de esa cuenta, y la fila de `social_accounts`. Los
  `scheduled_posts` (el texto y la media del dueño) no son datos de Meta: un corte que
  conserve destinos en otra red sigue en la parrilla. Pero uno que se quede sin ningún
  destino se borra con ellos, texto y media incluidos (la media la barre R2), porque la
  parrilla lee por `innerJoin` con los destinos y un corte sin ninguno desaparece de todas
  las vistas sin que el dueño pueda ni abrirlo ni borrarlo. Ese séptimo paso solo alcanza
  a los que **esta** operación dejó huérfanos (`not exists` sobre los destinos que
  queden), así que un borrador que ya estaba sin destinos no se toca. Después se inserta
  una fila en **`solicitudes_borrado`** y se responde el JSON con la URL de estado.
- **Firma inválida, sin `signed_request`, algoritmo distinto, o un `issued_at` a más de
  24 h del reloj**: `400` sin cuerpo. Ambas rutas son `POST` públicos, sin sesión, y la
  ventana es lo único que impide reenviar un cuerpo capturado y volver a borrar.

### 2.4 Modelo de datos

- `social_accounts.meta_user_id text` + `social_accounts_meta_user_idx`.
- Tabla nueva `solicitudes_borrado`: `id uuid`, `codigo text unique` (16 caracteres
  base32 en minúscula, aleatorios), `red text` (`'meta'`, por si mañana otra red pide lo
  mismo), `meta_user_id text`, `cuentas integer` (cuántas se borraron), `creado_en
  timestamptz`. Sin `owner_id`: cuando se inserta, el dueño ya no tiene cuentas de Meta y
  Meta no sabe quién es.

### 2.5 La página de estado

`/borrado/[codigo]`, pública, del grupo `(legal)`: «Datos borrados el {fecha}: {N} cuentas
de Instagram y Facebook.» o, sin código conocido, «No conocemos ese código de borrado.» Sin
nada más: ni nombre ni correo de nadie.

### 2.6 Módulos

- `src/lib/social/meta-firma.ts`:
  `leerSignedRequest(raw, secret, now = Date.now()): { userId, issuedAt } | null`, pura;
  base64url, HMAC-SHA256, comparación en tiempo constante (`timingSafeEqual`), rechaza
  cualquier `algorithm` que no sea `HMAC-SHA256`, y rechaza un `issued_at` a más de 24 h
  del reloj en cualquier sentido —Meta no manda nonce, así que sin esa ventana el mismo
  cuerpo capturado vuelve a borrar para siempre—. `now` entra por parámetro para que el
  test no dependa del reloj. Tests con firmas construidas en el propio test y con las
  mutaciones obvias (firma cambiada, payload cambiado, algoritmo distinto, sin punto,
  fecha vieja, fecha en el futuro).
- `src/lib/social/meta-bajas.ts`: `darDeBaja(metaUserId): Promise<number>` y
  `borrarDatosDe(metaUserId): Promise<{ codigo: string; cuentas: number }>`. Los pasos
  de SQL salen a `pasosDeBorrado(metaUserId): SQL[]` como en `fusion.ts`, para poder
  probar el SQL con `PgDialect().sqlToQuery()` sin base. El séptimo paso, el de los cortes
  que quedaron sin ningún destino, va en `pasoDeHuerfanos(postIds): SQL | null`: necesita
  ids que solo se saben leyendo antes de borrar los destinos, y no comparte las dos
  invariantes de los otros seis.
- Las dos rutas y la página. El README, sección de Meta: las dos URLs a configurar y la
  nota de reconectar. La página de privacidad, donde dice «escribe a …»: las dos acciones
  de Facebook, que no son la misma —quitar la app **desconecta** Instagram y Facebook (se
  van las credenciales, el historial se queda), y **pedir el borrado** desde esa misma
  pantalla borra lo que vino de esas dos redes y devuelve un código con su página de
  estado—. Decirlo al revés es prometer en la página legal más de lo que el código hace.
  `docs/deuda-tecnica.md`, entrada del arnés: las dos rutas buscan por `meta_user_id` a
  propósito.

## 3. Entrega B — La zona horaria de cada usuario

### 3.1 Hoy

`SITE_TIMEZONE` (`src/lib/analytics.ts`, por defecto `America/Santiago`) es una sola para
todo: el calendario, El Fuego, el compositor, las acciones que convierten «19:00» a un
instante, las rutas de la API y del teléfono, el lote de publicación, y los días de Los
Números. Un usuario en otra zona programa a una hora y sale a otra.

### 3.2 Modelo

- `users.zona text not null default 'America/Santiago'`. Los usuarios existentes quedan
  con el default, que es lo que tenían de hecho.
- `Usuario` (el objeto de sesión que devuelven `requireUser`, `requireMobileUser`,
  `usuarioActual`) gana `zona`. Nada más tiene que leer la base para saberla.
- Validación: una zona es válida si `new Intl.DateTimeFormat('es', { timeZone })` no lanza.
  Frase nueva: `ZONA_INVALIDA = 'Esa zona horaria no existe.'`.

### 3.3 La pantalla

Nueva pantalla del grupo Ajustes: ruta **`/admin/cuenta`**, nombre **«Tu Cuenta»**,
subtítulo **«tu nombre y tu hora»**. Un formulario con el nombre (el que ya existe en
`users.nombre`) y la zona: un `<select>` con `Intl.supportedValuesOf('timeZone')`, la
actual seleccionada, y debajo «Ahora son las {hora} en esa zona» calculado en el servidor
al guardar. Acción `guardarCuenta(formData)`: valida, actualiza `users` por `id`, revalida
`/admin`. La fila entra en `src/lib/vocabulario.ts` (grupo `ajustes`, después de Los
Maestros; `vocabulario.test.ts` comprueba que la página existe) y en el engranaje.

### 3.4 Por dónde pasa la zona

`SITE_TIMEZONE` deja de usarse donde hay un usuario o un dueño a mano y se queda como
**default de los usuarios nuevos y del sitio público** (`/` sin dueño). Concretamente:

- Panel: `schedule/page.tsx`, `page.tsx` (El Fuego), `schedule/[id]/page.tsx`,
  `profiles/[id]/page.tsx` (ventanas de los links), `analytics/page.tsx`: `usuario.zona`.
- Acciones (`admin/actions.ts`): los cuatro `fromZonedInput(…, SITE_TIMEZONE)` pasan a la
  zona del usuario de la sesión.
- API: `api/schedule/posts` (zona del dueño de la llave), `api/mobile/*`
  (`usuario.zona`), `social/publish/batch.ts` (la zona del dueño, leída con `buscarPorId`;
  su `ZONE` local desaparece).
- `lib/analytics.ts`: `Filters` gana `zone` (obligatoria); `localDay`, `describe`,
  `granularityFor`, `getTimeSeries`, `getHeatmap` la reciben en vez de leer la constante.
  Quien arma `Filters` pasa la del dueño. `lib/posts.ts` y `posts-kpis.ts` igual.
- Lo que no cambia: los crons (trabajan con instantes), la cola de comentarios (ventanas
  en horas), y la baliza de visitas (guarda instantes; el día se calcula al leer).

README: la tabla de variables (`SITE_TIMEZONE` pasa a «zona por defecto de los usuarios
nuevos y del sitio público»), la sección del panel (Tu Cuenta), la tabla de URLs.

## 4. Entrega C — Avisos antes de conectar

En Los Fierros, bajo el título de cada red, una línea en `text-fg-faint`, siempre visible:

| Red | Línea |
|---|---|
| Instagram | «Cuenta Business o Creator, enlazada a una página de Facebook. Una cuenta personal no puede conectar.» |
| Facebook | «Una página, no un perfil personal.» |
| YouTube | «Hasta que Google apruebe la cuota de la app, lo que publiques sale privado.» |
| TikTok | «Hasta que TikTok apruebe la publicación directa, lo que publiques sale como “Solo yo”.» (Los Fierros no lo decía; solo el compositor.) |

Y, solo mientras la app de Meta siga en modo desarrollo, una segunda línea en los bloques
de Instagram y Facebook, encendida por la variable **`META_EN_REVISION=1`**: «Mientras Meta
revisa la app, solo pueden conectar las cuentas que invitamos como testers. Si Facebook
dice que la función no está disponible, escríbenos.» La variable se documenta en
`.env.example` y en la tabla del README, con la instrucción de quitarla al pasar a Live.
No hay forma de interceptar ese error: Facebook lo muestra en su propia página y nunca
vuelve a nuestro callback.

## 5. Los guiones (después del código)

Tres documentos en `docs/`, en español, con la misma forma que `tiktok-revision-guion.md`:
qué datos sembrar, escena por escena qué se ve en pantalla y qué se dice, y qué campo del
formulario de la plataforma responde cada escena.

- `docs/meta-revision-guion.md`: un guion por permiso de la primera vuelta (los de §2.2 del
  levantamiento, sin los del privado), más las respuestas a las preguntas del formulario.
- `docs/google-verificacion-guion.md`: el video del consentimiento OAuth y el de la
  auditoría de cuota de YouTube.
- `docs/tiktok-revision-guion.md`: se actualiza con la sección de la auditoría de Direct
  Post (las respuestas ya redactadas el 2026-09-28).

## 6. Lo que queda fuera

El reparto de los crons por cupos (§5.4 del levantamiento), la API de Instagram con
Instagram Login (sin página de Facebook), los permisos del privado en el App Review, y
cualquier pantalla de «cupo que te queda» por red.
