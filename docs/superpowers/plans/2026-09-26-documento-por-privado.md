# El documento por privado, y la documentación para LLM — Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para ir marcando.

**Objetivo:** Que la regla de palabra clave pueda llevar un documento PDF, subido por API, y que el enlace a ese documento viaje en el mensaje que recibe quien comenta. Y que toda la API quede documentada de forma que un LLM la use sin adivinar.

**Arquitectura:** `regla` gana un campo, `documentoUrl`. Al programar, el PDF se descarga y se guarda en R2 con el mismo patrón que la media, y su URL se guarda en `reglas_clave`. Al responder, el enlace se añade al final del mensaje. No hay endpoint nuevo, no hay adjunto, y no hay estado nuevo que rastrear.

**Stack:** Next.js App Router, Drizzle sobre `postgres-js`, Cloudflare R2, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-documento-por-privado-design.md`

## Restricciones globales

- **Solo PDF, hasta 25 MB.** Los dos por decisión nuestra, no de Meta; la spec explica por qué en su sección 3.
- **La validación del archivo ocurre al programar, no al enviar.** Un PDF malo falla en la llamada a la API, no tres días después dentro de un cron.
- **El documento no se mide.** No añadir código de analítica: la spec lo declara fuera de alcance con su razón (sección 10).
- **`decidirAutomatica` sigue siendo pura.** No consulta la red ni la base.
- **Ningún endpoint nuevo.** Todo viaja en el cuerpo de `POST /api/schedule/batch`.
- **Comentarios y texto de cara al usuario en español.** El código sigue el estilo del archivo que se toca; `batch.ts` y `storage-gc.ts` mezclan inglés en comentarios técnicos: respetar lo que haya alrededor.
- **TDD:** primero el test que falla, después el código mínimo.
- **Un commit por tarea**, con el pie de autoría del repositorio.
- **Los tests corren sin `DATABASE_URL`.**
- **El árbol compila y la suite pasa al final de cada tarea.**

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | `reglas_clave` gana `documento_url`. |
| `drizzle/NNNN_*.sql` | **nuevo.** La migración de esa columna, generada, no escrita a mano. |
| `src/lib/social/comentarios/reglas.ts` | `ReglaLimpia` gana el campo; `validarRegla` valida su forma; `decidirAutomatica` añade el enlace al mensaje. |
| `src/lib/social/publish/documento.ts` | **nuevo.** Descargar un PDF, comprobar tipo y tamaño, guardarlo en R2. |
| `src/lib/storage-gc.ts` | El barrido conoce la columna nueva. |
| `src/lib/social/publish/batch.ts` | Normaliza `documentoUrl`, lo descarga y lo guarda con la regla. |
| `src/lib/social/comentarios/automatico.ts` | Las lecturas de reglas traen la columna nueva. |
| `public/docs/api.json` | **nuevo.** El esquema del cuerpo del lote. |
| `public/docs/api-llm.md` | **nuevo.** La guía compacta. |
| `src/lib/docs-api.test.ts` | **nuevo.** El test que impide que la documentación mienta. |

---

### Tarea 1: La columna, y la forma del campo

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/NNNN_*.sql` (generada)
- Modify: `src/lib/social/comentarios/reglas.ts`
- Test: `src/lib/social/comentarios/reglas.test.ts`

**Interfaces:**
- Produces:
  - `ReglaLimpia = { palabra: string; mensaje: string; respuestaPublica: string; documentoUrl: string | null }`
  - `MAX_DOCUMENTO_BYTES = 25 * 1024 * 1024`
  - `REGLA_DOCUMENTO: string` — la frase de error de la forma del campo.
  - `validarRegla(raw)` acepta `documentoUrl`.

**Por qué el esquema va en esta tarea y no en la que lo usa:** `batch.ts` inserta la regla con `...reglaCheck.regla`, así que en el momento en que `ReglaLimpia` gana el campo, ese insert intenta escribir una columna que tiene que existir ya.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/comentarios/reglas.test.ts`:

```ts
it('acepta una regla sin documento, como hasta ahora', () => {
  const check = validarRegla({ palabra: 'GUIA', mensaje: 'Acá va' })
  expect('error' in check).toBe(false)
  if ('error' in check) return
  expect(check.regla).toEqual({
    palabra: 'guia',
    mensaje: 'Acá va',
    respuestaPublica: RESPUESTA_PUBLICA_POR_DEFECTO,
    documentoUrl: null,
  })
})

it('acepta un documentoUrl y lo devuelve tal cual', () => {
  const check = validarRegla({ palabra: 'GUIA', mensaje: 'Acá va', documentoUrl: 'https://ej.com/g.pdf' })
  expect('error' in check).toBe(false)
  if ('error' in check) return
  expect(check.regla?.documentoUrl).toBe('https://ej.com/g.pdf')
})

it('rechaza un documentoUrl que no es una URL absoluta', () => {
  // Una ruta relativa no se puede descargar desde el servidor, y el error tiene que
  // salir acá y no treinta segundos después en un fetch que falla sin explicar.
  expect(validarRegla({ palabra: 'GUIA', mensaje: 'x', documentoUrl: '/guia.pdf' })).toEqual({
    error: REGLA_DOCUMENTO,
  })
})

it('rechaza un documentoUrl que no es texto', () => {
  expect(validarRegla({ palabra: 'GUIA', mensaje: 'x', documentoUrl: 42 })).toEqual({
    error: REGLA_DOCUMENTO,
  })
})
```

Ajustar además los casos que ya existen y comparan el objeto entero: ahora traen `documentoUrl: null`.

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/comentarios/reglas.test.ts`
Expected: FAIL, `REGLA_DOCUMENTO` no existe.

- [ ] **Step 3: La columna en el esquema**

En `src/db/schema.ts`, dentro de `reglasClave`, después de `respuestaPublica`:

```ts
  // El PDF que acompaña al mensaje, ya copiado a R2. Nulable: la mayoría de las reglas
  // no llevan documento. Va en `storage-gc` — si no, el barrido lo borra en una hora.
  documentoUrl: text('documento_url'),
```

- [ ] **Step 4: Generar la migración**

Run: `npm run db:generate`
Expected: aparece un archivo nuevo en `drizzle/`. **Commitéalo**: el CI falla si el esquema cambió y la migración no está.

- [ ] **Step 5: El tipo, la constante y la frase**

En `src/lib/social/comentarios/reglas.ts`:

```ts
export const MAX_DOCUMENTO_BYTES = 25 * 1024 * 1024
export const REGLA_DOCUMENTO = 'El documento tiene que ser una URL absoluta a un PDF de hasta 25 MB.'
```

`ReglaLimpia` gana `documentoUrl: string | null`.

- [ ] **Step 6: La validación de la forma**

En `validarRegla`, antes del `return` final:

```ts
  // Solo la forma: que sea una URL absoluta que el servidor pueda intentar leer. Que de
  // verdad sea un PDF y que quepa se comprueba al descargarlo (`documento.ts`), porque
  // esta función es pura y no puede mirar el archivo.
  const documentoBruto = raw.documentoUrl
  let documentoUrl: string | null = null
  if (documentoBruto !== undefined && documentoBruto !== null && documentoBruto !== '') {
    if (typeof documentoBruto !== 'string') return { error: REGLA_DOCUMENTO }
    try {
      const url = new URL(documentoBruto)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: REGLA_DOCUMENTO }
    } catch {
      return { error: REGLA_DOCUMENTO }
    }
    documentoUrl = documentoBruto
  }
  return { regla: { palabra, mensaje, respuestaPublica, documentoUrl } }
```

- [ ] **Step 7: Correr y verlos pasar**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`
Expected: verde. Ojo: el `...reglaCheck.regla` de `batch.ts` ahora escribe la columna nueva, y por eso la migración va en esta tarea.

- [ ] **Step 8: Commit**

---

### Tarea 2: Descargar el documento y guardarlo

**Files:**
- Create: `src/lib/social/publish/documento.ts`
- Test: `src/lib/social/publish/documento.test.ts`

**Interfaces:**
- Consumes: `MAX_DOCUMENTO_BYTES` de `../comentarios/reglas`.
- Produces: `documentoToBlob(url: string): Promise<string | null>` — la URL pública de R2, o `null` si no se pudo.

**Por qué una función hermana y no ensanchar `mediaToBlob`:** su tipo de retorno es `'image' | 'video'`, y añadirle un tercer valor tocaría a todos sus consumidores —las reglas por red, los publicadores, el editor— para un caso que ninguno de ellos maneja.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/publish/documento.test.ts`. El patrón de simular `fetch` y `guardar` está en los tests que ya existen de `batch.ts`: míralos antes y sigue ese estilo.

```ts
it('guarda un PDF y devuelve la URL de R2', async () => {
  const url = await documentoToBlob('https://ej.com/g.pdf')
  expect(url).toBe('https://media.ej.cl/reglas/uuid.pdf')
})

it('rechaza lo que no es un PDF, aunque la URL diga .pdf', async () => {
  // El content-type manda: es lo que atrapa la página HTML intermedia de Drive, que es
  // el fallo real y silencioso de esta ruta.
  expect(await documentoToBlob('https://drive.google.com/file/d/x')).toBeNull()
})

it('rechaza un PDF más grande que el tope, por content-length', async () => {
  expect(await documentoToBlob('https://ej.com/enorme.pdf')).toBeNull()
})

it('rechaza un PDF cuyo content-length mintió y el cuerpo era más grande', async () => {
  // Un servidor puede declarar 1 MB y mandar 40: la comprobación después de descargar
  // es la que de verdad protege el almacenamiento.
  expect(await documentoToBlob('https://ej.com/miente.pdf')).toBeNull()
})

it('devuelve null si la descarga falla, sin lanzar', async () => {
  expect(await documentoToBlob('https://ej.com/muerto.pdf')).toBeNull()
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/documento.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar**

```ts
import { randomUUID } from 'node:crypto'
import { guardar } from '@/lib/storage'
import { MAX_DOCUMENTO_BYTES } from '../comentarios/reglas'

const TIPO = 'application/pdf'

/**
 * El PDF de una regla, copiado a R2. Devuelve su URL pública, o `null` si no se pudo —
 * nunca lanza: una fila mala del lote se rechaza con su frase, no revienta el lote.
 *
 * Se copia en vez de enlazar la URL del que llama por dos razones: un enlace de Drive
 * sirve una página HTML, no el PDF; y entre programar y comentar pasan días, en los que
 * esa URL puede morir.
 */
export async function documentoToBlob(url: string): Promise<string | null> {
  let response: Response
  try {
    // Mismo presupuesto que la media del lote: un host que se cuelga cuesta treinta
    // segundos de esta fila, no los 240 del lote entero.
    response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    console.error('No se pudo descargar el documento:', String(error).slice(0, 200), url.slice(0, 200))
    return null
  }
  if (!response.ok) {
    console.error('No se pudo descargar el documento:', response.status, url.slice(0, 200))
    return null
  }
  // El content-type manda sobre la extensión: es lo que atrapa la página intermedia de
  // Drive, que llegaría como `text/html` con una URL que termina en .pdf.
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (contentType !== TIPO) {
    console.error('El documento no es un PDF:', contentType, url.slice(0, 200))
    return null
  }
  // Antes de descargar: un `content-length` honesto ahorra traerse 500 MB para tirarlos.
  const declarado = Number(response.headers.get('content-length') ?? '0')
  if (declarado > MAX_DOCUMENTO_BYTES) {
    console.error('El documento declara', declarado, 'bytes y el tope es', MAX_DOCUMENTO_BYTES)
    return null
  }
  const blob = await response.blob()
  // Y después de descargar: el header puede mentir, y el tope existe para proteger el
  // almacenamiento, no para creerle al servidor de origen.
  if (blob.size > MAX_DOCUMENTO_BYTES) {
    console.error('El documento pesa', blob.size, 'bytes y el tope es', MAX_DOCUMENTO_BYTES)
    return null
  }
  return guardar(`reglas/${randomUUID()}.pdf`, blob, TIPO)
}
```

Comprobar el nombre y la firma reales de `guardar` en `src/lib/storage.ts` antes de escribir esto; si difieren, manda la firma real y **no** la de este plan.

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run src/lib/social/publish/documento.test.ts`
Expected: PASS (5 casos).

- [ ] **Step 5: Correr todo y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`

---

### Tarea 3: El barrido conoce el documento

**Files:**
- Modify: `src/lib/storage-gc.ts`
- Test: `src/lib/storage-gc.test.ts`

**Sin esta tarea la función se rompe en silencio:** el barrido borra de R2 todo objeto que ninguna tabla referencie, con una hora de gracia. El PDF desaparecería dentro de la hora y el enlace del mensaje daría 404 días después, cuando alguien comente.

**Nota sobre dónde probar:** `storage-gc.test.ts` prueba **solo funciones puras**
(`keysReferenciadas`, `objetosABorrar`) y no monta ningún doble de base; `urlsReferenciadas`
no tiene test hoy. Respeta ese estilo: lo que se prueba acá es la **lista** de columnas, no
la consulta.

Y por eso el diseño cambia respecto de la idea simple de «sumar una quinta consulta»: la
lista pasa a **generar** las consultas, de modo que no puedan separarse por construcción.
Una lista al lado de un `Promise.all` escrito a mano se desincroniza en cuanto alguien
añade una y olvida la otra — que es exactamente el fallo que esta tarea existe para impedir.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/storage-gc.test.ts`:

```ts
it('la lista de columnas de archivo cubre las seis que hay', () => {
  // Una lista escrita a mano envejece: el día que alguien agregue una columna que guarde
  // una URL nuestra y olvide registrarla, sus archivos se borran solos y nadie se entera
  // hasta que un enlace da 404. Este test es lo que obliga a tocar las dos cosas juntas.
  const nombres = COLUMNAS_DE_ARCHIVO.map((c) => `${c.tabla}.${c.columna}`).sort()
  expect(nombres).toEqual(
    [
      'links.image_url',
      'profiles.avatar_url',
      'profiles.og_image_url',
      'reglas_clave.documento_url',
      'scheduled_post_media.blob_url',
      'scheduled_posts.cover_url',
    ].sort(),
  )
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run src/lib/storage-gc.test.ts`
Expected: FAIL, `COLUMNAS_DE_ARCHIVO` no existe.

- [ ] **Step 3: La lista, y que ella genere las consultas**

En `src/lib/storage-gc.ts`, reemplazar el `Promise.all` escrito a mano por una lista que las
genera:

```ts
/**
 * Toda columna que puede guardar una URL de nuestro almacén. Es la fuente de verdad del
 * barrido: las consultas se generan de acá, así que una columna nueva sin registrar no
 * «se olvida en el barrido», simplemente no existe para él — y su test lo delata.
 *
 * `social_posts.thumbnail_url` no está a propósito: esa URL es de la red social, no
 * nuestra.
 */
export const COLUMNAS_DE_ARCHIVO = [
  { tabla: 'profiles', columna: 'avatar_url', ref: profiles.avatarUrl },
  { tabla: 'profiles', columna: 'og_image_url', ref: profiles.ogImageUrl },
  { tabla: 'links', columna: 'image_url', ref: links.imageUrl },
  { tabla: 'scheduled_posts', columna: 'cover_url', ref: scheduledPosts.coverUrl },
  { tabla: 'scheduled_post_media', columna: 'blob_url', ref: scheduledPostMedia.blobUrl },
  { tabla: 'reglas_clave', columna: 'documento_url', ref: reglasClave.documentoUrl },
] as const
```

y `urlsReferenciadas` pasa a recorrerla:

```ts
async function urlsReferenciadas(): Promise<Set<string>> {
  // A propósito sin dueño: el bucket es uno solo, así que lo referenciado por cualquier
  // usuario protege el archivo. Filtrar por dueño aquí borraría los archivos de los demás.
  const db = getDb()
  const filas = await Promise.all(
    COLUMNAS_DE_ARCHIVO.map((c) => db.select({ valor: c.ref }).from(getTableName(c.ref))),
  )
  const urls = new Set<string>()
  for (const grupo of filas) for (const f of grupo) if (f.valor) urls.add(f.valor)
  return urls
}
```

**Comprueba cómo se obtiene la tabla desde una columna en la versión de Drizzle instalada**
antes de escribir `getTableName`: si esa forma no existe o resulta enredada, incluye la
tabla en cada entrada de la lista (`tablaRef: profiles`) y úsala directamente. Lo que no se
puede perder es que la lista genere las consultas; el cómo es tuyo.

**Y corrige el comentario de la función**, que hoy dice «Las cinco columnas que pueden
guardar una URL nuestra»: ahora son seis, y ya no están escritas ahí.

- [ ] **Step 4: Correr y verlo pasar, y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`

---

### Tarea 4: El enlace viaja en el mensaje

**Files:**
- Modify: `src/lib/social/comentarios/reglas.ts` (`decidirAutomatica`)
- Modify: `src/lib/social/comentarios/automatico.ts` (las dos lecturas de reglas)
- Test: `src/lib/social/comentarios/reglas.test.ts`

**Interfaces:**
- Consumes: `ReglaLimpia` con `documentoUrl` (Tarea 1).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
it('añade el enlace del documento al final del mensaje', () => {
  const plan = decidirAutomatica({
    texto: 'quiero la GUIA',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-26T10:00:00Z'),
    now: new Date('2026-09-26T11:00:00Z'),
    privadoEncendido: true,
    regla: {
      palabra: 'guia',
      mensaje: 'Acá va 👇',
      respuestaPublica: 'Te lo mandé 📩',
      documentoUrl: 'https://media.ej.cl/reglas/abc.pdf',
    },
    sitioHost: 'ej.cl',
  })
  expect(plan.accion).toBe('responder')
  if (plan.accion !== 'responder') return
  expect(plan.privado).toContain('https://media.ej.cl/reglas/abc.pdf')
})

it('el enlace del dueño conserva su etiqueta: el documento va después', () => {
  // `enlaceMedible` etiqueta SOLO el primer enlace del mensaje que apunte al sitio. Si
  // el documento fuera primero, le robaría la etiqueta al enlace que el dueño escribió y
  // el dueño perdería la medición que hoy tiene.
  const plan = decidirAutomatica({
    texto: 'GUIA',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-26T10:00:00Z'),
    now: new Date('2026-09-26T11:00:00Z'),
    privadoEncendido: true,
    regla: {
      palabra: 'guia',
      mensaje: 'Mira https://ej.cl/curso',
      respuestaPublica: 'ok',
      documentoUrl: 'https://media.ej.cl/reglas/abc.pdf',
    },
    sitioHost: 'ej.cl',
  })
  if (plan.accion !== 'responder') return
  expect(plan.privado).toContain('https://ej.cl/curso?s=dm-guia')
  expect(plan.privado!.indexOf('ej.cl/curso')).toBeLessThan(plan.privado!.indexOf('reglas/abc.pdf'))
})

it('sin documento, el mensaje queda igual que hoy', () => {
  const plan = decidirAutomatica({
    texto: 'GUIA',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-26T10:00:00Z'),
    now: new Date('2026-09-26T11:00:00Z'),
    privadoEncendido: true,
    regla: { palabra: 'guia', mensaje: 'Acá va', respuestaPublica: 'ok', documentoUrl: null },
    sitioHost: 'ej.cl',
  })
  if (plan.accion !== 'responder') return
  expect(plan.privado).toBe('Acá va')
})

it('y cuando no hay privado, el enlace va en la respuesta pública', () => {
  // Es lo que hace que esta entrega sirva antes de que Meta apruebe el privado.
  const plan = decidirAutomatica({
    texto: 'GUIA',
    esPropio: false,
    yaRecibioPrivado: false,
    network: 'instagram',
    publishedAt: new Date('2026-09-26T10:00:00Z'),
    now: new Date('2026-09-26T11:00:00Z'),
    privadoEncendido: false,
    regla: {
      palabra: 'guia',
      mensaje: 'Acá va',
      respuestaPublica: 'ok',
      documentoUrl: 'https://media.ej.cl/reglas/abc.pdf',
    },
    sitioHost: 'ej.cl',
  })
  if (plan.accion !== 'responder') return
  expect(plan.publico).toContain('reglas/abc.pdf')
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/comentarios/reglas.test.ts`

- [ ] **Step 3: Componer el mensaje**

En `decidirAutomatica`, donde hoy dice:

```ts
  const mensaje = enlaceMedible(entrada.regla.mensaje, entrada.regla.palabra, entrada.sitioHost)
```

pasa a:

```ts
  // El documento va DESPUÉS del texto del dueño, y por eso `enlaceMedible` se aplica
  // antes de añadirlo: esa función etiqueta solo el primer enlace del mensaje que apunte
  // al sitio, así que un documento por delante le robaría la etiqueta al enlace que el
  // dueño escribió. El del documento no se etiqueta nunca —vive en el subdominio de R2 y
  // la analítica no lo ve— y eso está decidido en la spec, no olvidado.
  const texto = enlaceMedible(entrada.regla.mensaje, entrada.regla.palabra, entrada.sitioHost)
  const mensaje = entrada.regla.documentoUrl ? `${texto}\n\n${entrada.regla.documentoUrl}` : texto
```

El resto de la función no cambia: `mensaje` ya es lo que viaja por privado cuando hay privado y por público cuando no.

- [ ] **Step 4: Las lecturas traen la columna**

`reglasPara` y `reglasDeCuenta` en `automatico.ts` construyen `ReglaLimpia` desde la base: añadirles `documentoUrl: reglasClave.documentoUrl` al `select` y al objeto. Sin esto el plan recibe `undefined` y el enlace no se añade nunca, con los tests en verde porque son puros.

- [ ] **Step 5: Correr todo y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`

---

### Tarea 5: La API lo acepta de punta a punta

**Files:**
- Modify: `src/app/api/schedule/batch/route.ts`
- Modify: `src/lib/social/publish/batch.ts`
- Modify: `public/docs/api-editor.md`
- Test: `src/lib/social/publish/batch.test.ts`

**Interfaces:**
- Consumes: `documentoToBlob` (Tarea 2), `REGLA_DOCUMENTO` (Tarea 1).

- [ ] **Step 1: Escribir el test que falla**

`batch.test.ts` prueba **solo funciones puras**: respeta ese estilo. Lo que se puede probar ahí es la normalización en la puerta y el rechazo por forma:

```ts
it('una regla con documentoUrl que no es URL absoluta rechaza la fila', () => {
  const item = { ...base, regla: { palabra: 'GUIA', mensaje: 'x', documentoUrl: '/g.pdf' } }
  expect(validateBatchItem(item, now)).toBe(REGLA_DOCUMENTO)
})

it('una regla sin documentoUrl sigue siendo válida', () => {
  expect(validateBatchItem({ ...base, regla: { palabra: 'GUIA', mensaje: 'x' } }, now)).toBeNull()
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run src/lib/social/publish/batch.test.ts`

- [ ] **Step 3: Descargar y guardar el documento**

En `scheduleBatch`, junto a donde se resuelve la media y **antes** de insertar la regla:

```ts
      // Antes de escribir la regla: un documento que no se puede traer rechaza la fila
      // acá, no días después cuando alguien comente y el enlace apunte a nada.
      let documentoUrl: string | null = null
      if (reglaCheck.regla?.documentoUrl) {
        documentoUrl = await documentoToBlob(reglaCheck.regla.documentoUrl)
        if (!documentoUrl) {
          results.push({ index, ok: false, error: REGLA_DOCUMENTO })
          continue
        }
      }
```

y el insert de la regla pasa a guardar la URL de R2, no la del que llamó:

```ts
        await db.insert(reglasClave).values({ postId: post!.id, ...reglaCheck.regla, documentoUrl })
```

**Cuidado con el orden:** si el `continue` de arriba queda después de haber insertado el post o su media, deja un post sin regla y con archivos huérfanos. Colócalo donde el resto de los rechazos de fila ya están, y mira cómo lo hacen antes de escribirlo.

- [ ] **Step 4: Correr y verlo pasar**

- [ ] **Step 5: Documentar el campo para personas**

En `public/docs/api-editor.md`, en la sección `regla`: el campo `documentoUrl`, que es opcional, que solo acepta PDF hasta 25 MB, que se copia al almacenamiento propio, y **que viaja como enlace dentro del mensaje, no como adjunto**, con la razón en una línea. Sumar la frase de `REGLA_DOCUMENTO` a la tabla de errores.

- [ ] **Step 6: Commit**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`

---

### Tarea 6: La documentación para LLM, y el test que impide que mienta

**Files:**
- Create: `public/docs/api.json`
- Create: `public/docs/api-llm.md`
- Create: `src/lib/docs-api.test.ts`

- [ ] **Step 1: El esquema**

`public/docs/api.json`: JSON Schema del cuerpo de `POST /api/schedule/batch`. Cada campo con su tipo, si es obligatorio, y sus límites numéricos exactos: `fecha`, `texto`, `redes`, `cuentas`, `media`, `portada`, `atributos`, `opciones`, `regla` —con `palabra`, `mensaje`, `respuestaPublica` y `documentoUrl`—. Los topes salen de las constantes del código, no de la memoria: `MAX_PALABRA`, `MAX_MENSAJE`, `MAX_RESPUESTA`, `MAX_DOCUMENTO_BYTES`, `MAX_BATCH_ITEMS`.

- [ ] **Step 2: La guía compacta**

`public/docs/api-llm.md`, orientada a la tarea:

1. El cuerpo mínimo que funciona.
2. **Una sola petición copiable** que suba un video, le ponga su regla y su documento.
3. La tabla de frases de error **literales**, con qué campo las provoca.
4. **Lo que esta API no hace:** no edita ni borra un post programado, no lista cuentas (para eso `GET /api/schedule/posts`), no manda nada de inmediato.
5. **Lo que Meta no permite**, con la cita de la sección 2 de la spec: una sola respuesta privada por comentario, ningún mensaje más hasta que la persona conteste. Sin esto, un modelo va a proponer mandar el PDF adjunto — que es exactamente el error que la spec corrigió.

- [ ] **Step 3: El test que ata la documentación al código**

`src/lib/docs-api.test.ts`: lee los dos archivos de `public/docs/` e importa los validadores reales.

```ts
it('cada frase de error de la guía existe como constante del código', () => {
  const guia = readFileSync('public/docs/api-llm.md', 'utf8')
  for (const frase of [REGLA_PALABRA, REGLA_MENSAJE, REGLA_RESPUESTA, REGLA_DOCUMENTO]) {
    expect(guia).toContain(frase)
  }
})

it('cada límite del esquema es el que el validador aplica', () => {
  const esquema = JSON.parse(readFileSync('public/docs/api.json', 'utf8'))
  const regla = esquema.properties.posts.items.properties.regla.properties
  expect(regla.palabra.maxLength).toBe(MAX_PALABRA)
  expect(regla.mensaje.maxLength).toBe(MAX_MENSAJE)
  expect(regla.respuestaPublica.maxLength).toBe(MAX_RESPUESTA)
  // `maxBytes` no es una palabra clave de JSON Schema: es una anotación nuestra, porque el
  // tope no es del largo de la URL sino del archivo que hay detrás, y el esquema no tiene
  // forma de expresar eso. Los validadores la ignoran; el LLM la lee. Que quede dicho en
  // el propio esquema con una `description`, para que nadie la confunda con estándar.
  expect(regla.documentoUrl.maxBytes).toBe(MAX_DOCUMENTO_BYTES)
})

it('el esquema declara exactamente los campos que el validador lee', () => {
  // En los dos sentidos: un campo que el esquema inventa haría que un LLM mande algo
  // que se ignora, y uno que el validador lee y el esquema no declara haría que nunca
  // lo use. Las dos son formas de mentir.
  const esquema = JSON.parse(readFileSync('public/docs/api.json', 'utf8'))
  const declarados = Object.keys(esquema.properties.posts.items.properties).sort()
  expect(declarados).toEqual(
    ['atributos', 'cuentas', 'fecha', 'media', 'opciones', 'portada', 'redes', 'regla', 'texto'].sort(),
  )
})
```

La lista del tercer caso se comprueba contra `BatchItem` y contra la normalización de `route.ts` **al escribirla**, no de memoria.

- [ ] **Step 4: Correr, ver los tres en verde, y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`

---

## Cabos que este plan no cierra

- **Medir cuánta gente abre el documento.** Fuera de alcance por la spec, con su razón: haría falta una ruta que registre y redirija, y registrar del lado del servidor va contra la decisión de contar por baliza que este proyecto tomó.
- **Mandar el PDF de verdad si la persona contesta al privado.** La única forma de entregar el archivo; queda anotada en la spec como la continuación natural.
- **El privado sigue apagado.** `aplicarReglas` pasa `privadoEncendido: false` y eso no lo cambia este plan: depende del App Review de Meta. Hasta entonces el mensaje con su enlace va en la respuesta pública, que es donde esta entrega ya tiene valor.
- **`SITE_URL` en Vercel sigue pendiente, y ahora vale desde el primer día.** Sin ella el
  enlace que el dueño escribe en el mensaje no se etiqueta con `?s=dm-<palabra>` y se pierde
  la medición que ya tiene. No es el enlace del documento, que no se mide en ningún caso. No
  es código: recordárselo al dueño al cerrar la rama.
