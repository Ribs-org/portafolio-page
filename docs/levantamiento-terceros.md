# Abrir Tu Parrilla a terceros: qué exige cada red y qué falta en la app

Fecha: 2026-09-30. Levantamiento para pasar de «la uso yo con mis cuentas» a «la usan
otras personas con las suyas», en las cuatro redes: Facebook, Instagram, TikTok y YouTube.
Parte de lo que el código pide hoy a cada red (`src/app/api/social/[network]/connect/route.ts`)
y del estado real de cada app de plataforma; lo que es papeleo del dueño va separado de lo
que es código. Al final, el orden propuesto y lo que se puede hacer **hoy** mientras los
trámites avanzan.

Las cifras de límites y cuotas son las publicadas por cada plataforma a la fecha; cada una
las cambia sin avisar, así que antes de prometer un número a un usuario, comprobarlo en el
panel de la plataforma correspondiente.

## 1. Dónde estamos, red por red

| Red | Qué pide la app hoy | Estado de la app de plataforma | Si hoy conecta alguien que no eres tú |
|---|---|---|---|
| **Instagram** | `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `instagram_content_publish`, `business_management`, `instagram_manage_comments` | App de Meta en **modo desarrollo** | El diálogo de Facebook le dice que la función no está disponible; no puede conectar (es lo que le pasó a una usuaria el 2026-09-29). Solo entran cuentas con un rol en la app. |
| **Facebook** | `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `business_management`, `pages_manage_engagement` (+ `publish_video` al confirmar) | La misma app de Meta, mismo modo | Igual que Instagram. |
| **TikTok** | `user.info.basic`, `video.list`, `video.upload`, `video.publish` | App **aprobada y en producción** desde el 2026-09-28 (Login Kit + Content Posting API); la **auditoría de Direct Post** no está hecha | Puede conectar. Puede publicar, pero **solo como privado** (`SELF_ONLY`) y la app entera tiene un cupo de **5 usuarios por día** mientras no pase la auditoría. |
| **YouTube** | `youtube.upload`, `youtube.force-ssl` (OAuth), más una API key para métricas | Proyecto de Google Cloud con la pantalla de consentimiento **en pruebas** (*Testing*) | Solo entra si está en la lista de **test users** (máximo 100). Aunque entre, su token **caduca a los 7 días** y tiene que reconectar; y los videos que suba un proyecto no verificado quedan **privados** aunque pida público. |

Lo que ya está resuelto del lado del producto y no hay que rehacer: usuarios invitados por
correo con código, cada uno con su página y sus cuentas aisladas por dueño (`owner_id` en
toda lectura, con arnés de pruebas), varias cuentas por red, páginas legales de privacidad y
términos (`/privacidad`, `/terminos`), dominio propio con TLS, y la app de Android en
trámite en Play (`docs/play-store.md`).

## 2. Meta (Facebook e Instagram)

Una sola app de Meta sirve a las dos redes; el trámite es uno.

### 2.1 Salir del modo desarrollo

Para que cualquier persona pueda autorizar, la app tiene que estar en **modo Live**, y
para eso Meta exige **App Review** de cada permiso que la app pide con **acceso avanzado**.
Con acceso estándar (sin review) los permisos solo funcionan para gente con rol en la app,
que es exactamente lo de hoy.

Antes del review, Meta pide que la app tenga completo lo básico (App Settings → Basic):

- Icono, categoría, correo de contacto, **URL de política de privacidad** (existe:
  `https://tu-parrilla.cl/privacidad`) y **URL de términos** (existe).
- **URL de borrado de datos** («Data Deletion Request»): obligatoria para toda app con
  Facebook Login. O una URL con instrucciones para el usuario, o un *callback* al que
  Facebook manda un `signed_request` cuando alguien quita la app desde su cuenta de
  Facebook, y que tiene que responder con un código de confirmación y una URL de estado.
  **No existe hoy**; la página de privacidad solo dice «escribe a …». Ver §5.
- **Deauthorize callback** (opcional pero conviene): cuando el usuario quita la app desde
  Facebook, nosotros marcamos sus cuentas de Meta como sin credencial en vez de enterarnos
  al primer 190 del sync.
- **Verificación de negocio** (*Business Verification*): desde 2023 Meta la exige para
  dar acceso avanzado a casi todos estos permisos. Pide un Business Manager con documentos
  de la empresa (o de la persona con giro), y tarda de días a dos semanas. Es el paso más
  lento y el que conviene empezar **primero**, porque el review no avanza sin él.

### 2.2 Qué se revisa, permiso por permiso

Cada permiso se pide en el review con una explicación de para qué se usa y un **video**
(*screencast*) que muestre a un usuario real usándolo en la app. Por lo que la app hace hoy:

| Permiso | Para qué lo usamos | Qué mostrar en el video |
|---|---|---|
| `instagram_basic`, `pages_show_list`, `pages_read_engagement` | Listar las cuentas y páginas al conectar; leer posts y métricas | Conectar, elegir la cuenta, ver Los Cortes con sus números |
| `instagram_manage_insights` | Alcance, impresiones, seguidores por día | Los Números |
| `instagram_content_publish` | Publicar reels y fotos programados (incluidos trial reels) | Programar un corte y verlo salir |
| `instagram_manage_comments`, `pages_manage_engagement`, `pages_read_user_content` | Leer comentarios, responder, respuesta automática por palabra clave | La cola de comentarios y una regla de palabra clave |
| `pages_manage_posts`, `publish_video` | Publicar en la página de Facebook | Programar un corte a Facebook |
| `business_management` | Que aparezcan páginas administradas desde un Business Manager | Conectar con una cuenta que administra por Business |
| `instagram_manage_messages`, `pages_messaging` | **Todavía no se piden.** Son los del privado (mandar el PDF por DM), que hoy está apagado a la espera de este mismo trámite | Solo si se incluye el privado en esta vuelta |

Cuanto más se pide, más largo el review y más riesgo de rechazo por un permiso cuyo uso
no quedó claro en el video. Lo razonable es pedir en una primera vuelta lo que ya funciona
en pantalla y dejar los del privado para una segunda, salvo que el privado sea prioridad.

### 2.3 Con varios usuarios

- **Publicación en Instagram:** el límite es **por cuenta**, no por app (históricamente 25
  publicaciones por cuenta cada 24 h; el endpoint `content_publishing_limit` dice el vigente).
  No hay que hacer nada en la app salvo, en algún momento, mostrarle al usuario el cupo.
- **Llamadas a la Graph API:** el límite de la app crece con el número de usuarios (del
  orden de 200 llamadas por hora por usuario conectado). Con decenas de usuarios no es un
  problema; con cientos, el sync de métricas y de comentarios tiene que repartirse (ver §5).
- **Tokens:** los de larga duración de páginas no caducan mientras el usuario no cambie la
  contraseña ni quite la app; cuando pase, hoy la tarjeta pasa a «sin credencial» y el
  usuario reconecta. Con el *deauthorize callback* nos enteraríamos al instante.
- **Cuentas personales de Instagram** (no Business ni Creator, o sin página de Facebook
  enlazada) **no pueden conectar por este camino**. Hay que decirlo en pantalla antes del
  botón, no después del error. Alternativa a evaluar en otra vuelta: el «Instagram API con
  Instagram Login», que no exige página de Facebook, pero es otra app y otro review.

### 2.4 Tiempo

Verificación de negocio: 1–2 semanas. App Review: de una a tres semanas por vuelta, y una
vuelta rechazada por un video poco claro vuelve a la cola. Planificar **un mes** desde que
se manda el primer papel hasta que la app está en Live, si no hay rechazos.

## 3. TikTok

### 3.1 Lo que ya está

La app está aprobada y en producción: Login Kit y Content Posting API funcionan para
cualquier usuario. Términos, privacidad y el dominio verificado ya están cargados en el
portal de desarrolladores.

### 3.2 Lo que falta: la auditoría de Direct Post

Sin auditoría, todo video publicado por la API queda **privado** («Solo yo») aunque el
usuario pida público, y la app tiene un cupo de **5 usuarios distintos por día** que
publican. Con varios usuarios eso es inservible, así que la auditoría es la única puerta.

La auditoría es un formulario en el portal (el que quedó a medias el 2026-09-28 en este
mismo proyecto; las respuestas en inglés están redactadas y el guion del video en
`docs/tiktok-revision-guion.md` sirve de base) más un **video demostrativo** del flujo
completo: conectar, programar un video con la privacidad que el usuario eligió, verlo
salir con esa privacidad, y el aviso que la app muestra sobre las reglas de TikTok
(el compositor ya lo muestra). Pide también el detalle de los campos de la respuesta que se
usan y el cálculo del uso diario estimado.

### 3.3 Con varios usuarios

- Los límites de publicación son por usuario (TikTok los publica en el portal por app; hoy
  el habitual es unas pocas decenas de publicaciones por usuario al día) y hay un tope de
  llamadas por app por minuto. Ninguno aprieta con decenas de usuarios.
- Los tokens duran 24 h y el *refresh* un año: la app ya los renueva sola; el usuario
  reconecta una vez al año o si revoca desde TikTok.
- Cada app de TikTok da un `open_id` distinto por usuario (por eso las cuentas del sandbox
  quedaron duplicadas al pasar a producción): ya está resuelto con «Es la misma cuenta →»
  en Los Fierros, y no volverá a pasar mientras la app no cambie.

### 3.4 Tiempo

Una a dos semanas por vuelta de auditoría. Se puede mandar **esta semana**: no depende de
nada más.

## 4. YouTube

Es la red con más trámite escondido, porque son **dos trámites distintos** en Google y un
tercero en YouTube.

### 4.1 Verificación del OAuth (pantalla de consentimiento a *Production*)

Hoy el proyecto está en *Testing*: hasta 100 usuarios de prueba, tokens que caducan a los
**7 días** (el usuario tendría que reconectar cada semana) y la pantalla «Google no ha
verificado esta app». Para pasar a *Production* con `youtube.upload` y `youtube.force-ssl`
—que Google clasifica como **sensibles**, no restringidos— Google pide:

- **Dominio verificado** en Search Console (`tu-parrilla.cl`) y que la página principal
  explique qué hace la app y enlace a la privacidad.
- Política de privacidad en ese dominio (existe) que mencione el uso de datos de Google.
- Un **video** que muestre el flujo de consentimiento y cómo se usan los permisos.
- Nombre, logo y correo de soporte en la pantalla de consentimiento; el logo obliga a
  verificación, sin logo se puede publicar sin ella pero con aviso al usuario.

Por ser sensibles y no restringidos, **no** pide la auditoría de seguridad externa (CASA);
eso es solo para Gmail, Drive y similares. Tarda de dos a seis semanas.

### 4.2 Cuota de la YouTube Data API

Cada proyecto nace con **10.000 unidades al día** para todos sus usuarios juntos. Subir un
video cuesta **1.600**: son **seis videos al día en total**, no por usuario. Leer comentarios
y métricas también gasta (el sync de comentarios ya se acota a media hora por eso, ver
`src/lib/social/comentarios/ventana.ts`). Con tres usuarios activos se acaba.

Pedir más cuota es el **formulario de auditoría y extensión de cuota de YouTube API
Services**: revisan que la app cumple los términos de YouTube (cómo muestra los datos, qué
guarda, por cuánto tiempo, que el usuario pueda revocar) y piden un video y capturas.
Tarda semanas y se puede pedir en paralelo con la verificación del OAuth.

### 4.3 Videos privados hasta la auditoría

Los videos subidos por un proyecto que no ha pasado esa auditoría quedan **privados**
aunque se pidan públicos (política de YouTube desde 2020). O sea: sin §4.2, YouTube sirve
para leer métricas y comentarios, pero **no para publicar**. Vale la pena decirlo en la
tarjeta de YouTube mientras tanto, como se hace con TikTok.

### 4.4 Tiempo

El más largo de los cuatro: entre un mes y dos, contando la cuota. Se puede empezar hoy
(Search Console y la pantalla de consentimiento no dependen de nada).

## 5. Lo que hay que hacer en la app (código)

Ordenado por lo que bloquea un trámite primero.

1. **Callback de borrado de datos de Meta** (bloquea el review). Una ruta
   `POST /api/social/facebook/deletion` que verifique el `signed_request` con el
   `INSTAGRAM_APP_SECRET`, borre las cuentas de Meta de ese usuario (credenciales, métricas,
   destinos programados que no salieron) y responda `{ url, confirmation_code }`, más una
   página `/borrado/<código>` que diga en qué estado quedó. Y el **deauthorize callback**,
   que es la misma verificación con otra acción (marcar sin credencial). Alcance: una ruta,
   una página, tests de la firma y del aislamiento por dueño; un día.
2. **Zona horaria por usuario.** Hoy `SITE_TIMEZONE` es una sola para todo el sitio
   (Chile). Un usuario en otra zona programa «a las 19:00» y sale a otra hora, y El Fuego le
   dice «hoy» con el día de Chile. Es un campo en `users`, un selector en Ajustes y pasar la
   zona por donde hoy se pasa la constante (calendario, El Fuego, compositor, `cargaPorDia`,
   `servidosAyer`). Está en la hoja de ruta como parte de «crons por inquilino»; no bloquea
   ningún trámite pero sí una beta con gente fuera de Chile.
3. **Avisos honestos antes de conectar.** En Los Fierros, junto a cada botón: Instagram
   pide cuenta Business/Creator con página de Facebook; TikTok publica en privado hasta la
   auditoría (ya está); YouTube publica en privado hasta la auditoría de cuota. Y en el
   error del diálogo de Meta, un mensaje que diga «esta app todavía no está abierta a todos»
   en vez del genérico de Facebook.
4. **Cupos y reparto de los crons.** Los crons de sync, comentarios y publicación recorren
   a todos los usuarios en un bucle dentro de una sola ejecución. Con decenas de usuarios
   el tiempo de ejecución y las cuotas por app (YouTube sobre todo) se agotan. Es el ítem 4
   de la hoja de ruta: cola de trabajo, cupo por usuario, y una alerta cuando una red se
   queda sin cuota. Primero con pocos usuarios no hace falta; con más de diez, sí.
5. **Plan de Vercel.** El plan Hobby es para uso **personal y no comercial**, y además
   limita los crons a dos (por eso el pinger externo). Abrir el producto a terceros pide
   **Vercel Pro** (USD 20/mes por asiento): más crons, más tiempo de ejecución, y estar en
   regla. Supabase (500 MB y pausa por inactividad en el plan gratis, ya cubierta por el
   pinger), Resend (100 correos al día, de sobra para invitaciones y avisos) y R2 (10 GB)
   aguantan una beta; la primera que se queda corta con videos es R2.

## 6. Orden propuesto

Todo lo de papeleo va en paralelo desde el día uno, porque cada trámite tarda semanas y
ninguno depende de otro. Lo de código se intercala por lo que cada trámite pide.

| Semana | Papeleo (dueño) | Código |
|---|---|---|
| 1 | Verificación de negocio en Meta (documentos). Auditoría de Direct Post de TikTok (formulario + video). Search Console y pantalla de consentimiento de Google. Vercel Pro. | Callback de borrado y deauthorize de Meta (§5.1). Avisos antes de conectar (§5.3). |
| 2 | Enviar App Review de Meta (videos por permiso) en cuanto la verificación de negocio esté. Formulario de verificación del OAuth de Google. | Zona horaria por usuario (§5.2). |
| 3–4 | Responder a los rechazos, si los hay. Formulario de cuota de YouTube. | Cupos y alerta de cuota (§5.4), si la beta pasa de diez usuarios. |
| 5–8 | Esperar a Google. | — |

**Mientras tanto se puede probar con gente real hoy mismo**, sin esperar ningún trámite:

- Meta: agregarlos como **Testers** de la app (App Roles); con rol, el diálogo funciona y
  todos los permisos actuales van con acceso estándar. Sirve para una beta cerrada de hasta
  unas decenas de personas.
- TikTok: pueden conectar y publicar en privado; 5 por día.
- YouTube: agregarlos como **test users** en la pantalla de consentimiento (hasta 100),
  con la molestia de reconectar cada semana y sin poder publicar.

Eso da una beta cerrada útil para Instagram y Facebook (el uso principal) en la semana 1,
y la apertura de verdad al mes para Meta y TikTok, y al mes o dos para YouTube.

## 7. Preguntas abiertas que deciden alcance

1. **¿El privado (DM con el PDF) va en la primera vuelta de App Review de Meta?** Suma
   dos permisos, un video más y riesgo de rechazo; a cambio, la función que hoy está
   apagada se enciende junto con el resto. Recomendación: segunda vuelta.
2. **¿Empresa o persona para la verificación de negocio de Meta?** Meta acepta ambas con
   documentos distintos; con empresa es más directo. Decide quién firma.
3. **¿YouTube entra en la beta o se deja para después?** Es el trámite más largo y el que
   menos usa la app hoy. Si la beta es de creadores de Instagram y TikTok, YouTube puede
   esperar sin frenar nada.
4. **¿Hasta cuántos usuarios en la beta?** Por debajo de diez, nada de §5.4 hace falta;
   por encima, sí, y conviene saberlo antes de invitar.
