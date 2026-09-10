# Multicuentas — varias cuentas por red, en todas las capas

Fecha: 2026-09-10
Estado: aprobado, pendiente de plan de implementación (cinco entregas, un plan por entrega)

Se apoya en todo lo construido: los conectores de lectura, la sincronización diaria, el
calendario de publicación, la carga masiva, la API del editor y la app Android. El
levantamiento de todo lo que hoy asume «una cuenta por red» está en
`docs/superpowers/specs/2026-09-10-multicuentas-mapa.md`; este diseño argumenta contra ese mapa.

## Problema

El dueño va a manejar varias páginas de Facebook, varias cuentas de Instagram y varios
canales de YouTube (y TikTok cuando la app pase revisión), cada uno con su propio login.
Quiere programar quince posts y mandar cinco a cada cuenta, y comparar cómo rinde cada
una.

Hoy el sistema usa **el nombre de la red como identificador de la cuenta**. Cuatro
tablas lo tienen grabado como restricción única, el login de cada red está diseñado a
propósito para rechazar una segunda cuenta (porque conectar otra archivaba el catálogo
entero de la anterior), y la sincronización archiva «lo que ya no aparece en la red»,
lo que con dos cuentas de Facebook haría que la cuenta A archive los posts de la B.

## Objetivo

Que una cuenta conectada sea una entidad propia, con su id, en todas las capas: base
de datos, login, sincronización, publicación, panel, API del editor y app. Que conectar
sume en vez de reemplazar. Que un post programado, una métrica y un tag de campaña sepan
de qué cuenta son. Que el editor-LLM pueda nombrar la cuenta de destino.

## No objetivos

- **Espacios de trabajo separados por cliente.** Todas las cuentas son del dueño y se
  ven en un solo panel; la comparación entre cuentas es justamente el valor.
- **Cambiar los tags de campaña existentes.** Son la llave de la atribución de tráfico;
  se quedan como están.
- **Publicar en TikTok.** Sigue esperando la revisión de la plataforma.
- **Permisos por cuenta o por usuario.** Un solo dueño, una sola contraseña.
- **Borrar cuentas con su historial.** Desconectar sigue borrando solo credenciales; la
  fila y sus posts sobreviven, como hoy.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| La cuenta como entidad con `accountId` en posts, métricas y destinos | Espacios de trabajo por cuenta; solo destinos por cuenta | El dueño pidió analítica por cuenta y comparar cuentas; los espacios duplican panel y login; «solo destinos» deja vivo el archivado cruzado |
| `network` se conserva en cada tabla como dato derivado | Sacarlo y derivarlo por join | Los filtros por red del panel, la API y la app siguen siendo útiles como filtro grueso, y evitar el join en cada consulta vale más que la normalización |
| Migración en tres pasos con backfill | Migrar en un push | El repo no lleva archivos de migración (`db:push`); una columna NOT NULL sin backfill rompe el push. Hoy hay exactamente una cuenta por red, así que el backfill es determinista |
| El tag de la primera cuenta de cada red no cambia; las siguientes llevan `<prefijo>-<handle corto>-<id>` | Un ordinal por cuenta; el id externo de la cuenta en el tag | El ordinal es inestable; el id externo es largo y opaco en un link que se pega a mano. El handle corto es legible y determinista |
| Conectar suma; reconectar la misma cuenta renueva su token | Mantener el guard que rechaza otra cuenta | El guard existía porque el archivado corría por red. Con el archivado por cuenta, una cuenta nueva no toca el catálogo de otra |
| Pantalla de selección de candidatas en el panel | Variables `INSTAGRAM_IG_USER_ID` y `FACEBOOK_PAGE_ID` | Una variable elige una sola; con varias cuentas hay que elegir varias y la lista cambia con el tiempo |
| El token del login viaja en una cookie cifrada de diez minutos hasta que se eligen las candidatas | Tabla de conexiones pendientes | Un login que no termina no deja rastro; una cookie muere sola |
| Pestaña Cuentas nueva | Tarjetas dentro de Contenido | El dueño la pidió; Contenido queda como la tabla de posts |
| `redes` sigue valiendo cuando la red tiene una cuenta; `destinos` nombra la cuenta por handle | Reemplazar `redes` por ids de cuenta | El editor-LLM ya usa `redes`; romperlo obliga a reescribir integraciones. El handle es legible para el editor y para el dueño |
| Por red con varias cuentas y sin `destinos`, la fila se rechaza | Publicar en todas las cuentas de la red | Publicar por accidente en cinco páginas es peor que rechazar una fila con una frase clara |
| La app entra en la primera versión | Después | Son cambios de JS que llegan por aire; dejar la app publicando «a la primera cuenta» sería un comportamiento escondido |
| YouTube por variables de entorno se conserva como cuenta de solo lectura | Retirarlo | Es como se leen métricas hoy sin OAuth; pasa a identificarse por (red, id de canal) como cualquier otra |

## 1. Datos

### Esquema

`social_accounts`:
- Se quita `unique(network)`.
- Entra `unique(network, external_id)`.
- Sin columnas nuevas: `id`, `network`, `handle`, `external_id`, tokens, fechas y
  `last_sync_error` ya son por fila.

Tres tablas ganan `account_id uuid NOT NULL REFERENCES social_accounts(id)`:

| Tabla | Clave única hoy | Clave única nueva |
|---|---|---|
| `social_posts` | `(network, external_id)` | `(account_id, external_id)` |
| `account_metrics` | `(network, day)` | `(account_id, day)` |
| `scheduled_post_targets` | `(post_id, network)` | `(post_id, account_id)` |

`network` se queda en las tres. `visits.referrer_network` no cambia: es el origen del
tráfico, no una cuenta.

### Migración

1. `db:push` con `account_id` **opcional** y las claves únicas nuevas agregadas (las
   viejas siguen).
2. `npm run cuentas:backfill` (`scripts/backfill-cuentas.ts`): para cada tabla, asigna
   a cada fila el `id` de la única fila de `social_accounts` con su `network`. Si una
   red tiene cero o más de una cuenta, el script se detiene y lo dice; no adivina.
   Termina imprimiendo cuántas filas quedaron sin cuenta (debe ser cero).
3. `db:push` con `account_id` **obligatorio**, sin las claves únicas viejas y sin
   `unique(network)` en `social_accounts`.

El orden «código primero, datos después» que impuso R2 aplica igual: el código de la
entrega 1 tolera `account_id` nulo hasta el paso 3.

## 2. Tag de campaña

`campaignTagFor(account, externalId)`:
- La cuenta **primaria** de una red es la más antigua (`created_at` menor). Su tag es el
  de hoy: `fb-<externalId>`.
- Cualquier otra cuenta: `fb-<handle corto>-<externalId>`, con handle corto = primeros
  ocho caracteres de `normalizeCampaignTag(handle sin @)`. Sin handle, los primeros
  ocho del id externo de la cuenta.
- El presupuesto sigue siendo 48 caracteres y `disambiguatedCampaignTag` sigue
  resolviendo colisiones con el sufijo hash.

Los tags ya guardados no se recalculan nunca.

## 3. Conectar varias cuentas

### El login

`/api/social/[network]/connect` no cambia de forma. El callback cambia de política:

1. Obtiene la credencial y las **candidatas**: páginas de Facebook, cuentas de
   Instagram, canales de YouTube (`channels.list?mine=true` completo, ya no `items[0]`).
   Threads, X y TikTok entregan una por autorización.
2. Una candidata: se conecta directo. Si ya existe una fila con ese `(network,
   external_id)`, se actualiza el token; si no, se crea. `mayConnectAccount` desaparece.
3. Varias candidatas: el callback guarda en una cookie `conexion-pendiente` (httpOnly,
   cifrada con la misma capa que los tokens, diez minutos) el token largo y la lista
   de candidatas, y redirige a `/admin/accounts/elegir?red=<red>`.

### La selección

`/admin/accounts/elegir` lee la cookie, muestra las candidatas con casillas (nombre,
handle, y «ya conectada» cuando la fila existe) y un botón «Conectar». La server action
crea o actualiza una fila por candidata elegida, borra la cookie y vuelve a Cuentas con
«N cuentas conectadas». Cookie ausente o vencida: «El login venció. Vuelve a conectar.»

Para Facebook, el token de cada página sale de `me/accounts` (ya viene en la lista);
para Instagram, el token de usuario sirve para todas.

### Desconectar

`disconnectAccount(accountId)` reemplaza a `disconnectNetwork(network)`. Borra las
credenciales de esa fila y nada más.

### Variables que se retiran

`INSTAGRAM_IG_USER_ID` y `FACEBOOK_PAGE_ID`. El README las quita y describe la pantalla
de selección.

## 4. Pestaña Cuentas

`/admin/accounts`, en la barra entre Contenido y Calendario. Por cada red, un bloque
con su nombre, el botón «Agregar cuenta» (que abre el login de esa red) y una tarjeta
por cuenta:

- handle o id externo, fecha de última sincronización, y el estado: **conectada**
  (verde), **con error** (rojo, con `last_sync_error`), **desconectada** (gris, sin
  credenciales).
- botones Reconectar (abre el login) y Desconectar.

Contenido pierde el bloque de conexiones; «Sincronizar ahora» se muda a Cuentas.

## 5. Sincronización

- `syncAll` itera **cuentas** (todas las filas con credencial), no conectores.
  `syncAccount(account)` reemplaza a `syncNetwork(network)`; el conector se busca por
  `account.network`.
- Posts: upsert por `(account_id, external_id)`; `known` y `gone` filtran por
  `account_id`.
- Métricas de cuenta: por `account_id` y día.
- `last_sync_error` y `last_synced_at` por cuenta.
- Los conectores no cambian: ya reciben la cuenta entera.

## 6. Publicar por cuenta

### Destinos

`scheduled_post_targets.account_id` es la cuenta de destino. `run.ts` resuelve token e
id externo desde esa fila, no desde la red. `diffTargets` compara por `account_id`.

### Compositor y editor web

Una casilla por cuenta conectada con credencial, agrupadas por red, rotuladas
`Facebook · Vicente Pareja`. La primera cuenta de Instagram viene marcada, como hoy.

### El lote y la app

`BatchItem` gana `destinos?: Array<{ red: string; cuenta: string }>`; `redes` sigue.
Resolución, en `resolverDestinos(item, cuentas)` puro:

- Cada red en `redes` con **una** cuenta conectada → esa cuenta.
- Cada red en `redes` con **varias** → `Facebook tiene varias cuentas conectadas: indica
  cuál en destinos.`
- Cada `{ red, cuenta }` en `destinos`: el handle se compara sin `@` y sin distinguir
  mayúsculas contra las cuentas de esa red; desconocido → `Cuenta desconocida en
  facebook: @x.`
- Red sin ninguna cuenta con credencial → `No hay una cuenta de facebook conectada.`
- Repetidos entre `redes` y `destinos` se funden.

Las rutas móviles `schedule/check` y `schedule` aceptan `destinos` con la misma
resolución; la app manda `destinos` siempre.

### Lo que devuelve la API

`GET /api/schedule/posts` y las rutas móviles de calendario agregan `cuenta` (handle)
a cada entrada de `redes`. La guía del editor documenta `destinos`, las tres frases
nuevas y el campo `cuenta`.

## 7. Analítica por cuenta

- `getPostRows` y `getKpis` filtran opcionalmente por cuenta; cada fila lleva
  `accountId` y `handle`.
- Panel: en Analítica, una tarjeta de cuenta por cuenta (red como subetiqueta) y las
  series por cuenta; en Contenido, chips por cuenta dentro de cada red cuando hay más
  de una.
- `GET /api/metrics/posts`: cada post gana `cuenta`; filtro `?cuenta=@handle` (con o
  sin `@`); `?red=` sigue como filtro grueso.
- Rutas móviles `overview`, `posts`, `accounts`: sumas y tarjetas por cuenta; el mapa
  «último por red» del resumen pasa a ser por cuenta antes de sumar.

## 8. La app

- **Publicar**: por cada red, un botón por cuenta (`Facebook · Vicente Pareja`); manda
  `destinos`. La primera cuenta de Instagram viene marcada.
- **Cuentas**: una tarjeta por cuenta, agrupadas por red.
- **Contenido**: chips por cuenta cuando una red tiene más de una; el detalle muestra
  el handle.
- Solo JS: sale con `eas update --channel preview`, sin APK nuevo.

## Manejo de errores

Frases fijas, como siempre. Nuevas:

| Dónde | Frase |
|---|---|
| lote, móvil | `Facebook tiene varias cuentas conectadas: indica cuál en destinos.` (con el nombre de la red) |
| lote, móvil | `Cuenta desconocida en facebook: @x.` |
| lote, móvil | `No hay una cuenta de facebook conectada.` |
| selección | `El login venció. Vuelve a conectar.` |
| backfill | `La red facebook tiene 2 cuentas; el backfill necesita exactamente una.` |

## Testing

- **Puro, con Vitest**: `campaignTagFor` con cuenta primaria y secundaria; `resolverDestinos`
  en todos sus caminos; `postsToArchive` sigue igual pero el llamador filtra por cuenta
  (test del filtro); la partición de candidatas en el callback; el parseo de la cookie
  de conexión pendiente; los agrupadores por cuenta del panel y de las rutas móviles.
- **Backfill**: el script se prueba contra la base local con `db:push` sobre una rama
  de Neon antes de producción.
- Sin tests de HTTP ni de render, como el resto.

## Las cinco entregas

| # | Entrega | Qué toca | Visible |
|---|---|---|---|
| 1 | Cuenta como entidad | esquema, backfill, sync y archivado por cuenta, tag, upsert del callback por (red, id) | nada |
| 2 | Conectar varias | candidatas, cookie, pantalla de selección, agregar y desconectar por cuenta, pestaña Cuentas, README | pestaña Cuentas |
| 3 | Publicar por cuenta | destinos, runner, compositor y editor, `destinos` en lote y móvil, calendario, guía del editor | casillas por cuenta |
| 4 | Analítica por cuenta | posts y KPIs por cuenta, panel, API de métricas, rutas móviles | tarjetas y chips por cuenta |
| 5 | App | Publicar, Cuentas y Contenido por cuenta | por aire |

Cada entrega es un plan y un PR, en ese orden; la 3 depende de la 2 (sin cuentas
múltiples no hay a quién elegir) y la 4 y la 5 de la 3.

## Variables de entorno

Se retiran `INSTAGRAM_IG_USER_ID` y `FACEBOOK_PAGE_ID` en la entrega 2. Ninguna nueva.
