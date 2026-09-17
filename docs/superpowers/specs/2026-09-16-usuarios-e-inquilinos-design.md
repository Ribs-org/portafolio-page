# Usuarios e inquilinos — que cada creador vea solo lo suyo

Fecha: 2026-09-16
Estado: aprobado, pendiente de plan de implementación

Subproyecto 1 de la hoja de ruta de Parrilla (`2026-09-16-parrilla-hoja-de-ruta.md`).

## Problema

El panel no sabe quién eres: una contraseña compartida abre todo, ninguna tabla tiene
dueño, y las funciones que eligen «tu cuenta de Instagram» toman la más antigua de la
base. Con un segundo usuario, vería tus posts, publicaría en tus redes y, al conectar una
cuenta que ya tienes, pisaría tu token. Nada de la hoja de ruta se puede construir hasta
que exista la noción de usuario y cada consulta la respete.

## Objetivo

Que exista una tabla de usuarios; que la sesión web y la móvil identifiquen a uno; que se
entre por un código de seis dígitos enviado al correo, solo si ese correo fue invitado; que
las tablas raíz tengan dueño y **ninguna consulta a una tabla con dueño salga sin el
filtro**; que OAuth guarde cada cuenta social a nombre de quien la conectó; que el destino
de un post sea siempre una cuenta del mismo dueño; y que el dueño actual quede migrado como
primer usuario sin perder nada ni reconectar nada.

## No objetivos (de este subproyecto)

- **Crons por inquilino.** El cron sigue recorriendo todas las cuentas en un bucle; solo
  cambia que la alerta de fallo va al dueño de la cuenta.
- **Zona horaria por usuario.** Sigue una para el despliegue (`SITE_TIMEZONE`).
- **Página pública por usuario en el dominio del producto** y atribución por dueño.
  Aquí solo se reservan palabras para los slugs.
- **Llaves de API por usuario.** `SCHEDULE_API_KEY` queda atada al usuario admin.
- **Registro abierto.** Solo correos invitados por el admin.
- **La pantalla nueva de la app móvil.** El endpoint de sesión acepta el camino nuevo;
  la app lo adopta en el subproyecto 5.
- **Seguridad a nivel de fila en Postgres.** Descartada: el driver HTTP de Neon no
  mantiene sesión entre consultas.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Columna `owner_id` en las tablas raíz y filtro en la aplicación | RLS de Postgres; un esquema por usuario | El código ya sabe filtrar; RLS exige `set_config` por conexión que neon-http no ofrece; esquemas multiplican migraciones y crons |
| Código de seis dígitos al correo, con Resend | Correo y contraseña; «Entrar con Google» | Sin contraseñas que guardar ni resetear; la invitación es el mismo correo; Google exige verificar la pantalla de consentimiento para externos |
| A un correo no invitado se le responde igual que a uno invitado | Decir «no estás invitado» | No revelar quién está en la beta |
| `users.sesion_version` para cerrar sesiones de una persona | Rotar `AUTH_SECRET` | Rotarlo obligaría a reconectar todas las redes: cifra los tokens sociales |
| La etiqueta `?s=` sigue única global | Única por dueño | Las visitas solo traen la etiqueta; la desambiguación por hash ya existe. `social_posts` gana `owner_id` para filtrar |
| `cuentasPrimarias(ownerId, redes)` | Borrar la noción de «primaria» | Un usuario con dos páginas de Facebook sigue necesitando una por defecto; solo cambia el universo donde se elige |
| El endpoint móvil acepta contraseña (dueño) y correo+código durante la transición | Romper la app instalada | El subproyecto 5 cambia la pantalla; hasta entonces el teléfono del dueño sigue entrando |
| Tres migraciones aditivas | Una sola con `NOT NULL` | Regla de convivencia: el código anterior debe correr sobre el esquema nuevo mientras dura el despliegue |

## 1. Datos

### `users`

```
id uuid pk
correo text not null unique          -- guardado en minúsculas y sin espacios
nombre text
rol text not null default 'usuario'  -- 'admin' | 'usuario'
sesion_version integer not null default 1
invitado_en timestamptz not null default now()
primer_ingreso_en timestamptz
created_at, updated_at
```

### `codigos_ingreso`

```
id uuid pk
user_id uuid not null → users on delete cascade
hash text not null              -- sha256(codigo + AUTH_SECRET derivado), nunca el código
expira_en timestamptz not null  -- 10 minutos
usado_en timestamptz
intentos integer not null default 0   -- máximo 5 por código
created_at
```

### `owner_id` (uuid → users, on delete restrict)

En `profiles`, `social_accounts`, `scheduled_posts`, `source_authors`, `social_posts` y
`ajustes` (cuya PK pasa a `(owner_id, clave)`). Las demás heredan por FK: `links`,
`visits`, `clicks` (vía `profiles`); `post_metrics`, `account_metrics`, `post_comments`
(vía `social_accounts`/`social_posts`); `scheduled_post_targets`, `scheduled_post_media`,
`reglas_clave` (vía `scheduled_posts`); `source_posts` (vía `source_authors`).

### Únicas que cambian

- `social_accounts`: `(network, external_id)` → `(owner_id, network, external_id)`.
- `source_authors`: `(network, username)` → `(owner_id, network, username)`.
- `ajustes`: PK `clave` → `(owner_id, clave)`.
- `social_posts.campaign` sigue única global.

### Coherencia post ↔ destino

Al crear o rearmar un destino, la aplicación exige `account.owner_id === post.owner_id`.
Un CHECK no puede cruzar tablas; el guardián vive en `crearPostProgramado`,
`updateScheduledPost`, el lote y el chequeo móvil, todos vía `cuentasPrimarias(ownerId)`.

### Migraciones (tres, aditivas)

1. `users`, `codigos_ingreso`; inserta al dueño con `rol = 'admin'` y el correo de
   `ADMIN_EMAIL` (variable nueva; el seed la exige).
2. `owner_id` **nulable** en las seis tablas; `UPDATE … SET owner_id = (select id from
   users where rol = 'admin' limit 1)` en cada una; índices por `owner_id`.
3. `owner_id NOT NULL`; se sueltan las únicas viejas y se crean las nuevas; `ajustes`
   cambia de PK. Esta corre solo cuando el código de la entrega 2 ya lee `owner_id`.

## 2. Sesión con identidad

`src/lib/auth.ts`:

- El JWT de sesión lleva `{ sub: userId, rol, sv: sesion_version, purpose: 'session' }`.
  La clave se deriva de `AUTH_SECRET` con HKDF e info `parrilla-session-v1`, distinta de
  la del cifrado de tokens sociales (que no cambia).
- `requireUser(): Promise<{ id: string; rol: 'admin' | 'usuario' }>` reemplaza a
  `requireAuth()`: lee la cookie, verifica firma, busca al usuario y compara `sv`; si no
  calza, redirige a `/ingresar`. `requireAdmin()` exige además `rol === 'admin'`.
- `isAuthenticated()` desaparece; sus cuatro usos pasan a `usuarioActual(): Promise<Usuario | null>`.
- `passwordMatches` y `ADMIN_PASSWORD` sobreviven **solo** para el endpoint móvil de
  transición (§5) y se van con el subproyecto 5.

## 3. Ingreso por código

Rutas nuevas `/ingresar` (correo) y `/ingresar/codigo` (código), páginas server con
acciones:

- `pedirCodigo(correo)`: normaliza (`trim`, minúsculas), busca al usuario; **si no
  existe, responde igual** («Si tu correo está invitado, te llegará un código») y no
  manda nada. Si existe: invalida los códigos vivos de ese usuario, genera seis dígitos
  con `crypto.randomInt`, guarda el hash con expiración a 10 minutos, y manda el correo
  por Resend desde `ingreso@tu-parrilla.cl` (dominio verificado en Resend; hasta entonces
  el remitente de prueba de Resend, que solo llega al correo del dueño). Tope: 3 códigos
  por usuario cada 15 minutos.
- `canjearCodigo(correo, codigo)`: busca el código vivo, compara hash en tiempo
  constante, suma `intentos`; a los 5 fallos el código muere. Éxito → `usado_en`,
  `primer_ingreso_en` si es la primera vez, cookie de sesión, redirección al panel.
- `cerrarSesion()`: borra la cookie. `cerrarTodasLasSesiones()` (en la pantalla de
  cuenta): `sesion_version + 1`.

Lo puro, en `src/lib/ingreso.ts` con tests: normalizar correo, generar código, hash,
vigencia, conteo de intentos, frases fijas.

## 4. Invitaciones (solo admin)

Página `/admin/usuarios`: tabla de usuarios (correo, nombre, invitado, primer ingreso),
formulario «Invitar» (correo, nombre opcional) que crea el usuario y manda el primer
código, y «Quitar» que borra al usuario **solo si no tiene datos** (sin perfiles, cuentas
ni posts); si los tiene, la acción lo dice y no borra. El enlace del menú aparece solo
para el admin.

## 5. Sesión móvil

`POST /api/mobile/session` acepta dos cuerpos:

- `{ password }`: como hoy, valida contra `ADMIN_PASSWORD` y emite el token **del usuario
  admin**. Camino de transición para la app instalada.
- `{ correo, codigo }`: canjea igual que la web y emite el token de ese usuario.
- `POST /api/mobile/session/codigo` con `{ correo }`: pide el código (misma lógica y
  misma respuesta neutra).

El token móvil lleva `sub` y `sv`; `requireMobile()` pasa a `requireMobileUser()` y
devuelve `{ id, rol }` o 401. Sus 7 rutas reciben el usuario y filtran.

## 6. El usuario en cada consulta

Regla: **toda consulta a `profiles`, `social_accounts`, `scheduled_posts`,
`source_authors`, `social_posts` o `ajustes` lleva `eq(tabla.ownerId, ownerId)`**, y toda
consulta a una tabla hija llega por un join que ya filtró al padre, o filtra por
`account_id`/`post_id` que se obtuvo filtrado.

Cómo se enhebra, por área:

- **Acciones del panel** (`src/app/admin/actions.ts`, 25 usos): `const { id: ownerId } =
  await requireUser()` al inicio y `ownerId` a cada función de datos.
- **Páginas del panel** (`/admin`, `/admin/analytics`, `/admin/content`, `/admin/comments`,
  `/admin/accounts`, `/admin/schedule`, `/admin/profiles`, y sus subpáginas): igual.
- **Rutas móviles** (7): `requireMobileUser()`.
- **Rutas con `SCHEDULE_API_KEY`** (3): el usuario es el admin (`usuarioAdmin()`).
- **OAuth** (`connect`, `callback`, `elegir`): §7.
- **Crons**: recorren todas las cuentas como hoy, pero cada cuenta trae `owner_id` y lo
  pasa a lo que crea (`social_posts`, `post_comments` heredan por FK; `crear.ts` y el
  sondeo no cambian de forma). `sendFailureAlert` recibe el correo del dueño de la cuenta
  en vez de `PUBLISH_ALERT_TO`.
- **`ajustes`**: `leerAjuste(ownerId, clave)` y `guardarAjuste(ownerId, clave, valor)`.
  Las instrucciones del modelo y el tope de lecturas de X pasan a ser por usuario.
- **`cuentasPrimarias(ownerId, redes)` / `exigirCuentas(ownerId, redes)`**: eligen entre
  las cuentas del dueño; sus cinco llamadas pasan `ownerId`.
- **Página pública** `/<slug>` y `/`: sin cambio de dueño (subproyecto 3), salvo la lista
  de slugs reservados en `src/lib/slugs.ts`: `admin`, `api`, `ingresar`, `privacidad`,
  `terminos`, `docs`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `icon.svg`.

Módulos de lectura por área con `ownerId` obligatorio como primer argumento:
`src/lib/analytics.ts` (`Filters` gana `ownerId` obligatorio), `src/lib/comentarios-cola.ts`,
`src/lib/posts-kpis.ts`, `src/lib/profiles.ts`, `src/lib/social/cuentas.ts`,
`src/lib/mobile-api.ts`.

## 7. OAuth atado al usuario

- `signOAuthState(network, ownerId)` firma `{ purpose, network, sub }`;
  `oauthStateMatches(state, network, ownerId)` exige los tres.
- El callback obtiene `ownerId` de `usuarioActual()`, verifica el `state`, y
  `guardarCuenta(ownerId, network, …)` hace el upsert sobre `(owner_id, network,
  external_id)`. La cookie `COOKIE_PENDIENTE` lleva `ownerId` dentro de su payload
  firmado, y `/admin/accounts/elegir` lo compara con la sesión.
- La cuenta de YouTube que nace de `YOUTUBE_CHANNEL_ID` se crea a nombre del admin.

## 8. Migración del dueño y despliegue

1. Antes de fusionar la entrega 1: `ADMIN_EMAIL` en Vercel (Production) y verificar el
   dominio en Resend (o aceptar que solo el dueño reciba correo hasta entonces).
2. Entrega 1 despliega la migración 1: el dueño existe y puede entrar por código; la
   contraseña sigue valiendo para el móvil.
3. Entrega 2 despliega la migración 2 (dueño nulable y relleno) **antes** de que el
   código lea `owner_id`, y en el mismo PR el código que filtra; la migración 3 va en la
   entrega 3, cuando ya nada escribe sin dueño.

## Manejo de errores

Frases fijas en español: `CORREO_INVALIDO` («Ese correo no se ve bien.»),
`CODIGO_ENVIADO` («Si tu correo está invitado, te llegará un código en un minuto.»),
`CODIGO_INCORRECTO` («Ese código no es válido o ya venció.»), `DEMASIADOS_INTENTOS`
(«Demasiados intentos. Pide un código nuevo.»), `SESION_CADUCADA` («Tu sesión terminó.
Vuelve a entrar.»), `SIN_CUENTA_DESTINO` (la de hoy, por dueño), `USUARIO_CON_DATOS`
(«Ese usuario tiene datos; no se puede quitar.»). El detalle de Resend al `console.error`.

## Testing

- `ingreso.test.ts`: normalización de correo, código de seis dígitos, hash y comparación
  en tiempo constante, vigencia, intentos, tope de envíos.
- `auth.test.ts`: el JWT lleva `sub`/`sv`/`purpose`; un `sv` viejo no vale; un token de
  OAuth `state` no vale como sesión (el `purpose`).
- `oauth-state.test.ts`: el `state` con `sub` de otro usuario no calza.
- `cuentas.test.ts` (parte pura): elección de primaria dentro del dueño.
- `slugs.test.ts`: reservados.
- **Aislamiento**: un test de integración `aislamiento.test.ts` contra `DATABASE_URL` de
  prueba (rama de Neon del preview, con `MIGRAR_PREVIEWS=1` ya activa) que crea dos
  usuarios con perfil, cuenta, post programado, comentario y ajuste cada uno, y recorre
  las funciones de lectura de §6 comprobando que ninguna devuelve filas ajenas. Se salta
  sin `DATABASE_URL`.
- Manual: dueño entra por código; segundo invitado entra, conecta una cuenta de prueba,
  no ve nada del dueño; la app instalada entra con la contraseña.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `ADMIN_EMAIL` | Correo del primer usuario (admin); el seed y la migración 1 lo exigen |
| `INGRESO_FROM` | Remitente de los códigos (`ingreso@tu-parrilla.cl` cuando Resend verifique el dominio) |

`ADMIN_PASSWORD` sigue existiendo solo para la sesión móvil de transición.

## Trámite del dueño (paralelo)

1. Verificar `tu-parrilla.cl` en Resend (registros DKIM/SPF en Cloudflare) para poder
   enviar códigos a otros correos.
2. `ADMIN_EMAIL` y `INGRESO_FROM` en Vercel.

## Las entregas

1. **Identidad**: `users`, `codigos_ingreso`, sesión con `sub`, `/ingresar`, invitaciones,
   sesión móvil doble, `ADMIN_EMAIL`. Todo el mundo sigue viendo todo (aún no hay dueño en
   las tablas); solo el admin está invitado.
2. **Dueño en todo**: migración 2, `ownerId` en cada consulta de §6, `cuentasPrimarias`
   por dueño, OAuth atado, alerta al dueño, test de aislamiento.
3. **Cierre**: migración 3 (`NOT NULL`, únicas nuevas), slugs reservados, YouTube por
   entorno atado al admin, `SCHEDULE_API_KEY` atada, README y páginas legales del producto.

Cada entrega es su propio PR a `main`.
