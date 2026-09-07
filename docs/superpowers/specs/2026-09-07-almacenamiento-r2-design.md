# Almacenamiento en Cloudflare R2 — 10 GB, una capa, y un barrido que cierra la fuga

Fecha: 2026-09-07
Estado: aprobado, pendiente de plan de implementación

Se apoya en el calendario de publicación y en la carga masiva: la media que hoy vive
en Vercel Blob es la que producen el compositor, el editor y `scheduleBatch`.

## Problema

El almacén está lleno y no es un descuido: es el tamaño del trabajo.

Medición del 2026-09-07 sobre el Blob de producción (`list()` paginado completo):

| | archivos | tamaño |
|---|---|---|
| **videos** | 26 | **1.286 MB (98,7 %)** |
| imágenes | 71 | 16,8 MB |
| **total** | **97** | **1.302 MB** |

El plan gratis de Vercel Blob son 1 GB. Ya está excedido.

Cruzando los blobs contra la base de datos:

- **1.167 MB en 23 videos con destinos todos en `scheduled`.** No es basura: es la
  cola de publicación. Con ~50 MB por video, **veinte posts encolados llenan el giga**
  aunque no quede un solo archivo muerto. Ninguna limpieza arregla esto.
- **135 MB en 74 blobs huérfanos** — sin ninguna fila que los referencie. Son fuga
  real, y su origen está identificado (ver «La fuga»).

Las imágenes ya están bien: mediana de 216 KB, p90 de 292 KB. No hay nada que ganar ahí.

Dato del camino, que orienta el diseño: los quince videos más pesados tienen la forma
`scheduled/<uuid>.mp4`, sin nombre de archivo. Ese patrón solo lo produce `mediaToBlob`
(`src/lib/social/publish/batch.ts:180`). Los videos entran por **el lote CSV desde URLs**,
descargados en el servidor — no subidos desde el navegador.

## Objetivo

Multiplicar por diez la capacidad y dejar de perder espacio, sin costo mensual nuevo:

1. Mover el almacén a **Cloudflare R2** — plan gratis de 10 GB, egress $0. La cuenta
   ya existe y hoy usa 1,83 GB de esos 10.
2. **Un barrido diario** que borra lo que ya no referencia nadie, para que la fuga no
   vuelva por un camino que alguien olvide instrumentar.

## No objetivos

- **Comprimir o transcodificar video.** Con ~8 GB libres no compra nada, y degradaría
  lo que se publica. Se reconsidera si el bucket vuelve a apretar.
- **Subida directa con URL prefirmada.** El camino pesado (descarga en el servidor
  desde una URL) no pasa por el navegador; la subida por función hoy funciona.
- **Borrar las imágenes ya publicadas.** Son el 1,3 % del problema y `calendar.tsx:98`
  las usa como miniatura del post. `mediaParaBorrar` sigue borrando solo videos.
- **Almacén doble o bandera de rollback.** La migración es de una vez y reversible por
  el mismo script; una capa de compatibilidad permanente es complejidad sin comprador.
- **Tocar `cortos-verticales`.** Bucket aparte, por lo que dice la tabla de decisiones.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Cloudflare R2 | Pagar Vercel Blob; comprimir en el navegador | 10 GB gratis con egress $0 es el 10x exacto y sin cuota mensual; la cuenta ya existe |
| Bucket nuevo `portafolio-media` | Reusar `cortos-verticales` | El barrido borra lo que no está en la base de datos: los 31 archivos puestos a mano *son* huérfanos para él. Un bucket aparte hace ese error imposible por construcción, no por cuidado |
| Dominio propio de Cloudflare | Subdominio `pub-xxx.r2.dev` | Cloudflare limita r2.dev a propósito y desaconseja producción; además Meta descarga la media desde esa URL |
| URL pública compuesta por nosotros (`${R2_PUBLIC_BASE}/${key}`) | Usar la que devuelva el SDK | El SDK de S3 no devuelve URL pública; componerla deja el dominio propio como única cara del bucket y hace trivial derivar la key de vuelta |
| Una capa `src/lib/storage.ts` | Llamadas S3 en línea en cada sitio | El barrido necesita `listar()`, y hoy nadie sabe enumerar el almacén; además la lógica de key y content-type dejaría de repetirse en cuatro lugares |
| `@aws-sdk/client-s3` | `@vercel/blob`; cliente HTTP propio firmando SigV4 | R2 habla S3; firmar SigV4 a mano es criptografía que no hay por qué escribir |
| Barrido al final del cron de publicación | Un cron nuevo; llamar a `borrar()` en cada sitio | Hobby permite dos crons y ya están los dos usados. Una regla («si nadie te referencia, te vas») cierra la fuga entera, incluidos los caminos futuros que olviden borrar |
| Ventana de gracia de 1 hora en el barrido | Barrer todo lo no referenciado | Entre el `put()` y el `insert()` hay una ventana real; sin gracia el barrido puede matar un archivo cuya fila todavía no se escribió |
| Migrar los 23 videos vivos; borrar los 74 huérfanos | Migrar todo; migrar nada | Los huérfanos no los referencia nadie: copiarlos sería mudar la basura |
| Variables leídas con `env()` | `process.env` directo | `env()` (`src/lib/env.ts`) limpia el BOM que PowerShell le mete a un secreto al cargarlo, y un secreto S3 con BOM falla la firma sin decir por qué |

## La capa: `src/lib/storage.ts`

Tres funciones, y son toda la superficie pública:

```ts
guardar(key: string, body: Blob | Buffer, contentType: string): Promise<string>  // → url pública
borrar(url: string): Promise<void>
listar(): Promise<Array<{ key: string; url: string; size: number; uploadedAt: Date }>>
```

- **`guardar`** hace `PutObjectCommand` contra el bucket y devuelve
  `${R2_PUBLIC_BASE}/${key}`. Las keys no cambian de forma: siguen siendo
  `scheduled/<uuid>-<nombre>`, `scheduled/<uuid>.<ext>`, `uploads/<uuid>-<nombre>`.
- **`borrar`** deriva la key quitando el prefijo `R2_PUBLIC_BASE`. Si la URL no
  empieza con ese prefijo (una URL de red social, una vieja de Vercel Blob que
  sobrevivió a la migración) **no hace nada y lo registra** — nunca lanza. Esto
  preserva el contrato actual de `limpiarMedia`, que falla en silencio a propósito.
- **`listar`** pagina con `ListObjectsV2Command` hasta agotar el bucket.

Sin cliente ni credenciales, `guardar` lanza con la misma frase que hoy da
`BLOB_READ_WRITE_TOKEN` ausente, para que el panel siga diciendo lo mismo.

### Sitios que cambian

| Archivo | Hoy | Queda |
|---|---|---|
| `src/app/admin/actions.ts:299` | `put()` — imagen de perfil/link | `guardar()` |
| `src/app/admin/actions.ts:428` | `put()` — media al crear post | `guardar()` |
| `src/app/admin/actions.ts:561` | `put()` — media al editar post | `guardar()` |
| `src/lib/social/publish/batch.ts:180` | `put()` — media descargada del lote | `guardar()` |
| `src/lib/social/publish/run.ts:118` | `del()` | `borrar()` |

`@vercel/blob` sale del `package.json`. Entra `@aws-sdk/client-s3`.

### Configuración

Cinco variables nuevas, todas por `env()`:

| Variable | Ejemplo |
|---|---|
| `R2_ACCOUNT_ID` | el Account ID de la cuenta de R2 |
| `R2_ACCESS_KEY_ID` | del token de API, con permiso solo sobre `portafolio-media` |
| `R2_SECRET_ACCESS_KEY` | ídem |
| `R2_BUCKET` | `portafolio-media` |
| `R2_PUBLIC_BASE` | `https://media.<tu-dominio>` (sin barra final) |

`BLOB_READ_WRITE_TOKEN` se conserva hasta que la migración termine y se retira después.

`next.config.ts` agrega el host de `R2_PUBLIC_BASE` a `images.remotePatterns` y retira
los dos de `blob.vercel-storage.com`. No es opcional: `profile-view.tsx:120` pasa por
el optimizador de imágenes (los demás usos son `unoptimized`), y sin el patrón el
avatar del perfil público deja de renderizar.

Las variables se cargan a Vercel **desde Bash con `printf`**, no con un pipe de
PowerShell: el pipe le antepone un BOM al valor y el secreto llega corrupto sin error
visible.

## La migración: `scripts/migrate-blobs.ts`

Cinco columnas pueden guardar una URL nuestra:

| Tabla | Columna |
|---|---|
| `profiles` | `avatar_url` |
| `profiles` | `og_image_url` |
| `links` | `image_url` |
| `scheduled_posts` | `cover_url` |
| `scheduled_post_media` | `blob_url` |

(`social_posts.thumbnail_url` **no** entra: es de la red, no nuestra.)

Por cada valor que apunte a `*.blob.vercel-storage.com`, en orden:

1. Descargar de Vercel Blob.
2. `guardar()` en R2 con **la misma key** (el pathname del blob).
3. Reescribir la columna con la URL nueva.
4. Borrar el blob de Vercel.

Idempotente: una URL que ya apunta a `R2_PUBLIC_BASE` se salta. Si el paso 2 o 3
falla, el blob de Vercel **no se borra** y la fila queda apuntando a donde el archivo
todavía está — reintentable sin pérdida.

Acepta `--dry-run` (imprime el plan, no escribe nada) y es lo primero que se corre.

**El orden importa y es: desplegar primero, migrar después.** Con el código nuevo ya
en producción, todo lo que se escriba desde ese momento nace en R2 y la migración
tiene un blanco que deja de moverse. Al revés —migrar y luego desplegar— el código
viejo sigue escribiendo en Vercel Blob durante la ventana y hay que migrar dos veces.
El costo de este orden es que, entre el despliegue y la migración, `borrar()` no-opea
sobre las URLs viejas; eso no pierde nada, porque el paso final del script barre
exactamente esos huérfanos.

Al final, los blobs de Vercel que no quedaron referenciados por ninguna columna —los
74 huérfanos, 135 MB— se borran sin copiarse. El script los lista aparte y pide
confirmación explícita antes de borrarlos.

## La fuga y el barrido

Hoy hay dos agujeros, y ninguno se cierra solo:

- `deleteScheduledPost` (`src/app/admin/actions.ts:717`) borra el post; el
  `on delete cascade` borra las filas de `scheduled_post_media`; **el archivo se queda**.
- `diffMedia` (`src/lib/social/publish/edit.ts:54`) devuelve `deleteIds` de filas;
  **quitar una media en el editor nunca borra su archivo**.

Parchear los dos sitios los cierra hoy y deja abierto cualquier camino futuro que
olvide llamar a `borrar()`. En su lugar, una regla:

`barrerHuerfanos()` en `src/lib/storage-gc.ts`:

1. `listar()` el bucket.
2. Leer las cinco columnas y armar el conjunto de URLs referenciadas.
3. Borrar todo objeto que **no esté referenciado** y lleve **más de una hora** subido.
4. Devolver `{ borrados, bytes }` para el reporte del cron.

Se llama al final de `GET /api/cron/publish-social`, después de `publishDue()`, dentro
de su propio `try/catch`: un barrido que falla no puede ensuciar una publicación que
funcionó. El resultado entra en el JSON del reporte.

Costo: una operación Class A diaria sobre ~100 objetos, contra un millón gratis al mes.

`mediaParaBorrar` **no cambia**: la limpieza inmediata tras publicar sigue liberando el
video en el momento, y el barrido es la red debajo.

## Pruebas

Unitarias, vitest, como el resto del repo — puras, sin tocar la red:

- **key ↔ URL**: `guardar` compone la URL esperada; `borrar` deriva la key de vuelta;
  ida y vuelta para keys con espacios y acentos en el nombre del archivo.
- **`borrar` con URL ajena**: una URL de `cdninstagram.com` y una de Vercel Blob no
  lanzan y no emiten `DeleteObjectCommand`.
- **`barrerHuerfanos`** (con la decisión extraída a una función pura que recibe los
  objetos y el conjunto referenciado): no toca lo referenciado; no toca lo subido hace
  menos de una hora aunque esté huérfano; sí borra lo huérfano y viejo; con el conjunto
  referenciado vacío por un fallo de lectura, **no borra nada** (no confundir «no pude
  leer» con «no hay nada que referencie»).
- **Migración**: el planificador puro que decide qué migrar, qué saltar (ya en R2) y
  qué borrar como huérfano.

Verificación real, en este orden:

1. `--dry-run` de la migración contra el bucket y la base de datos de producción.
2. Migración real; `scripts/blob-audit.ts` antes y después (el que se escribió para el
   diagnóstico; se incorpora al repo).
3. Un post de prueba con video: encolar por CSV, publicar, confirmar que Meta lo
   descargó desde el dominio propio y que `limpiarMedia` liberó el archivo.
4. `npm run test`, `npm run lint`, `npm run typecheck`.

## Preparación manual (del dueño, antes de la migración)

1. Crear el bucket `portafolio-media` en R2.
2. Conectarle un subdominio del dominio que ya administra en Cloudflare.
3. Emitir un token de API de R2 con lectura/escritura **solo sobre ese bucket**.
4. Cargar las cinco variables en Vercel (Production y Preview) y en `.env.local`.

## Resultado esperado

De 1.302 MB apretados contra un tope de 1 GB, a ~1.167 MB en un bucket de 10 GB que
hoy usa 1,83 GB — con ~7 GB de margen y un barrido diario que impide que la cola
vuelva a crecer sin control.
