# Almacenamiento en Cloudflare R2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover toda la media de la app de Vercel Blob (1 GB, ya excedido) a un bucket de Cloudflare R2 (10 GB gratis), y agregar un barrido diario que borra los archivos que ya no referencia ninguna fila.

**Architecture:** Una capa fina (`src/lib/storage.ts`) con tres funciones —`guardar`, `borrar`, `listar`— sustituye a `@vercel/blob` en los cinco sitios que hoy escriben o borran archivos. La URL pública la componemos nosotros como `${R2_PUBLIC_BASE}/${key}`, lo que hace trivial derivar la key de vuelta y deja el dominio propio como única cara del bucket. Sobre `listar()` se construye `barrerHuerfanos()`, que corre al final del cron de publicación y borra todo objeto que no aparezca en las cinco columnas de URL de la base de datos y lleve más de una hora subido.

**Tech Stack:** Next.js 16 (App Router, Server Actions), `@aws-sdk/client-s3` contra la API S3 de R2, Drizzle + Neon Postgres, vitest, tsx para los scripts.

**Spec:** `docs/superpowers/specs/2026-09-07-almacenamiento-r2-design.md`

## Global Constraints

- **Todo el código, los comentarios y los mensajes de error nuevos van en español**, como el resto de `src/lib/social/`. Los commits también.
- **Las variables de entorno se leen siempre con `env()` de `src/lib/env.ts`**, nunca con `process.env` directo. `env()` limpia el BOM que PowerShell antepone al cargar un secreto, y un secreto de S3 con BOM falla la firma sin dar un error que apunte a la causa.
- **Las pruebas viven junto al código como `src/**/*.test.ts`** — es lo único que `vitest.config.ts` incluye. Nada de una carpeta `tests/` aparte.
- **Las pruebas son puras: no tocan la red ni la base de datos.** El patrón del repo (`src/lib/social/publish/publisher.test.ts`) es extraer la decisión a una función pura y probar esa.
- **Las cinco columnas que pueden guardar una URL nuestra** son `profiles.avatar_url`, `profiles.og_image_url`, `links.image_url`, `scheduled_posts.cover_url` y `scheduled_post_media.blob_url`. `social_posts.thumbnail_url` **no** entra: esa URL es de la red social, no nuestra.
- **Nombres exactos del bucket y las variables:** bucket `portafolio-media`; variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`.
- **`R2_PUBLIC_BASE` se guarda sin barra final** (`https://media.tudominio.com`), y el código igual la tolera.
- **Orden de despliegue: primero el código (tareas 1–4), después la migración (tarea 5).** Con el código nuevo en producción, todo lo que se escriba nace en R2 y la migración deja de perseguir un blanco móvil.

## Cambio respecto de la especificación

La especificación decía que el script de migración borrara los blobs de Vercel y pidiera confirmación para los 74 huérfanos. **El plan no lo hace**, y esto es deliberado:

Si el script solo copia y reescribe, nunca necesita el SDK `@vercel/blob` —lee los archivos con un `fetch()` normal, porque las URLs son públicas—. Eso permite sacar la dependencia en la tarea 2 en vez de arrastrarla, y elimina un script que borra en masa. El borrado de lo viejo pasa a ser un paso manual de una sola acción: **eliminar el store de Blob completo desde el panel de Vercel**, una vez que la consulta de verificación confirme que ninguna fila apunta ya ahí. Menos código, menos riesgo, mismo resultado.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/storage.ts` (crear) | La capa: componer/derivar URLs públicas y hablar S3 con R2. Único módulo que conoce el SDK |
| `src/lib/storage.test.ts` (crear) | Ida y vuelta key↔URL, y el rechazo de URLs ajenas |
| `src/lib/storage-gc.ts` (crear) | La decisión del barrido (pura) y su ejecución contra la base de datos |
| `src/lib/storage-gc.test.ts` (crear) | Referencias, ventana de gracia y el caso del conjunto vacío |
| `src/lib/storage-migracion.ts` (crear) | Reconocer una URL de Vercel Blob. Existe solo para la migración; se borra después |
| `src/lib/storage-migracion.test.ts` (crear) | Casos de esa función |
| `src/app/admin/actions.ts` (modificar) | Tres `put()` → `guardar()` |
| `src/lib/social/publish/batch.ts` (modificar) | Un `put()` → `guardar()` |
| `src/lib/social/publish/run.ts` (modificar) | Un `del()` → `borrar()` |
| `src/app/api/cron/publish-social/route.ts` (modificar) | Llamar al barrido tras publicar |
| `next.config.ts` (modificar) | `remotePatterns`: entra el host de R2, salen los de Vercel Blob |
| `.env.example` (modificar) | Documentar las cinco variables, retirar `BLOB_READ_WRITE_TOKEN` |
| `scripts/migrate-blobs.ts` (crear) | Copiar de Vercel Blob a R2 y reescribir las cinco columnas |
| `scripts/blob-audit.ts` (crear) | Medir el bucket: total, por carpeta, por tipo, los más pesados |

---

### Task 1: La capa de almacenamiento

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`
- Modify: `package.json` (agregar `@aws-sdk/client-s3`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `env()` de `src/lib/env.ts`.
- Produces:
  - `SIN_ALMACEN: string` — frase fija de error.
  - `type ObjetoAlmacenado = { key: string; url: string; size: number; uploadedAt: Date }`
  - `urlPublica(baseUrl: string, key: string): string`
  - `keyDesdeUrl(baseUrl: string, url: string): string | null`
  - `guardar(key: string, body: Blob | Buffer, contentType: string): Promise<string>`
  - `borrar(url: string): Promise<void>`
  - `listar(): Promise<ObjetoAlmacenado[]>`

- [ ] **Step 1: Instalar el SDK**

```bash
npm install @aws-sdk/client-s3
```

- [ ] **Step 2: Escribir la prueba que falla**

Crear `src/lib/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { keyDesdeUrl, urlPublica } from './storage'

const BASE = 'https://media.ejemplo.com'

describe('urlPublica', () => {
  it('cuelga la key de la base', () => {
    expect(urlPublica(BASE, 'scheduled/abc.mp4')).toBe('https://media.ejemplo.com/scheduled/abc.mp4')
  })

  it('tolera una base con barra final', () => {
    expect(urlPublica(`${BASE}/`, 'scheduled/abc.mp4')).toBe(
      'https://media.ejemplo.com/scheduled/abc.mp4',
    )
  })

  it('codifica cada segmento por separado, sin comerse las barras', () => {
    // Las keys llevan el nombre del archivo que subió el dueño: espacios y tildes.
    expect(urlPublica(BASE, 'uploads/uuid-mi vídeo (1).mp4')).toBe(
      'https://media.ejemplo.com/uploads/uuid-mi%20v%C3%ADdeo%20(1).mp4',
    )
  })
})

describe('keyDesdeUrl', () => {
  it('es la inversa de urlPublica, incluso con nombres raros', () => {
    const key = 'uploads/uuid-mi vídeo (1).mp4'
    expect(keyDesdeUrl(BASE, urlPublica(BASE, key))).toBe(key)
  })

  it('tolera una base con barra final', () => {
    expect(keyDesdeUrl(`${BASE}/`, `${BASE}/scheduled/abc.mp4`)).toBe('scheduled/abc.mp4')
  })

  it('ignora la query string', () => {
    expect(keyDesdeUrl(BASE, `${BASE}/scheduled/abc.mp4?v=2`)).toBe('scheduled/abc.mp4')
  })

  it('devuelve null para una URL de otro dominio', () => {
    // Es lo que hace que borrar() no toque una miniatura de Instagram ni un blob viejo.
    expect(keyDesdeUrl(BASE, 'https://scontent.cdninstagram.com/v/foto.jpg')).toBeNull()
    expect(keyDesdeUrl(BASE, 'https://abc.public.blob.vercel-storage.com/scheduled/x.mp4')).toBeNull()
  })

  it('devuelve null si la base no trae key', () => {
    expect(keyDesdeUrl(BASE, BASE)).toBeNull()
    expect(keyDesdeUrl(BASE, `${BASE}/`)).toBeNull()
  })

  it('devuelve null si el percent-encoding está roto', () => {
    expect(keyDesdeUrl(BASE, `${BASE}/scheduled/%E0%A4%A.mp4`)).toBeNull()
  })
})
```

- [ ] **Step 3: Correr la prueba y verificar que falla**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — no existe el módulo `./storage`.

- [ ] **Step 4: Escribir `src/lib/storage.ts`**

```ts
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { env } from '@/lib/env'

/** Misma forma que la frase que daba el Blob ausente: el panel sigue diciendo lo mismo. */
export const SIN_ALMACEN = 'Falta configurar Cloudflare R2 (R2_*).'

export type ObjetoAlmacenado = { key: string; url: string; size: number; uploadedAt: Date }

function sinBarra(base: string): string {
  return base.replace(/\/+$/, '')
}

/**
 * Compone la URL pública de una key. Cada segmento va codificado por separado: las
 * keys terminan en el nombre del archivo que subió el dueño —con espacios y tildes—
 * y codificar la key entera se comería las barras que separan carpeta de archivo.
 */
export function urlPublica(baseUrl: string, key: string): string {
  return `${sinBarra(baseUrl)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Inversa de `urlPublica`. Devuelve null cuando la URL no es de este almacén —una
 * miniatura de Instagram, un blob viejo de Vercel— que es exactamente el caso en que
 * `borrar` no debe tocar nada.
 */
export function keyDesdeUrl(baseUrl: string, url: string): string | null {
  const prefijo = `${sinBarra(baseUrl)}/`
  if (!url.startsWith(prefijo)) return null
  const resto = (url.slice(prefijo.length).split('?')[0] ?? '').split('#')[0] ?? ''
  if (resto === '') return null
  try {
    return resto.split('/').map(decodeURIComponent).join('/')
  } catch {
    // Percent-encoding inválido: no la compusimos nosotros.
    return null
  }
}

type Config = { bucket: string; base: string }

function config(): Config | null {
  const bucket = env('R2_BUCKET')
  const base = env('R2_PUBLIC_BASE')
  return bucket && base ? { bucket, base: sinBarra(base) } : null
}

let cliente: S3Client | null = null

function getCliente(): S3Client {
  if (cliente) return cliente
  const accountId = env('R2_ACCOUNT_ID')
  const accessKeyId = env('R2_ACCESS_KEY_ID')
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error(SIN_ALMACEN)
  cliente = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 no acepta los checksums que el SDK v3 agrega por defecto desde 3.729; sin
    // esto cada PUT vuelve con un error de firma que no menciona el checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return cliente
}

/** Sube el archivo y devuelve su URL pública. Lanza `SIN_ALMACEN` sin configuración. */
export async function guardar(key: string, body: Blob | Buffer, contentType: string): Promise<string> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  // A Buffer a propósito: el SDK necesita saber el largo, y con un stream habría que
  // calcularlo aparte. Un video de 50 MB en memoria cabe de sobra en la función.
  const cuerpo = Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer())
  await getCliente().send(
    new PutObjectCommand({ Bucket: conf.bucket, Key: key, Body: cuerpo, ContentType: contentType }),
  )
  return urlPublica(conf.base, key)
}

/**
 * Borra por URL. Una URL que no es nuestra no es un error: se registra y se ignora,
 * porque `limpiarMedia` llama a esto sobre lo que sea que tenga guardada la fila.
 */
export async function borrar(url: string): Promise<void> {
  const conf = config()
  if (!conf) return
  const key = keyDesdeUrl(conf.base, url)
  if (!key) {
    console.warn('URL ajena al almacén, no se borra:', url.slice(0, 120))
    return
  }
  await getCliente().send(new DeleteObjectCommand({ Bucket: conf.bucket, Key: key }))
}

/** Enumera el bucket entero, paginando. Lo que el barrido necesita para decidir. */
export async function listar(): Promise<ObjetoAlmacenado[]> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  const s3 = getCliente()
  const objetos: ObjetoAlmacenado[] = []
  let token: string | undefined
  do {
    const pagina = await s3.send(
      new ListObjectsV2Command({ Bucket: conf.bucket, ContinuationToken: token }),
    )
    for (const o of pagina.Contents ?? []) {
      if (!o.Key) continue
      objetos.push({
        key: o.Key,
        url: urlPublica(conf.base, o.Key),
        size: o.Size ?? 0,
        uploadedAt: o.LastModified ?? new Date(0),
      })
    }
    token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined
  } while (token)
  return objetos
}
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: PASS, 9 pruebas.

- [ ] **Step 6: Documentar las variables en `.env.example`**

Reemplazar el bloque de `BLOB_READ_WRITE_TOKEN` (el que empieza en `# Subida de imágenes (avatar y portada)`) por:

```bash
# Almacenamiento de media (avatares, portadas y los videos programados).
# Bucket de Cloudflare R2 — plan gratis de 10 GB con egress $0.
#
# Créalo en dash.cloudflare.com → R2 → Create bucket, nómbralo portafolio-media,
# cuélgale un subdominio propio (Settings → Public access → Connect domain) y emite
# un token de API con permiso de lectura/escritura SOLO sobre ese bucket.
#
# Cárgalas a Vercel desde Bash con printf, NUNCA con un pipe de PowerShell: el pipe
# le antepone un BOM al valor y la firma S3 falla sin decir por qué.
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=portafolio-media
# Sin barra final.
R2_PUBLIC_BASE=https://media.tudominio.com
```

- [ ] **Step 7: Verificar que nada se rompió**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: todo verde.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/storage.ts src/lib/storage.test.ts .env.example
git commit -m "Agrega la capa de almacenamiento contra Cloudflare R2"
```

---

### Task 2: Cambiar los cinco sitios que escriben y borran

**Files:**
- Modify: `src/app/admin/actions.ts` (líneas 7, 299, 428, 561)
- Modify: `src/lib/social/publish/batch.ts` (líneas 5, 180)
- Modify: `src/lib/social/publish/run.ts` (líneas 11, 118)
- Modify: `next.config.ts`
- Modify: `package.json` (quitar `@vercel/blob`)

**Interfaces:**
- Consumes: `guardar(key, body, contentType)` y `borrar(url)` de la tarea 1.
- Produces: nada nuevo. Las firmas de `uploadImage`, `createScheduledPost`, `updateScheduledPost` y `mediaToBlob` **no cambian** — siguen devolviendo lo mismo, solo que la URL ahora es de R2.

- [ ] **Step 1: Cambiar la subida de imagen de perfil en `src/app/admin/actions.ts`**

Reemplazar el import de la línea 7 (`import { put } from '@vercel/blob'`) por:

```ts
import { guardar, SIN_ALMACEN } from '@/lib/storage'
```

En `uploadImage` (línea ~296), reemplazar la guarda de `BLOB_READ_WRITE_TOKEN` y el `put`:

```ts
  try {
    const url = await guardar(`uploads/${randomUUID()}-${file.name}`, file, file.type)
    return { url }
  } catch (error) {
    console.error('[upload] failed', error)
    // Sin configuración el panel debe decir qué falta, no un genérico: es el mismo
    // trato que daba la guarda de BLOB_READ_WRITE_TOKEN que esto reemplaza.
    if (error instanceof Error && error.message === SIN_ALMACEN) return { error: SIN_ALMACEN }
    return { error: 'No se pudo subir la imagen.' }
  }
```

Y borrar el bloque que lo precedía:

```ts
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: 'Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN).' }
  }
```

La ausencia de configuración ahora la reporta `guardar` lanzando `SIN_ALMACEN`, que el mismo `catch` convierte en la frase del panel.

- [ ] **Step 2: Cambiar las dos subidas de media programada en `src/app/admin/actions.ts`**

En `createScheduledPost` (línea ~428):

```ts
    // Público a propósito: la Graph API de Instagram descarga la media desde esta URL.
    const url = await guardar(`scheduled/${randomUUID()}-${file.name}`, file, file.type)
    uploaded.push({ url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
```

En `updateScheduledPost` (línea ~561):

```ts
    const url = await guardar(`scheduled/${randomUUID()}-${file.name}`, file, file.type)
    fileMedia.push({ url, mediaType: file.type.startsWith('video/') ? 'video' : 'image' })
```

- [ ] **Step 3: Cambiar `mediaToBlob` en `src/lib/social/publish/batch.ts`**

En el import de la línea 5, reemplazar `import { put } from '@vercel/blob'` por:

```ts
import { guardar } from '@/lib/storage'
```

Y el final de `mediaToBlob` (línea ~180):

```ts
  const url = await guardar(
    `scheduled/${randomUUID()}.${detected.extension}`,
    await response.blob(),
    contentType,
  )
  return { url, mediaType: detected.mediaType }
```

- [ ] **Step 4: Cambiar el borrado en `src/lib/social/publish/run.ts`**

En el import de la línea 11, reemplazar `import { del } from '@vercel/blob'` por:

```ts
import { borrar } from '@/lib/storage'
```

Y en `limpiarMedia` (línea 118), `await del(item.blobUrl)` por:

```ts
      await borrar(item.blobUrl)
```

- [ ] **Step 5: Actualizar `remotePatterns` en `next.config.ts`**

Reemplazar los dos patrones de `blob.vercel-storage.com` por el host de R2. Sin esto el avatar del perfil público deja de renderizar: `src/components/profile-view.tsx:120` pasa por el optimizador de imágenes (los demás usos son `unoptimized`).

```ts
    remotePatterns: [
      // Todo lo que se sube desde el panel aterriza en el bucket de R2, servido por
      // nuestro subdominio. Cambiar R2_PUBLIC_BASE obliga a cambiar esto también.
      { protocol: 'https', hostname: 'media.tudominio.com' },
      // Miniaturas de las redes conectadas. Se renderizan con `unoptimized`: estas
      // URLs expiran en horas, así que cachear una copia optimizada solo se pone rancia.
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
```

> El `hostname` debe ser el dominio real que se conectó al bucket, el mismo de `R2_PUBLIC_BASE`. `remotePatterns` no lee variables de entorno en tiempo de ejecución, así que aquí va literal.

- [ ] **Step 6: Sacar la dependencia**

```bash
npm uninstall @vercel/blob
```

- [ ] **Step 7: Verificar que no queda ninguna referencia**

Run: `grep -rn "@vercel/blob\|BLOB_READ_WRITE_TOKEN" --include=*.ts --include=*.tsx --include=*.json src scripts package.json`
Expected: sin resultados.

- [ ] **Step 8: Correr todo**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: todo verde. Las pruebas existentes de `batch` y `publisher` no tocan la red, así que no deberían notar el cambio.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/actions.ts src/lib/social/publish/batch.ts src/lib/social/publish/run.ts next.config.ts package.json package-lock.json
git commit -m "Escribe y borra la media en R2 en vez de Vercel Blob"
```

---

### Task 3: El barrido de huérfanos, enganchado al cron

**Files:**
- Create: `src/lib/storage-gc.ts`
- Test: `src/lib/storage-gc.test.ts`
- Modify: `src/app/api/cron/publish-social/route.ts`

**Interfaces:**
- Consumes: `listar()`, `borrar(url)` y `type ObjetoAlmacenado` de la tarea 1; `getDb`, `profiles`, `links`, `scheduledPosts`, `scheduledPostMedia` de `@/db`.
- Produces:
  - `GRACIA_MS: number` (una hora en milisegundos)
  - `objetosABorrar(objetos: ObjetoAlmacenado[], referenciadas: Set<string>, ahora: Date, graciaMs?: number): ObjetoAlmacenado[]`
  - `type Barrido = { borrados: number; bytes: number; error?: string }`
  - `barrerHuerfanos(ahora?: Date): Promise<Barrido>`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/lib/storage-gc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GRACIA_MS, objetosABorrar } from './storage-gc'
import type { ObjetoAlmacenado } from './storage'

const AHORA = new Date('2026-09-07T12:00:00Z')
const VIEJO = new Date(AHORA.getTime() - 3 * 60 * 60 * 1000) // 3 horas
const RECIEN = new Date(AHORA.getTime() - 5 * 60 * 1000) // 5 minutos

function obj(nombre: string, uploadedAt: Date, size = 100): ObjetoAlmacenado {
  return { key: `scheduled/${nombre}`, url: `https://media.ejemplo.com/scheduled/${nombre}`, size, uploadedAt }
}

describe('objetosABorrar', () => {
  it('borra lo huérfano y viejo', () => {
    const huerfano = obj('a.mp4', VIEJO)
    expect(objetosABorrar([huerfano], new Set(['https://media.ejemplo.com/otra.mp4']), AHORA)).toEqual([
      huerfano,
    ])
  })

  it('no toca lo que alguna fila referencia', () => {
    const vivo = obj('a.mp4', VIEJO)
    expect(objetosABorrar([vivo], new Set([vivo.url]), AHORA)).toEqual([])
  })

  it('respeta la ventana de gracia aunque esté huérfano', () => {
    // Entre el put() y el insert() hay una ventana real: sin la gracia el barrido
    // puede matar un archivo cuya fila todavía no se escribió.
    const recien = obj('a.mp4', RECIEN)
    expect(objetosABorrar([recien], new Set(['https://media.ejemplo.com/otra.mp4']), AHORA)).toEqual([])
  })

  it('con el conjunto de referencias vacío no borra nada', () => {
    // Cero referencias con objetos en el bucket no es un estado que esta app produzca:
    // cada archivo nace junto a la fila que lo apunta. Es mucho más probable que la
    // lectura haya fallado, y vaciar el bucket por eso no tiene vuelta.
    expect(objetosABorrar([obj('a.mp4', VIEJO), obj('b.mp4', VIEJO)], new Set(), AHORA)).toEqual([])
  })

  it('separa un lote mixto', () => {
    const vivo = obj('vivo.mp4', VIEJO)
    const huerfano = obj('huerfano.mp4', VIEJO)
    const nuevo = obj('nuevo.mp4', RECIEN)
    expect(objetosABorrar([vivo, huerfano, nuevo], new Set([vivo.url]), AHORA)).toEqual([huerfano])
  })

  it('la gracia por defecto es de una hora', () => {
    expect(GRACIA_MS).toBe(60 * 60 * 1000)
    const justoDentro = obj('a.mp4', new Date(AHORA.getTime() - GRACIA_MS + 1000))
    const justoFuera = obj('b.mp4', new Date(AHORA.getTime() - GRACIA_MS - 1000))
    const refs = new Set(['https://media.ejemplo.com/otra.mp4'])
    expect(objetosABorrar([justoDentro, justoFuera], refs, AHORA)).toEqual([justoFuera])
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/lib/storage-gc.test.ts`
Expected: FAIL — no existe el módulo `./storage-gc`.

- [ ] **Step 3: Escribir `src/lib/storage-gc.ts`**

```ts
import { getDb, links, profiles, scheduledPostMedia, scheduledPosts } from '@/db'
import { borrar, listar, type ObjetoAlmacenado } from '@/lib/storage'

/**
 * Entre el `guardar()` y el `insert()` de la fila hay una ventana real. Una hora es
 * holgadísima para la más lenta de esas escrituras y sigue siendo corta frente a la
 * cadencia diaria del barrido.
 */
export const GRACIA_MS = 60 * 60 * 1000

export type Barrido = { borrados: number; bytes: number; error?: string }

/**
 * La regla: se va lo que ninguna fila referencia y lleva más de `graciaMs` subido.
 *
 * El conjunto vacío es el caso peligroso y se trata aparte. Un bucket con objetos y
 * cero referencias no es un estado que esta app produzca —cada archivo nace junto a
 * la fila que lo apunta—, así que es mucho más probable una lectura fallida que un
 * bucket legítimamente huérfano. Ante la duda no se borra: postergar el barrido un
 * día no cuesta nada, vaciar el bucket no tiene vuelta.
 */
export function objetosABorrar(
  objetos: ObjetoAlmacenado[],
  referenciadas: Set<string>,
  ahora: Date,
  graciaMs: number = GRACIA_MS,
): ObjetoAlmacenado[] {
  if (referenciadas.size === 0) return []
  const limite = ahora.getTime() - graciaMs
  return objetos.filter((o) => !referenciadas.has(o.url) && o.uploadedAt.getTime() < limite)
}

/**
 * Las cinco columnas que pueden guardar una URL nuestra. `social_posts.thumbnail_url`
 * no está a propósito: esa URL es de la red social, no del almacén.
 */
async function urlsReferenciadas(): Promise<Set<string>> {
  const db = getDb()
  const [perfiles, enlaces, posts, media] = await Promise.all([
    db.select({ avatar: profiles.avatarUrl, og: profiles.ogImageUrl }).from(profiles),
    db.select({ imagen: links.imageUrl }).from(links),
    db.select({ portada: scheduledPosts.coverUrl }).from(scheduledPosts),
    db.select({ blob: scheduledPostMedia.blobUrl }).from(scheduledPostMedia),
  ])

  const urls = new Set<string>()
  for (const p of perfiles) {
    if (p.avatar) urls.add(p.avatar)
    if (p.og) urls.add(p.og)
  }
  for (const e of enlaces) if (e.imagen) urls.add(e.imagen)
  for (const p of posts) if (p.portada) urls.add(p.portada)
  for (const m of media) urls.add(m.blob)
  return urls
}

/**
 * Un barrido. Cierra la fuga como regla en vez de como parche: cualquier camino que
 * borre una fila y olvide el archivo queda cubierto al día siguiente.
 *
 * Nunca lanza. Un barrido que falla no puede ensuciar una publicación que funcionó,
 * que es el trabajo real del cron que lo llama.
 */
export async function barrerHuerfanos(ahora: Date = new Date()): Promise<Barrido> {
  try {
    const [objetos, referenciadas] = await Promise.all([listar(), urlsReferenciadas()])
    let borrados = 0
    let bytes = 0
    for (const objeto of objetosABorrar(objetos, referenciadas, ahora)) {
      await borrar(objeto.url)
      borrados += 1
      bytes += objeto.size
    }
    return { borrados, bytes }
  } catch (error) {
    console.error('El barrido de huérfanos falló:', String(error).slice(0, 300))
    return { borrados: 0, bytes: 0, error: 'El barrido falló.' }
  }
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/lib/storage-gc.test.ts`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Engancharlo al cron de publicación**

En `src/app/api/cron/publish-social/route.ts`, agregar el import:

```ts
import { barrerHuerfanos } from '@/lib/storage-gc'
```

Y en el `try`, después de `publishDue()`:

```ts
    // Failed targets answer 200 on purpose: each one wrote its own lastError and the
    // calendar shows it. A non-2xx here means the orchestrator itself broke.
    const report = await publishDue()
    // Después de publicar, no antes: `limpiarMedia` acaba de liberar los videos del
    // día y el barrido no tiene por qué esperar otras 24 horas para verlo. No hace
    // falta envolverlo: `barrerHuerfanos` no lanza nunca.
    const barrido = await barrerHuerfanos()
    return NextResponse.json({ report, barrido })
```

> No es un cron nuevo: el plan Hobby permite dos y ya están los dos declarados en `vercel.json`.

- [ ] **Step 6: Correr todo**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage-gc.ts src/lib/storage-gc.test.ts src/app/api/cron/publish-social/route.ts
git commit -m "Barre los archivos que ya no referencia ninguna fila"
```

---

### Task 4: Desplegar y verificar en producción

Esta tarea no escribe código. Existe porque el orden importa: el código nuevo tiene que estar en producción **antes** de que corra la migración, para que la migración deje de perseguir un blanco móvil.

**Files:** ninguno.

**Interfaces:**
- Consumes: todo lo de las tareas 1–3.
- Produces: un despliegue en producción con las cinco variables cargadas, y la confirmación de que una subida nueva aterriza en R2.

- [ ] **Step 1: Confirmar que la preparación manual está hecha**

El dueño debe tener listo, antes de seguir:
1. El bucket `portafolio-media` creado en R2.
2. Un subdominio propio conectado a ese bucket (Settings → Public access → Connect domain).
3. Un token de API de R2 con lectura/escritura **solo sobre ese bucket**.

Verificar que el dominio sirve el bucket: subir cualquier archivo desde el panel de R2 y abrirlo por el subdominio. Debe descargarse, no dar 404 ni un desafío de Cloudflare.

- [ ] **Step 2: Cargar las variables en Vercel**

Desde **Bash**, nunca desde PowerShell con pipe — el pipe antepone un BOM al valor y la firma S3 falla sin decir por qué:

```bash
printf '%s' 'EL_ACCOUNT_ID'      | npx vercel env add R2_ACCOUNT_ID production
printf '%s' 'EL_ACCESS_KEY_ID'   | npx vercel env add R2_ACCESS_KEY_ID production
printf '%s' 'EL_SECRET'          | npx vercel env add R2_SECRET_ACCESS_KEY production
printf '%s' 'portafolio-media'   | npx vercel env add R2_BUCKET production
printf '%s' 'https://media.tudominio.com' | npx vercel env add R2_PUBLIC_BASE production
```

Repetir con `preview` en lugar de `production`. Después, en local:

```bash
npx vercel env pull .env.local
```

- [ ] **Step 3: Verificar que el `hostname` de `next.config.ts` coincide**

Run: `grep -n "hostname: 'media" next.config.ts && grep R2_PUBLIC_BASE .env.local`
Expected: el host del literal y el de la variable son el mismo. Si no, el avatar del perfil público se rompe en producción.

- [ ] **Step 4: Desplegar**

```bash
npx vercel --prod
```

- [ ] **Step 5: Probar una subida real**

En `/admin/profiles/<id>`, cambiar la imagen de un perfil. Verificar que:
- La imagen se ve en el panel y en el perfil público.
- Su URL empieza con `R2_PUBLIC_BASE`.
- El archivo aparece en el bucket `portafolio-media` desde el panel de R2.

- [ ] **Step 6: Probar el cron**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/publish-social
```

Expected: un JSON con `report` y `barrido`. En este punto `barrido` debe traer `borrados: 0` — el bucket solo tiene lo que se acaba de subir, que está referenciado y además dentro de la hora de gracia. Un `barrido.error` acá significa que las credenciales de R2 no están bien, y hay que arreglarlo antes de migrar.

---

### Task 5: Migrar lo que quedó en Vercel Blob

**Files:**
- Create: `src/lib/storage-migracion.ts`
- Test: `src/lib/storage-migracion.test.ts`
- Create: `scripts/migrate-blobs.ts`
- Create: `scripts/blob-audit.ts`
- Modify: `package.json` (scripts `blobs:migrar` y `blobs:auditar`)

**Interfaces:**
- Consumes: `guardar()` y `listar()` de la tarea 1.
- Produces: `esUrlVercelBlob(url: string): boolean` — usada solo por el script de migración; el módulo se borra cuando la migración termine.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/lib/storage-migracion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { esUrlVercelBlob } from './storage-migracion'

describe('esUrlVercelBlob', () => {
  it('reconoce una URL pública del Blob', () => {
    expect(esUrlVercelBlob('https://abc123.public.blob.vercel-storage.com/scheduled/x.mp4')).toBe(true)
  })

  it('reconoce la forma sin `public`', () => {
    expect(esUrlVercelBlob('https://abc123.blob.vercel-storage.com/uploads/y.png')).toBe(true)
  })

  it('rechaza una URL de nuestro bucket de R2', () => {
    expect(esUrlVercelBlob('https://media.ejemplo.com/scheduled/x.mp4')).toBe(false)
  })

  it('rechaza una miniatura de una red social', () => {
    expect(esUrlVercelBlob('https://scontent.cdninstagram.com/v/foto.jpg')).toBe(false)
  })

  it('rechaza un dominio que solo contiene el nombre', () => {
    // Un atacante no aplica acá, pero un typo sí: no queremos migrar lo que no es.
    expect(esUrlVercelBlob('https://blob.vercel-storage.com.ejemplo.com/x.mp4')).toBe(false)
  })

  it('rechaza vacío y basura', () => {
    expect(esUrlVercelBlob('')).toBe(false)
    expect(esUrlVercelBlob('no-es-una-url')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/lib/storage-migracion.test.ts`
Expected: FAIL — no existe el módulo `./storage-migracion`.

- [ ] **Step 3: Escribir `src/lib/storage-migracion.ts`**

```ts
/**
 * Reconoce una URL que todavía apunta a Vercel Blob.
 *
 * Existe solo para la migración a R2: cuando ninguna fila devuelva true, este módulo
 * y su prueba se borran junto con `scripts/migrate-blobs.ts`.
 */
export function esUrlVercelBlob(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  // El host completo, no un `includes`: `blob.vercel-storage.com.otracosa.com` no es esto.
  return host === 'blob.vercel-storage.com' || host.endsWith('.blob.vercel-storage.com')
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/lib/storage-migracion.test.ts`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Escribir `scripts/blob-audit.ts`**

```ts
/**
 * Mide el bucket: cuánto pesa, en qué carpetas, y quiénes son los archivos grandes.
 *
 * Es la herramienta con la que se diagnosticó el problema (1.302 MB en Vercel Blob,
 * 98,7 % en 26 videos) y con la que se comprueba que la migración hizo lo que dice.
 *
 * Uso:
 *   npm run blobs:auditar
 */
import { listar } from '../src/lib/storage'

const MB = 1024 * 1024

async function main() {
  const objetos = await listar()
  const total = objetos.reduce((suma, o) => suma + o.size, 0)
  console.log(`TOTAL: ${objetos.length} archivos, ${(total / MB).toFixed(1)} MB`)

  const porCarpeta = new Map<string, { n: number; bytes: number }>()
  for (const o of objetos) {
    const carpeta = o.key.split('/')[0] ?? '(raíz)'
    const acumulado = porCarpeta.get(carpeta) ?? { n: 0, bytes: 0 }
    acumulado.n += 1
    acumulado.bytes += o.size
    porCarpeta.set(carpeta, acumulado)
  }
  console.log('\n--- por carpeta ---')
  for (const [carpeta, e] of [...porCarpeta].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`${carpeta.padEnd(14)} ${String(e.n).padStart(5)} arch  ${(e.bytes / MB).toFixed(1)} MB`)
  }

  const esVideo = (key: string) => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(key)
  const videos = objetos.filter((o) => esVideo(o.key))
  const imagenes = objetos.filter((o) => !esVideo(o.key))
  console.log('\n--- por tipo ---')
  for (const [nombre, grupo] of [['video', videos], ['imagen', imagenes]] as const) {
    const bytes = grupo.reduce((s, o) => s + o.size, 0)
    console.log(`${nombre.padEnd(7)} ${String(grupo.length).padStart(5)} arch  ${(bytes / MB).toFixed(1)} MB`)
  }

  console.log('\n--- 15 más pesados ---')
  for (const o of [...objetos].sort((a, b) => b.size - a.size).slice(0, 15)) {
    const fecha = o.uploadedAt.toISOString().slice(0, 10)
    console.log(`${(o.size / MB).toFixed(1).padStart(7)} MB  ${fecha}  ${o.key.slice(0, 80)}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 6: Escribir `scripts/migrate-blobs.ts`**

```ts
/**
 * Mueve a R2 toda la media que todavía vive en Vercel Blob.
 *
 * Por cada URL de Vercel Blob guardada en las cinco columnas: la descarga (son
 * públicas, basta un fetch), la sube a R2 con la misma key, y reescribe la columna.
 * No borra nada de Vercel: eso se hace de una vez eliminando el store completo desde
 * el panel, cuando la verificación del final diga que ya no queda ninguna fila
 * apuntando ahí.
 *
 * Idempotente: una URL que ya apunta a R2 se salta. Si la subida o la reescritura
 * fallan, la fila queda apuntando a donde el archivo todavía está — se reintenta sin
 * pérdida.
 *
 * Uso:
 *   npm run blobs:migrar             # dry-run: imprime el plan, no escribe nada
 *   npm run blobs:migrar -- --aplicar
 */
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import { links, profiles, scheduledPostMedia, scheduledPosts } from '../src/db/schema'
import { esUrlVercelBlob } from '../src/lib/storage-migracion'
import { guardar } from '../src/lib/storage'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('Falta DATABASE_URL')
const db = drizzle(neon(dbUrl), { schema: { profiles, links, scheduledPosts, scheduledPostMedia } })
const aplicar = process.argv.includes('--aplicar')

type Pendiente = { etiqueta: string; url: string; escribir: (nueva: string) => Promise<void> }

/** La key es el pathname del blob: así el archivo conserva su nombre en R2. */
function keyDesdeBlob(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

async function pendientes(): Promise<Pendiente[]> {
  const lista: Pendiente[] = []

  for (const p of await db.select().from(profiles)) {
    if (p.avatarUrl && esUrlVercelBlob(p.avatarUrl)) {
      lista.push({
        etiqueta: `profiles.avatar_url ${p.id}`,
        url: p.avatarUrl,
        escribir: async (nueva) =>
          void (await db.update(profiles).set({ avatarUrl: nueva }).where(eq(profiles.id, p.id))),
      })
    }
    if (p.ogImageUrl && esUrlVercelBlob(p.ogImageUrl)) {
      lista.push({
        etiqueta: `profiles.og_image_url ${p.id}`,
        url: p.ogImageUrl,
        escribir: async (nueva) =>
          void (await db.update(profiles).set({ ogImageUrl: nueva }).where(eq(profiles.id, p.id))),
      })
    }
  }

  for (const l of await db.select().from(links)) {
    if (l.imageUrl && esUrlVercelBlob(l.imageUrl)) {
      lista.push({
        etiqueta: `links.image_url ${l.id}`,
        url: l.imageUrl,
        escribir: async (nueva) =>
          void (await db.update(links).set({ imageUrl: nueva }).where(eq(links.id, l.id))),
      })
    }
  }

  for (const p of await db.select().from(scheduledPosts)) {
    if (p.coverUrl && esUrlVercelBlob(p.coverUrl)) {
      lista.push({
        etiqueta: `scheduled_posts.cover_url ${p.id}`,
        url: p.coverUrl,
        escribir: async (nueva) =>
          void (await db.update(scheduledPosts).set({ coverUrl: nueva }).where(eq(scheduledPosts.id, p.id))),
      })
    }
  }

  for (const m of await db.select().from(scheduledPostMedia)) {
    if (esUrlVercelBlob(m.blobUrl)) {
      lista.push({
        etiqueta: `scheduled_post_media.blob_url ${m.id}`,
        url: m.blobUrl,
        escribir: async (nueva) =>
          void (await db
            .update(scheduledPostMedia)
            .set({ blobUrl: nueva })
            .where(eq(scheduledPostMedia.id, m.id))),
      })
    }
  }

  return lista
}

async function main() {
  const lista = await pendientes()
  console.log(`${lista.length} URLs por migrar${aplicar ? '' : ' (dry-run, no se escribe nada)'}\n`)

  let migradas = 0
  let fallidas = 0
  for (const item of lista) {
    const key = keyDesdeBlob(item.url)
    if (!aplicar) {
      console.log(`  ${item.etiqueta}  →  ${key}`)
      continue
    }
    try {
      const respuesta = await fetch(item.url)
      if (!respuesta.ok) throw new Error(`descarga ${respuesta.status}`)
      const contentType = respuesta.headers.get('content-type') ?? 'application/octet-stream'
      const nueva = await guardar(key, await respuesta.blob(), contentType)
      await item.escribir(nueva)
      migradas += 1
      console.log(`  ✓ ${item.etiqueta}  →  ${nueva}`)
    } catch (error) {
      fallidas += 1
      console.error(`  ✗ ${item.etiqueta}: ${String(error).slice(0, 200)}`)
    }
  }

  if (aplicar) {
    console.log(`\nMigradas: ${migradas}. Fallidas: ${fallidas}.`)
    const quedan = await pendientes()
    console.log(`Filas que todavía apuntan a Vercel Blob: ${quedan.length}`)
    if (quedan.length === 0) {
      console.log('Listo. Ya puedes eliminar el store de Blob desde el panel de Vercel.')
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 7: Agregar los scripts a `package.json`**

En `"scripts"`, junto a los de `analytics:`:

```json
    "blobs:auditar": "dotenv -e .env.local -- tsx scripts/blob-audit.ts",
    "blobs:migrar": "dotenv -e .env.local -- tsx scripts/migrate-blobs.ts",
```

- [ ] **Step 8: Correr todo y commitear antes de tocar producción**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: todo verde.

```bash
git add src/lib/storage-migracion.ts src/lib/storage-migracion.test.ts scripts/migrate-blobs.ts scripts/blob-audit.ts package.json
git commit -m "Agrega la migración de Vercel Blob a R2 y la auditoría del bucket"
```

- [ ] **Step 9: Dry-run contra producción**

Run: `npm run blobs:migrar`
Expected: la lista de URLs por migrar con su key destino. Deben ser **~26 filas** (los 23 videos vivos más las 3 imágenes de perfil y links). Si sale mucho más o mucho menos, parar y revisar antes de aplicar.

- [ ] **Step 10: Migrar de verdad**

Run: `npm run blobs:migrar -- --aplicar`
Expected: cada línea con `✓`, y al final `Filas que todavía apuntan a Vercel Blob: 0`. Si alguna falla, volver a correr el mismo comando: las ya migradas se saltan solas.

- [ ] **Step 11: Verificar el bucket**

Run: `npm run blobs:auditar`
Expected: ~26 archivos, ~1.170 MB. Sumado a los 1,83 GB que ya usaba la cuenta, queda cerca de 3 GB de los 10 disponibles.

- [ ] **Step 12: Verificar la app**

- Abrir `/admin/schedule`: el calendario muestra las miniaturas de los posts encolados.
- Abrir el perfil público: el avatar carga (esto prueba que `remotePatterns` quedó bien).
- Abrir un post en `/admin/schedule/<id>`: el video se previsualiza.

- [ ] **Step 13: Probar el ciclo completo con un video**

Esta es la única prueba que confirma lo que más importa y que ninguna prueba unitaria puede cubrir: que **Meta descargue la media desde el dominio propio**. Instagram y Facebook no reciben el archivo, reciben la URL y la van a buscar; si el subdominio les responde un desafío de Cloudflare o un 403, el post falla en la publicación y no antes.

1. Encolar un post con video por CSV en `/admin/schedule`, con fecha a pocos minutos, apuntando a Instagram y Facebook.
2. Confirmar que la fila de `scheduled_post_media` guardó una URL de `R2_PUBLIC_BASE`.
3. Disparar el cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://<tu-dominio>/api/cron/publish-social`
4. Verificar que el post salió en ambas redes.
5. Verificar que `limpiarMedia` liberó el video: el archivo ya no está en el bucket (`npm run blobs:auditar`) y su fila de `scheduled_post_media` desapareció.

Si el paso 4 falla con un error de descarga de media, el problema es el acceso público del bucket, no el código: revisar que el subdominio esté conectado y que no haya una regla de firewall de Cloudflare delante.

- [ ] **Step 14: Eliminar el store de Vercel Blob**

Solo después de que el paso 10 haya dicho `0` y los pasos 12 y 13 estén conformes: en el panel de Vercel, **Storage → el store de Blob → Settings → Delete**. Esto se lleva los 1.302 MB, incluidos los 74 huérfanos que nunca se migraron a propósito.

Después, retirar la variable:

```bash
npx vercel env rm BLOB_READ_WRITE_TOKEN production
npx vercel env rm BLOB_READ_WRITE_TOKEN preview
```

- [ ] **Step 15: Borrar el andamio de la migración**

Ya no queda nada que migrar, así que el código que existía solo para eso se va:

```bash
git rm src/lib/storage-migracion.ts src/lib/storage-migracion.test.ts scripts/migrate-blobs.ts
```

Quitar también la línea `"blobs:migrar"` de `package.json`. `scripts/blob-audit.ts` y `blobs:auditar` **se quedan**: sirven para vigilar el bucket de aquí en adelante.

Run: `npm run test && npm run lint && npm run typecheck`
Expected: todo verde.

```bash
git add -A
git commit -m "Retira el andamio de la migración, ya no queda nada en Vercel Blob"
```

---

### Task 6: Documentar y cerrar

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Actualizar el README**

En la sección de despliegue, el paso 3 dice hoy:

> - **Create → Blob** — inyecta `BLOB_READ_WRITE_TOKEN` sola. Opcional: sin ella todo funciona, solo que no puedes subir fotos desde el panel.

Reemplazarlo por:

```markdown
- **Almacenamiento de media** — no es de Vercel: un bucket de Cloudflare R2, porque
  su plan gratis son 10 GB con egress $0 y los videos programados no caben en menos.
  En dash.cloudflare.com → R2: crea el bucket, cuélgale un subdominio propio y emite
  un token con permiso solo sobre él. Después carga `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y `R2_PUBLIC_BASE` (ver
  `.env.example`), y pon el host de `R2_PUBLIC_BASE` en `images.remotePatterns` de
  `next.config.ts`. Opcional: sin esto todo funciona, solo que no puedes subir media.
```

Y en la frase de la cabecera, cambiar «Vercel Blob para las imágenes» por «Cloudflare R2 para la media».

- [ ] **Step 2: Verificación final completa**

Run: `npm run test && npm run lint && npm run typecheck && npm run blobs:auditar`
Expected: todo verde, y el bucket con los archivos esperados.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Documenta el almacenamiento en R2 en el instructivo de despliegue"
```

- [ ] **Step 4: Abrir el PR a `main`**

La rama de trabajo sale de `contenido-presentacion`. Recordar que producción despliega `main`: sin el PR de promoción el cambio no se ve en producción.

---

## Verificación de que el objetivo se cumplió

| Antes | Después |
|---|---|
| 1.302 MB contra un tope de 1 GB | ~1.170 MB en un bucket de 10 GB |
| 135 MB de huérfanos sin forma de recuperarlos | Barrido diario en el cron de publicación |
| Borrar un post dejaba su video para siempre | El barrido lo recoge al día siguiente |
| Quitar una media en el editor dejaba su archivo | Ídem |

---

## Estado al 2026-09-08

Ejecutado en la rama `almacen-r2` (`d6a4e59..09ee093`, 10 commits). 336 pruebas, lint y
typecheck verdes.

**Hecho:** tareas 1, 2, 3, 6 completas; tarea 5 solo sus pasos 1-8 (el código).

**Pendiente, y bloqueado en la preparación manual de Cloudflare:**

- Tarea 4 entera (crear el bucket, colgarle el subdominio, emitir el token, cargar las
  cinco variables, desplegar, probar la subida y el cron).
- Tarea 5 pasos 9-15 (dry-run, migración real, verificación, prueba del ciclo completo
  con video, eliminar el store de Vercel Blob, borrar el andamio de la migración).
- Tarea 6 paso 2 (`npm run blobs:auditar`, que necesita las credenciales) y paso 4 (el PR).

**Dos cambios que la revisión final obligó, y que el plan de arriba no anticipaba:**

1. **Los patrones de `blob.vercel-storage.com` en `next.config.ts` NO se quitaron.** El
   paso 5 de la tarea 2 decía quitarlos, pero con el orden «desplegar primero, migrar
   después» las URLs guardadas siguen apuntando ahí durante toda la ventana, y el
   optimizador de imágenes de Next responde 400 para un host ausente de
   `remotePatterns` — el perfil público perdería avatar e imágenes de links. Se quitan
   en el mismo commit que borra `src/lib/storage-migracion.ts` y
   `scripts/migrate-blobs.ts` (tarea 5, paso 15), que es cuando ninguna fila puede ya
   referenciar ese host.

2. **El barrido compara claves, no URLs.** Como lo describía la tarea 3, si
   `R2_PUBLIC_BASE` cambiara alguna vez, ninguna URL guardada cruzaría con las
   compuestas, el conjunto de referencias quedaría lleno de cadenas que no coinciden, y
   la guarda de «conjunto vacío = no borrar nada» no se dispararía: la siguiente corrida
   borraba el bucket entero. Ahora cada URL referenciada se resuelve con `keyDesdeUrl`
   contra la base actual y las que no resuelven se descartan, así que una base
   equivocada produce un conjunto vacío y el barrido no borra nada.

**Riesgo residual anotado, no resuelto:** una migración *parcial* de base —algunas filas
compuestas con la base vieja y otras con la nueva, sin backfill— dejaría los objetos de
las filas viejas pareciendo huérfanos, y el barrido se los llevaría al pasar la hora de
gracia. Es una propiedad de guardar URLs completas en vez de claves, no una regresión.
Si algún día se cambia `R2_PUBLIC_BASE`, hay que reescribir las cinco columnas en la
misma maniobra.

## Cierre — 2026-09-08

Ejecutado y verificado en producción. **91 filas migradas, cero apuntando a Vercel
Blob.** El bucket quedó con 90 archivos y 1.122 MB, servidos por
`https://media-bucket.vicente-pareja.cl`.

Se corrigió sobre la marcha algo que el diagnóstico tenía mal: el script con que se midió
cruzaba los archivos contra **una sola** columna (`scheduled_post_media.blob_url`), así
que contó las 66 portadas de `scheduled_posts.cover_url` como huérfanas. Los huérfanos
reales eran ~7, no 74. No cambia el diseño —el espacio siempre fueron los videos, y las
dos fugas que tapa el barrido son reales— pero el barrido recupera mucho menos de lo
anunciado.

También se retiraron ya los patrones de `blob.vercel-storage.com` y el andamio de la
migración, en el commit que el plan preveía para eso.

Queda pendiente, del dueño: eliminar el store de Blob desde el panel de Vercel, retirar
`BLOB_READ_WRITE_TOKEN`, y probar el ciclo completo con un video real (encolar, publicar,
confirmar que Meta lo descargó desde el dominio propio y que `limpiarMedia` liberó el
archivo).
