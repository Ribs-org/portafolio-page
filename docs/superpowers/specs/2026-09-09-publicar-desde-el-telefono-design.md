# Publicar desde el teléfono — la app deja de ser solo lectura

Fecha: 2026-09-09
Estado: aprobado, pendiente de plan de implementación

Segundo proyecto de la app Android. Se apoya en la versión 1 (`2026-09-04-app-android-design.md`,
las cinco rutas `/api/mobile/*`, la sesión por token) y en el almacén de R2
(`2026-09-07-almacenamiento-r2-design.md`, la capa `src/lib/storage.ts` y el barrido de
huérfanos). Nace de la rama `almacen-r2` porque necesita esa capa; el PR #62 debe
fusionarse antes que este.

## Problema

El teléfono es donde se edita el video y donde el dueño está cuando decide publicarlo.
Hoy ese video tiene que viajar al computador, o a Google Drive para que el lote lo
descargue, antes de entrar al calendario. La app ya sabe mostrar el calendario; no sabe
alimentarlo.

## Objetivo

Una quinta pestaña, **Publicar**, que arma un post con lo mismo que pide el compositor
web —texto, fotos o video de la galería, redes y fecha— y lo deja programado, o lo
manda a salir en los próximos minutos. Los videos son los que produce el teléfono:
**de 100 a 200 MB**, y la subida tiene que aguantarlos con progreso visible.

## No objetivos

- **Portada y atributos.** Siguen entrando por el panel o por el lote del editor-LLM.
  El compositor web tampoco los pide.
- **Editar o borrar lo programado.** Sigue siendo del panel.
- **Grabar dentro de la app.** Se elige de la galería; la cámara del teléfono ya graba.
- **Notificaciones push.** Sigue fuera.
- **Publicar en TikTok.** No hay publisher; la red no aparece como opción.
- **Comprimir video en el teléfono.** El almacén tiene 10 GB y la subida directa no
  pasa por memoria de nadie; comprimir degradaría lo que se publica.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Subida directa a R2 con URL firmada | Multipart al servidor reusando `guardar()` | Vercel corta el cuerpo en 100 MB y `guardar` carga el archivo entero en memoria; los videos del teléfono pasan de 100 MB. La subida directa no tiene tope práctico (5 GB por PUT) ni pasa por la función |
| Sin CORS en el bucket | Configurar CORS en R2 | El `fetch` nativo de Android no aplica la política de mismo origen; solo un navegador la exige. Nada que tocar en Cloudflare |
| Un chequeo del borrador antes de subir | Validar solo al crear | Rechazar «X no recibe video» después de subir 200 MB es tirar el tráfico del usuario. El chequeo cuesta una llamada de un kilobyte |
| Las reglas viven solo en el servidor | Copiar `validateScheduleDraft` a la app | Dos copias derivan. La app solo impide mandar un formulario vacío; toda otra frase la dice el servidor, y es la misma del compositor |
| `POST /api/mobile/schedule` propio | Reusar `/api/schedule/batch` | El lote exige `SCHEDULE_API_KEY` y vuelve a descargar y resubir cada URL. El teléfono no debe cargar la llave del editor-LLM ni pagar el video dos veces |
| El servidor confirma con un HEAD que cada archivo existe | Confiar en la app | Un post que referencia un archivo que nunca terminó de subir falla en el publisher con un error confuso y tres reintentos. Un HEAD cuesta milisegundos |
| Un helper compartido para insertar el post | Copiar las tres inserciones del compositor | El compositor web y la ruta móvil deben escribir exactamente lo mismo; hoy la inserción vive en línea en la server action |
| «Publicar ahora» = programar un minuto adelante | Un camino de publicación síncrono | El pinger de cron-job.org corre cada cinco minutos; el motor no cambia y no hay un segundo camino que mantener |
| Quinta pestaña, al centro | Botón flotante en Calendario | El dueño la pidió como pestaña; al centro queda bajo el pulgar |
| Selector nativo de fecha y hora | Campo de texto `YYYY-MM-DD HH:MM` | Escribir fechas en el teléfono es el error garantizado |
| expo-updates entra ahora | Dejarlo para después | El APK se reconstruye igual por los módulos nativos nuevos; después de este build los cambios de JS llegan por aire, que es lo que la versión 1 prometió |
| Archivos huérfanos: el barrido existente | Borrar al cancelar | Un archivo subido cuyo post nunca se creó es exactamente lo que el barrido diario ya borra tras una hora de gracia. Cero código nuevo |

## Arquitectura

```
portafolio-page/
├─ src/
│  ├─ lib/storage.ts                    + urlParaSubir(), existe()
│  ├─ lib/social/publish/crear.ts       crearPostProgramado(), compartido
│  └─ app/api/mobile/
│     ├─ schedule/route.ts              GET (existente) + POST (crear)
│     ├─ schedule/check/route.ts        POST (validar el borrador)
│     └─ upload-url/route.ts            POST (firmar una subida)
└─ mobile/
   ├─ src/app/(tabs)/publicar.tsx       la pantalla
   ├─ src/lib/publicar.ts               lo puro: tipo de archivo, reductor de pasos
   ├─ src/lib/subir.ts                  las llamadas: pedir URL, PUT, crear
   └─ src/components/                   miniatura con equis, chip de red
```

## La API

Las tres rutas exigen `Authorization: Bearer <token móvil>`; sin él, 401 con el cuerpo
`No autorizado`. Los errores de forma son 400 con `{ error }` en frase fija. Ninguna
recalcula reglas: `validateScheduleDraft` es la única fuente.

### `POST /api/mobile/schedule/check`

Entrada: el borrador sin archivos, solo cuántos hay.

```json
{ "texto": "…", "redes": ["instagram", "youtube"], "cuando": "2026-09-10T22:00:00.000Z", "ahora": false, "fotos": 0, "videos": 1 }
```

Salida: `200 { "ok": true }`, o `400 { "error": "<frase de validateScheduleDraft>" }`.
`cuando` es un instante ISO; el teléfono ya sabe su hora local y mandar el instante
evita reinterpretar horas de pared. Con `ahora: true`, `cuando` se ignora.

### `POST /api/mobile/upload-url`

Entrada: `{ "nombre": "VID_20260909.mp4", "tipo": "video/mp4", "bytes": 148000000 }`.

Reglas:
- `tipo` debe resolverse por `typeFromContentType` a imagen o video; otra cosa:
  `Ese tipo de archivo no se puede publicar.`
- `bytes` sobre **500 MB**: `El archivo supera los 500 MB.`
- Sin R2 configurado: 500 con `{ error: SIN_ALMACEN }`, la misma frase del panel.

La key es `scheduled/<uuid>-<nombre saneado>`: solo el nombre base, sin separadores de
ruta, recortado a 100 caracteres, y con la extensión que dicta `tipo` si el nombre no
trae una. Mismo prefijo que el compositor y el lote, para que el barrido no distinga.

Salida:

```json
{ "subir": "https://<cuenta>.r2.cloudflarestorage.com/…?X-Amz-Signature=…", "publica": "https://media.<dominio>/scheduled/…", "mediaType": "video" }
```

`subir` es un PUT firmado por **una hora**, con `Content-Type` y
`Cache-Control: public, max-age=31536000, immutable` dentro de la firma: el teléfono
manda ambas cabeceras tal cual o R2 responde 403. Así el objeto queda igual que uno
subido por `guardar()`.

### `POST /api/mobile/schedule`

Entrada: el borrador con las URLs públicas ya subidas, en el orden del carrusel.

```json
{ "texto": "…", "redes": ["instagram"], "cuando": null, "ahora": true, "media": [{ "url": "https://media.<dominio>/scheduled/…", "mediaType": "video" }] }
```

Orden de comprobación:
1. Cada `url` debe ser del almacén propio (`keyDesdeUrl(basePublica(), url)`) y su key
   empezar con `scheduled/`. Si no: `Un archivo no es del almacén.` Esto es lo que
   impide que un cuerpo forjado apunte a cualquier URL de internet.
2. Cada objeto debe existir (`existe(url)`, un HEAD). Si no: `Falta subir un archivo.`
3. `cuando`: `ahora` lo fija en el instante actual más 60 s; si no, `new Date(cuando)`
   y una fecha ilegible da `La fecha no se entendió.`
4. `validateScheduleDraft` con los conteos de `media` y `now`.
5. `crearPostProgramado` escribe `scheduled_posts`, `scheduled_post_media` y
   `scheduled_post_targets`. Un fallo de base: `No se pudo guardar. Intenta de nuevo.`

Salida: `200 { "id": "<uuid>", "cuando": "2026-09-10T19:00:00-03:00" }`, con `cuando`
en hora de Chile como el resto de las lecturas móviles.

### Lo que cambia en el sitio

| Archivo | Cambio |
|---|---|
| `src/lib/storage.ts` | `urlParaSubir(key, contentType)` → `{ subir, publica }` con `getSignedUrl` de `@aws-sdk/s3-request-presigner`; `existe(url)` → HEAD, `false` ante URL ajena o `NotFound` |
| `src/lib/social/publish/crear.ts` | `crearPostProgramado({ caption, scheduledAt, media, networks })` → `id`. Las tres inserciones que hoy viven en `createScheduledPost` |
| `src/app/admin/actions.ts` | `createScheduledPost` pasa a llamar al helper; nada más cambia |
| `src/lib/mobile-api.ts` | lo puro de las rutas nuevas: `keyParaSubida(nombre, tipo)`, `parseBorradorMovil(body)` y `resolverCuando(ahora, cuando, now)` |
| `package.json` | entra `@aws-sdk/s3-request-presigner` |

## La app

### Dependencias nuevas

| Paquete | Para qué | Nativo |
|---|---|---|
| `expo-image-picker` | elegir fotos y videos de la galería, hasta diez | sí |
| `expo-file-system` | `File.upload` con `httpMethod: 'PUT'`, cabeceras, progreso y cancelación, leyendo desde disco | sí |
| `@react-native-community/datetimepicker` | fecha y hora nativas de Android, en dos pasos | sí |
| `expo-updates` | actualizaciones por aire desde este build en adelante | sí |

Los cuatro obligan a reconstruir el APK. Es el último build a mano que este proyecto
prevé: los siguientes cambios de JS viajan con `eas update`.

### La pantalla «Publicar»

Quinta pestaña, al centro: Resumen · Contenido · **Publicar** · Cuentas · Calendario.
Una sola pantalla, con scroll:

1. **Texto.** Multilínea, contador `n / 2200`, y bajo el campo la nota «En YouTube el
   primer renglón es el título».
2. **Archivos.** Botón «Fotos o video» que abre la galería (`mediaTypes: ['images',
   'videos']`, selección múltiple, tope diez). Debajo, una fila de miniaturas con una
   equis para quitar cada una. El orden de selección es el del carrusel.
3. **Redes.** Chips de las cinco que publican, Instagram marcada por defecto. TikTok no
   aparece.
4. **Cuándo.** Un botón que muestra la fecha y hora elegidas y abre el selector nativo;
   por defecto, la próxima hora en punto.
5. **Acciones.** «Programar» y «Publicar ahora». El segundo abre una confirmación:
   «¿Publicar ahora en Instagram y YouTube? Saldrá en los próximos 5 minutos.»

La app solo impide el envío cuando no hay texto ni archivos; toda otra regla la dice el
servidor con su frase.

### El envío

Un reductor puro en `lib/publicar.ts` gobierna los pasos; la pantalla solo los dibuja:

```
listo → chequeando → subiendo (archivo i de n, progreso) → creando → hecho
                  ↘ error (frase, y desde qué paso, para reintentar)
```

- **Chequeando:** `POST /schedule/check` con los conteos. Un 400 vuelve a `listo` con la
  frase bajo los botones; nada se subió.
- **Subiendo:** por archivo, `POST /upload-url` y luego `File.upload` al PUT firmado con
  las dos cabeceras. La barra muestra `bytesSent / totalBytes`. Un fallo deja el estado
  en `error` con «No se pudo subir el archivo. Revisa tu señal.» y un botón «Reintentar»
  que retoma **desde ese archivo**: los ya subidos conservan su URL pública y la firmada
  de este sigue valiendo una hora.
- **Creando:** `POST /schedule` con las URLs. Un 400 muestra la frase; los archivos
  quedan en R2 hasta que el barrido los borre si el usuario desiste.
- **Hecho:** se vacía el formulario, se borran las cachés `calendario` y `resumen`
  (ambas muestran lo programado) y la app salta a la pestaña Calendario.

Un botón «Cancelar» durante la subida aborta el PUT en curso (`AbortSignal`) y vuelve a
`listo`; lo ya subido lo recoge el barrido.

El tipo de cada archivo sale del `mimeType` que entrega el selector, y si viene vacío,
de la extensión del `fileName`, con la misma tabla que `tipoArchivo` en el sitio.
Sin ninguna de las dos, el archivo se rechaza antes de pedir URL: «Ese tipo de archivo
no se puede publicar.» El tamaño se compara contra 500 MB también en la app, con la
misma frase, para no pedir una URL que el servidor va a negar; el servidor sigue siendo
la puerta.

### Lo que cambia en las pantallas existentes

Solo Calendario: refresca al recibir foco (`useFocusEffect`) cuando su caché no es
fresca según `freshness`. Es lo que hace que, al saltar desde Publicar con la caché
recién borrada, el post nuevo aparezca sin tirar para refrescar.

`lib/cache.ts` gana `clearCache(key)`. `lib/api.ts` gana `apiPost<T>(path, token, body)`
con el mismo trato del 401 que `apiGet`.

## Manejo de errores

Frases fijas en español; el detalle técnico solo a consola. Las que agrega este proyecto:

| Dónde | Frase |
|---|---|
| upload-url, app | `Ese tipo de archivo no se puede publicar.` |
| upload-url, app | `El archivo supera los 500 MB.` |
| schedule | `Un archivo no es del almacén.` |
| schedule | `Falta subir un archivo.` |
| schedule, check | `La fecha no se entendió.` |
| schedule | `No se pudo guardar. Intenta de nuevo.` |
| app | `No se pudo subir el archivo. Revisa tu señal.` |
| app | `No se pudo conectar. Revisa tu señal.` (chequeo o creación sin red) |

Un 401 en cualquiera de las tres llamadas hace lo de siempre: borra el token y vuelve a
la contraseña.

## Testing

- **Sitio** (Vitest en la raíz): la key a partir del nombre (`keyParaSubida`: basename,
  recorte, extensión por tipo); `parseBorradorMovil` (cuerpos buenos, malos, redes
  repetidas, media sin `mediaType`); `resolverCuando`; `existe` y `urlParaSubir` solo en
  su rama pura (URL ajena → `false`, sin R2 → lanza `SIN_ALMACEN`). Las rutas reusan
  funciones probadas; sin tests de HTTP, como el resto.
- **App** (Vitest en `mobile/`): `tipoDeArchivo` (mimeType, extensión, vacío),
  `reducirEnvio` (cada transición, el reintento desde el archivo caído, el cancelar),
  `textoConfirmacion(redes)`. Sin pruebas de render.

## Construcción e instalación

- `mobile/app.json`: `version` sube a `1.1.0`; plugin `expo-image-picker` con
  `photosPermission` en español; `runtimeVersion: { "policy": "appVersion" }`.
  `updates.url` y `extra.eas.projectId` los escribe `eas update:configure`, que exige
  la cuenta del dueño; el README lo dice.
- `mobile/eas.json`: `channel: "preview"` y `channel: "production"` en sus perfiles.
- README de la app: sección «Cómo publicar desde el teléfono», y en «Cómo generar el
  instalable» la distinción nueva: cambios de JS con
  `npx eas-cli update --channel preview --message "…"`, sin reinstalar; cambios nativos
  con el build de siempre.
- La versión 1.1.0 es un APK nuevo; la 1.0.0 instalada no recibe esta actualización
  porque su runtime no trae los módulos.

## Variables de entorno nuevas

Ninguna. La firma usa las cinco `R2_*` que ya existen.
