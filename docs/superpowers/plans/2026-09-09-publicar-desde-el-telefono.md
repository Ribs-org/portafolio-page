# Publicar desde el teléfono — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una quinta pestaña «Publicar» en la app Android que arma un post con texto, fotos o video de la galería, redes y fecha, sube los archivos directo a R2 con URL firmada y lo deja programado, o lo manda a salir en los próximos cinco minutos.

**Architecture:** Tres rutas nuevas bajo `/api/mobile/` (chequeo del borrador, URL firmada por archivo, creación del post con URLs ya subidas) que reusan `validateScheduleDraft` y una inserción compartida con el compositor web. En la app, la lógica pura (tipo de archivo, máquina de pasos del envío) vive en `mobile/src/lib/` y se testea; el orquestador de red vive aparte y la pantalla solo dibuja.

**Tech Stack:** Next.js App Router, Drizzle + Neon, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Vitest. En la app: Expo SDK 57, expo-router, `expo-image-picker`, `expo-file-system` (API `File`), `@react-native-community/datetimepicker`, `expo-updates`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-publicar-desde-el-telefono-design.md`

La rama es `publicar-movil`, nacida de `almacen-r2`: usa `src/lib/storage.ts`, que el PR #62 todavía no fusiona. Ese PR va antes que este.

## Global Constraints

- Frases fijas en español en todo lo visible; detalle técnico solo a `console.error` truncado (`.slice(0, 300)`) en el sitio y a consola en la app.
- Las tres rutas nuevas exigen `Authorization: Bearer <token móvil>`; sin él: `401` con cuerpo de texto `No autorizado`. Errores de forma: `400` con `{ error }`.
- Las reglas de un post viven solo en `validateScheduleDraft`; nada las copia. La app solo impide mandar un formulario sin texto ni archivos.
- Tope de archivo: **500 MB**. Frase: `El archivo supera los 500 MB.`
- Las keys de R2 siguen el patrón `scheduled/<uuid>-<nombre>`; el barrido existente no distingue su origen.
- El PUT firmado dura **una hora** y lleva `Content-Type` y `Cache-Control: public, max-age=31536000, immutable` dentro de la firma.
- «Publicar ahora» = programar 60 segundos adelante. El motor de publicación no cambia.
- El token sigue viviendo solo en `expo-secure-store`. Cero dependencias de gráficos.
- Verificación en el sitio: `npx vitest run <archivo>` por task; al cerrar la mitad backend, `npm test && npm run typecheck && npm run lint && npx next build`. En la app, desde `mobile/`: `npx tsc --noEmit && npx vitest run && npm run lint`. **La app no se puede ejecutar en este entorno**; el dueño genera el APK al final.
- Commits en español, presente, estilo del repo, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git del ejecutor: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash, `git add` por archivo, padre verificado tras commitear.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/mobile-api.ts` | lo puro de las rutas nuevas: `prepararSubida`, `parseBorradorMovil`, `parseConteos`, `parseMediaMovil`, `resolverCuando`, frases |
| `src/lib/storage.ts` | `urlParaSubir` (PUT firmado) y `existe` (HEAD) sobre el mismo cliente |
| `src/lib/social/publish/crear.ts` | `crearPostProgramado`: las tres inserciones, compartidas |
| `src/lib/social/publish/batch.ts` | exporta `PUBLISHABLE` (hoy privado) |
| `src/app/admin/actions.ts` | `createScheduledPost` pasa a usar el helper |
| `src/app/api/mobile/schedule/check/route.ts` | `POST`: valida el borrador sin archivos |
| `src/app/api/mobile/upload-url/route.ts` | `POST`: firma una subida |
| `src/app/api/mobile/schedule/route.ts` | `POST` nuevo junto al `GET` existente: crea el post |
| `mobile/src/lib/publicar.ts` | lo puro de la app: `describirArchivo`, `reducirEnvio`, `textoConfirmacion`, `etiquetaEnvio`, `proximaHoraEnPunto`, `puedeEnviar` |
| `mobile/src/lib/cambios.ts` | la marca en memoria «escribí algo»: `anotarCambio`, `huboCambioDesde` |
| `mobile/src/lib/api.ts` | `apiPost` y `RechazoApi` junto a `apiGet` |
| `mobile/src/lib/subir.ts` | el orquestador con efectos: `ejecutarEnvio` |
| `mobile/src/lib/useScreenData.ts` | gana `refrescarSiVieja` |
| `mobile/src/components/ui.tsx` | `Chip` se muda acá desde contenido; entra `Miniatura` |
| `mobile/src/app/(tabs)/publicar.tsx` | la pantalla |
| `mobile/src/app/(tabs)/_layout.tsx` | la quinta pestaña, al centro |
| `mobile/src/app/(tabs)/calendario.tsx`, `index.tsx` | refrescan al recibir foco si hay cambio o la caché es vieja |
| `mobile/app.json`, `mobile/eas.json`, `mobile/README.md` | identidad 1.1.0, plugins, canales, instructivo |

---

### Task 1: Lo puro de las rutas nuevas

**Files:**
- Modify: `src/lib/mobile-api.ts`
- Modify: `src/lib/social/publish/batch.ts:48` (exportar `PUBLISHABLE`)
- Test: `src/lib/mobile-api.test.ts`

**Interfaces:**
- Consumes: `typeFromContentType(contentType): { mediaType, extension, tipo } | null` y `PUBLISHABLE: Set<string>` de `./social/publish/batch`.
- Produces (Task 4):
  - `prepararSubida(nombre: string, tipo: string, bytes: unknown, uuid: string): { key: string; mediaType: 'image' | 'video'; tipo: string } | { error: string }`
  - `parseBorradorMovil(body: unknown): BorradorMovil | { error: string }` con `BorradorMovil = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }`
  - `parseConteos(body: unknown): { fotos: number; videos: number } | { error: string }`
  - `parseMediaMovil(body: unknown): MediaMovil[] | { error: string }` con `MediaMovil = { url: string; mediaType: 'image' | 'video' }`
  - `resolverCuando(ahora: boolean, cuando: string | null, now: Date): Date | null`
  - Constantes: `MAX_BYTES_SUBIDA`, `AHORA_MS`, `TIPO_NO_PUBLICABLE`, `ARCHIVO_MUY_GRANDE`, `ARCHIVO_AJENO`, `ARCHIVO_FALTANTE`, `CUERPO_ILEGIBLE`, `NO_SE_GUARDO`.

- [ ] **Step 1: Exportar `PUBLISHABLE`**

En `src/lib/social/publish/batch.ts`, línea 48, cambia `const PUBLISHABLE` por `export const PUBLISHABLE`. Nada más.

- [ ] **Step 2: Escribir los tests que fallan**

Agrega al final de `src/lib/mobile-api.test.ts` (conserva el `describe('parseRango')` existente y sus imports; amplía el import):

```ts
import {
  AHORA_MS,
  ARCHIVO_MUY_GRANDE,
  CUERPO_ILEGIBLE,
  MAX_BYTES_SUBIDA,
  TIPO_NO_PUBLICABLE,
  parseBorradorMovil,
  parseConteos,
  parseMediaMovil,
  parseRango,
  prepararSubida,
  resolverCuando,
} from './mobile-api'

const UUID = '3f2a1b0c-0000-4000-8000-000000000000'

describe('prepararSubida', () => {
  it('arma la key con el prefijo del compositor, el uuid y el nombre base', () => {
    expect(prepararSubida('VID_001.mp4', 'video/mp4', 1000, UUID)).toEqual({
      key: `scheduled/${UUID}-VID_001.mp4`,
      mediaType: 'video',
      tipo: 'video/mp4',
    })
  })

  it('se queda solo con el nombre base: nada de rutas dentro de la key', () => {
    const r = prepararSubida('/storage/emulated/0/DCIM/foto.jpg', 'image/jpeg', 10, UUID)
    expect(r).toMatchObject({ key: `scheduled/${UUID}-foto.jpg` })
    const w = prepararSubida('C:\\Fotos\\foto.jpg', 'image/jpeg', 10, UUID)
    expect(w).toMatchObject({ key: `scheduled/${UUID}-foto.jpg` })
  })

  it('pone la extensión que dicta el tipo cuando el nombre no trae una', () => {
    expect(prepararSubida('clip', 'video/quicktime', 10, UUID)).toMatchObject({
      key: `scheduled/${UUID}-clip.mov`,
    })
    expect(prepararSubida('', 'image/png', 10, UUID)).toMatchObject({
      key: `scheduled/${UUID}-archivo.png`,
    })
  })

  it('recorta nombres largos por el frente, conservando la extensión', () => {
    const largo = `${'a'.repeat(200)}.mp4`
    const r = prepararSubida(largo, 'video/mp4', 10, UUID)
    if ('error' in r) throw new Error(r.error)
    const nombre = r.key.slice(`scheduled/${UUID}-`.length)
    expect(nombre).toHaveLength(100)
    expect(nombre.endsWith('.mp4')).toBe(true)
  })

  it('limpia el content-type de parámetros', () => {
    expect(prepararSubida('a.jpg', 'image/jpeg; charset=binary', 10, UUID)).toMatchObject({
      tipo: 'image/jpeg',
    })
  })

  it('rechaza lo que no es imagen ni video', () => {
    expect(prepararSubida('doc.pdf', 'application/pdf', 10, UUID)).toEqual({ error: TIPO_NO_PUBLICABLE })
    expect(prepararSubida('x', '', 10, UUID)).toEqual({ error: TIPO_NO_PUBLICABLE })
  })

  it('rechaza más de 500 MB y tamaños que no son un número positivo', () => {
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA + 1, UUID)).toEqual({
      error: ARCHIVO_MUY_GRANDE,
    })
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA, UUID)).toMatchObject({ mediaType: 'video' })
    expect(prepararSubida('v.mp4', 'video/mp4', 0, UUID)).toEqual({ error: CUERPO_ILEGIBLE })
    expect(prepararSubida('v.mp4', 'video/mp4', '12', UUID)).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseBorradorMovil', () => {
  const bueno = { texto: '  Hola  ', redes: ['instagram', 'youtube'], cuando: '2026-09-10T22:00:00.000Z', ahora: false }

  it('recorta el texto y conserva redes, cuando y ahora', () => {
    expect(parseBorradorMovil(bueno)).toEqual({
      texto: 'Hola',
      redes: ['instagram', 'youtube'],
      cuando: '2026-09-10T22:00:00.000Z',
      ahora: false,
    })
  })

  it('texto ausente es texto vacío, y cuando ausente es null', () => {
    expect(parseBorradorMovil({ redes: ['x'], ahora: true })).toEqual({
      texto: '',
      redes: ['x'],
      cuando: null,
      ahora: true,
    })
  })

  it('quita redes repetidas sin quejarse: el índice único las rechazaría después', () => {
    expect(parseBorradorMovil({ ...bueno, redes: ['x', 'x', 'threads'] })).toMatchObject({
      redes: ['x', 'threads'],
    })
  })

  it('rechaza una red desconocida o sin publicación con la frase del lote', () => {
    expect(parseBorradorMovil({ ...bueno, redes: ['tiktok'] })).toEqual({
      error: 'Red desconocida o sin publicación: tiktok.',
    })
  })

  it('rechaza cuerpos que no tienen la forma', () => {
    expect(parseBorradorMovil(null)).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil('hola')).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, redes: 'instagram' })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, redes: [1] })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, texto: 5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, cuando: 5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, ahora: 'sí' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseConteos', () => {
  it('lee fotos y videos como enteros no negativos, ausentes = 0', () => {
    expect(parseConteos({ fotos: 2, videos: 1 })).toEqual({ fotos: 2, videos: 1 })
    expect(parseConteos({})).toEqual({ fotos: 0, videos: 0 })
  })

  it('rechaza negativos, decimales y strings', () => {
    expect(parseConteos({ fotos: -1 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseConteos({ videos: 1.5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseConteos({ fotos: '2' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseMediaMovil', () => {
  it('lee la lista en su orden, que es el del carrusel', () => {
    expect(
      parseMediaMovil({
        media: [
          { url: 'https://m.x/scheduled/a.jpg', mediaType: 'image' },
          { url: 'https://m.x/scheduled/b.mp4', mediaType: 'video' },
        ],
      }),
    ).toEqual([
      { url: 'https://m.x/scheduled/a.jpg', mediaType: 'image' },
      { url: 'https://m.x/scheduled/b.mp4', mediaType: 'video' },
    ])
  })

  it('media ausente es lista vacía', () => {
    expect(parseMediaMovil({})).toEqual([])
  })

  it('rechaza entradas sin url o con un mediaType que no es image ni video', () => {
    expect(parseMediaMovil({ media: [{ mediaType: 'image' }] })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseMediaMovil({ media: [{ url: 'https://m.x/a', mediaType: 'audio' }] })).toEqual({
      error: CUERPO_ILEGIBLE,
    })
    expect(parseMediaMovil({ media: 'https://m.x/a' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('resolverCuando', () => {
  const now = new Date('2026-09-09T15:00:00Z')

  it('«ahora» es un minuto adelante: lo que el pinger recoge en su próxima pasada', () => {
    expect(resolverCuando(true, null, now)).toEqual(new Date(now.getTime() + AHORA_MS))
    // Con «ahora», la fecha que venga se ignora.
    expect(resolverCuando(true, '2030-01-01T00:00:00Z', now)).toEqual(new Date(now.getTime() + AHORA_MS))
  })

  it('sin «ahora», el instante ISO tal cual', () => {
    expect(resolverCuando(false, '2026-09-10T22:00:00.000Z', now)).toEqual(new Date('2026-09-10T22:00:00.000Z'))
  })

  it('sin fecha o con una ilegible devuelve null y validateScheduleDraft dice la frase', () => {
    expect(resolverCuando(false, null, now)).toBeNull()
    expect(resolverCuando(false, 'mañana', now)).toBeNull()
    expect(resolverCuando(false, '', now)).toBeNull()
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Run: `npx vitest run src/lib/mobile-api.test.ts`
Expected: FAIL — `prepararSubida` y compañía no existen.

- [ ] **Step 4: Implementar**

Agrega al final de `src/lib/mobile-api.ts` (amplía el import de arriba con `typeFromContentType` y `PUBLISHABLE`):

```ts
import { PUBLISHABLE, typeFromContentType } from './social/publish/batch'

/* ------------------------------------------------- publicar desde el teléfono -- */

export const MAX_BYTES_SUBIDA = 500 * 1024 * 1024
/** Un minuto adelante: el pinger de cinco minutos lo recoge en su próxima pasada. */
export const AHORA_MS = 60_000

export const TIPO_NO_PUBLICABLE = 'Ese tipo de archivo no se puede publicar.'
export const ARCHIVO_MUY_GRANDE = 'El archivo supera los 500 MB.'
export const ARCHIVO_AJENO = 'Un archivo no es del almacén.'
export const ARCHIVO_FALTANTE = 'Falta subir un archivo.'
export const CUERPO_ILEGIBLE = 'El cuerpo no se entendió.'
export const NO_SE_GUARDO = 'No se pudo guardar. Intenta de nuevo.'

// Las keys llevan el nombre que puso el teléfono; un nombre kilométrico no aporta y
// alarga cada URL que Meta y YouTube van a descargar.
const MAX_NOMBRE = 100

/**
 * Qué key y qué content-type tendrá un archivo que el teléfono está por subir. Solo el
 * nombre base: una ruta dentro de la key sería una carpeta nueva que el barrido no
 * espera. El uuid llega de afuera para que esto sea puro.
 */
export function prepararSubida(
  nombre: string,
  tipo: string,
  bytes: unknown,
  uuid: string,
): { key: string; mediaType: 'image' | 'video'; tipo: string } | { error: string } {
  const resuelto = typeFromContentType(tipo)
  if (!resuelto) return { error: TIPO_NO_PUBLICABLE }
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return { error: CUERPO_ILEGIBLE }
  if (bytes > MAX_BYTES_SUBIDA) return { error: ARCHIVO_MUY_GRANDE }

  const base = nombre.split(/[\\/]/).pop()?.trim() ?? ''
  const conExtension = /\.[A-Za-z0-9]{1,5}$/.test(base)
    ? base
    : `${base || 'archivo'}.${resuelto.extension}`
  return {
    key: `scheduled/${uuid}-${conExtension.slice(-MAX_NOMBRE)}`,
    mediaType: resuelto.mediaType,
    tipo: resuelto.tipo,
  }
}

export type BorradorMovil = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }
export type MediaMovil = { url: string; mediaType: 'image' | 'video' }

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** La parte del borrador que comparten el chequeo y la creación. */
export function parseBorradorMovil(body: unknown): BorradorMovil | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const { texto = '', redes, cuando = null, ahora = false } = body
  if (typeof texto !== 'string') return { error: CUERPO_ILEGIBLE }
  if (!Array.isArray(redes) || !redes.every((r) => typeof r === 'string')) return { error: CUERPO_ILEGIBLE }
  if (cuando !== null && typeof cuando !== 'string') return { error: CUERPO_ILEGIBLE }
  if (typeof ahora !== 'boolean') return { error: CUERPO_ILEGIBLE }
  // Repetidas se funden sin quejarse: el índice único (post, red) las rechazaría
  // después con un error de base que el teléfono no sabría explicar.
  const unicas = [...new Set(redes as string[])]
  for (const red of unicas) {
    if (!PUBLISHABLE.has(red)) return { error: `Red desconocida o sin publicación: ${red}.` }
  }
  return { texto: texto.trim(), redes: unicas, cuando, ahora }
}

function enteroNoNegativo(value: unknown): number | null {
  if (value === undefined) return 0
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** Cuántos archivos habrá, para chequear las reglas antes de subir ninguno. */
export function parseConteos(body: unknown): { fotos: number; videos: number } | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const fotos = enteroNoNegativo(body.fotos)
  const videos = enteroNoNegativo(body.videos)
  if (fotos === null || videos === null) return { error: CUERPO_ILEGIBLE }
  return { fotos, videos }
}

/** Las URLs ya subidas, en el orden en que se eligieron: ese es el del carrusel. */
export function parseMediaMovil(body: unknown): MediaMovil[] | { error: string } {
  if (!esObjeto(body)) return { error: CUERPO_ILEGIBLE }
  const { media = [] } = body
  if (!Array.isArray(media)) return { error: CUERPO_ILEGIBLE }
  const lista: MediaMovil[] = []
  for (const item of media) {
    if (!esObjeto(item) || typeof item.url !== 'string' || item.url === '') return { error: CUERPO_ILEGIBLE }
    if (item.mediaType !== 'image' && item.mediaType !== 'video') return { error: CUERPO_ILEGIBLE }
    lista.push({ url: item.url, mediaType: item.mediaType })
  }
  return lista
}

/**
 * El instante en que sale el post. El teléfono manda un ISO con su propia hora ya
 * resuelta: no hay hora de pared que reinterpretar. Null cae en la frase de
 * validateScheduleDraft, «La fecha no se entendió.».
 */
export function resolverCuando(ahora: boolean, cuando: string | null, now: Date): Date | null {
  if (ahora) return new Date(now.getTime() + AHORA_MS)
  if (!cuando) return null
  const fecha = new Date(cuando)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}
```

- [ ] **Step 5: Verde y commit**

Run: `npx vitest run src/lib/mobile-api.test.ts src/lib/social/publish/batch.test.ts`
Expected: PASS, todos.

```bash
git add src/lib/mobile-api.ts src/lib/mobile-api.test.ts src/lib/social/publish/batch.ts
git commit -m "Agrega lo puro de la subida desde el teléfono: key, borrador y fecha"
```

---

### Task 2: La capa de almacenamiento firma subidas y comprueba objetos

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `package.json` (entra `@aws-sdk/s3-request-presigner`)
- Test: `src/lib/storage.test.ts`

**Interfaces:**
- Consumes: `config()`, `getCliente()`, `urlPublica`, `keyDesdeUrl`, `SIN_ALMACEN` ya en el archivo.
- Produces (Task 4): `urlParaSubir(key: string, contentType: string): Promise<{ subir: string; publica: string }>`; `existe(url: string): Promise<boolean>`; `CACHE_INMUTABLE: string`.

- [ ] **Step 1: Instalar el firmador**

Run: `npm install @aws-sdk/s3-request-presigner`
Expected: entra en `dependencies` de `package.json`, misma familia que `@aws-sdk/client-s3`.

- [ ] **Step 2: Escribir los tests que fallan**

Agrega al final de `src/lib/storage.test.ts` (amplía el import):

```ts
import { afterEach, beforeEach } from 'vitest'
import { SIN_ALMACEN, existe, keyDesdeUrl, urlParaSubir, urlPublica } from './storage'

describe('sin R2 configurado', () => {
  const guardado: Record<string, string | undefined> = {}
  const VARS = ['R2_BUCKET', 'R2_PUBLIC_BASE', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']

  beforeEach(() => {
    for (const v of VARS) {
      guardado[v] = process.env[v]
      delete process.env[v]
    }
  })
  afterEach(() => {
    for (const v of VARS) {
      if (guardado[v] !== undefined) process.env[v] = guardado[v]
    }
  })

  it('urlParaSubir lanza la misma frase que guardar()', async () => {
    await expect(urlParaSubir('scheduled/a.mp4', 'video/mp4')).rejects.toThrow(SIN_ALMACEN)
  })

  it('existe() es falso: sin almacén nada existe', async () => {
    expect(await existe('https://media.ejemplo.com/scheduled/a.mp4')).toBe(false)
  })
})

describe('existe con una URL ajena', () => {
  it('es falso sin tocar la red, igual que borrar() no toca lo ajeno', async () => {
    process.env.R2_BUCKET = 'b'
    process.env.R2_PUBLIC_BASE = BASE
    try {
      expect(await existe('https://scontent.cdninstagram.com/v/foto.jpg')).toBe(false)
    } finally {
      delete process.env.R2_BUCKET
      delete process.env.R2_PUBLIC_BASE
    }
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Run: `npx vitest run src/lib/storage.test.ts`
Expected: FAIL — `existe` y `urlParaSubir` no existen.

- [ ] **Step 4: Implementar**

En `src/lib/storage.ts`:

1. Amplía el import de `@aws-sdk/client-s3` con `HeadObjectCommand`, y agrega
   `import { getSignedUrl } from '@aws-sdk/s3-request-presigner'`.
2. Bajo `SIN_ALMACEN`, agrega:

```ts
/**
 * Cada key lleva un UUID: nunca cambia de contenido, así que cachearla para siempre es
 * seguro. R2 no pone un default largo por su cuenta. Compartido entre `guardar` y la
 * subida firmada para que un objeto subido desde el teléfono quede igual que uno subido
 * por el servidor.
 */
export const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'
/** Una hora: un video de 200 MB por datos móviles cabe de sobra, y un link filtrado muere solo. */
const SUBIDA_SEGUNDOS = 3600
```

3. En `guardar`, reemplaza el literal `CacheControl: 'public, max-age=31536000, immutable'` (y su comentario de dos líneas encima) por `CacheControl: CACHE_INMUTABLE`.
4. Después de `guardar`, agrega:

```ts
/**
 * Un PUT firmado para que el teléfono suba directo a R2, sin pasar por la función.
 * `Content-Type` y `Cache-Control` viajan dentro de la firma: el cliente tiene que
 * mandarlos tal cual o R2 responde 403, y a cambio nadie puede colar otro tipo.
 */
export async function urlParaSubir(
  key: string,
  contentType: string,
): Promise<{ subir: string; publica: string }> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  const subir = await getSignedUrl(
    getCliente(),
    new PutObjectCommand({
      Bucket: conf.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: CACHE_INMUTABLE,
    }),
    { expiresIn: SUBIDA_SEGUNDOS },
  )
  return { subir, publica: urlPublica(conf.base, key) }
}

/**
 * Si el objeto está en el bucket. Falso ante una URL ajena o sin almacén: lo que no es
 * nuestro no puede «existir» para un post. Cualquier otro error de R2 sube, porque no
 * es lo mismo «no está» que «no pude preguntar».
 */
export async function existe(url: string): Promise<boolean> {
  const conf = config()
  if (!conf) return false
  const key = keyDesdeUrl(conf.base, url)
  if (!key) return false
  try {
    await getCliente().send(new HeadObjectCommand({ Bucket: conf.bucket, Key: key }))
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') return false
    throw error
  }
}
```

- [ ] **Step 5: Verde y commit**

Run: `npx vitest run src/lib/storage.test.ts src/lib/storage-gc.test.ts && npm run typecheck`
Expected: PASS y sin errores de tipos.

```bash
git add package.json package-lock.json src/lib/storage.ts src/lib/storage.test.ts
git commit -m "Firma subidas directas a R2 y comprueba que un objeto existe"
```

---

### Task 3: La inserción compartida de un post programado

**Files:**
- Create: `src/lib/social/publish/crear.ts`
- Modify: `src/app/admin/actions.ts:408-444` (`createScheduledPost`)

**Interfaces:**
- Produces (Task 4): `crearPostProgramado(input: { caption: string; scheduledAt: Date; media: MediaSubida[]; networks: string[] }): Promise<string>` con `MediaSubida = { url: string; mediaType: 'image' | 'video' }`.

No hay test nuevo: son tres inserciones de Drizzle, y el repo no prueba escrituras de base. La verificación es que el compositor web sigue compilando sobre el helper y el lint pasa.

- [ ] **Step 1: El helper**

```ts
// src/lib/social/publish/crear.ts
import { getDb, scheduledPostMedia, scheduledPosts, scheduledPostTargets } from '@/db'

export type MediaSubida = { url: string; mediaType: 'image' | 'video' }

/**
 * Las tres inserciones de un post programado, en el orden que el resto del sistema
 * espera: el post, su media en posición de carrusel, y un target por red. Compartido
 * por el compositor web y la ruta móvil para que ambos escriban exactamente lo mismo.
 * La media ya vive en el almacén: subirla es problema de quien llama.
 */
export async function crearPostProgramado(input: {
  caption: string
  scheduledAt: Date
  media: MediaSubida[]
  networks: string[]
}): Promise<string> {
  const db = getDb()
  const [post] = await db
    .insert(scheduledPosts)
    .values({ caption: input.caption, scheduledAt: input.scheduledAt })
    .returning()
  if (input.media.length > 0) {
    await db.insert(scheduledPostMedia).values(
      input.media.map((m, position) => ({
        postId: post!.id,
        blobUrl: m.url,
        mediaType: m.mediaType,
        position,
      })),
    )
  }
  await db
    .insert(scheduledPostTargets)
    .values(input.networks.map((network) => ({ postId: post!.id, network })))
  return post!.id
}
```

- [ ] **Step 2: El compositor web lo usa**

En `src/app/admin/actions.ts`, agrega el import `import { crearPostProgramado } from '@/lib/social/publish/crear'` junto a los otros de `publish/`, y reemplaza en `createScheduledPost` el bloque que va desde `const db = getDb()` hasta el `await db.insert(scheduledPostTargets)…` (líneas 431-440) por:

```ts
  await crearPostProgramado({ caption, scheduledAt: scheduledAt!, media: uploaded, networks })
```

`uploaded` ya tiene la forma `Array<{ url: string; mediaType: 'image' | 'video' }>`. Deja el `revalidatePath` y el `return { ok: true }` como están. No quites imports de `scheduledPosts`, `scheduledPostMedia` ni `scheduledPostTargets` de `actions.ts`: `updateScheduledPost` los sigue usando.

- [ ] **Step 3: Verificar y commitear**

Run: `npm run typecheck && npm run lint && npm test`
Expected: sin errores; ningún test cambia.

```bash
git add src/lib/social/publish/crear.ts src/app/admin/actions.ts
git commit -m "Comparte la inserción de un post programado entre el panel y la app"
```

---

### Task 4: Las tres rutas

**Files:**
- Create: `src/app/api/mobile/schedule/check/route.ts`
- Create: `src/app/api/mobile/upload-url/route.ts`
- Modify: `src/app/api/mobile/schedule/route.ts` (agregar `POST`)

**Interfaces:**
- Consumes: Task 1 (`prepararSubida`, `parseBorradorMovil`, `parseConteos`, `parseMediaMovil`, `resolverCuando`, frases), Task 2 (`urlParaSubir`, `existe`, `basePublica`, `keyDesdeUrl`, `SIN_ALMACEN`), Task 3 (`crearPostProgramado`), `requireMobile`, `validateScheduleDraft`, `isoInZone`, `SITE_TIMEZONE`.
- Produces (la app, Tasks 7-8): los tres contratos HTTP del spec.

- [ ] **Step 1: El chequeo del borrador**

```ts
// src/app/api/mobile/schedule/check/route.ts
import { NextResponse } from 'next/server'
import {
  CUERPO_ILEGIBLE,
  parseBorradorMovil,
  parseConteos,
  requireMobile,
  resolverCuando,
} from '@/lib/mobile-api'
import { validateScheduleDraft } from '@/lib/social/publish/validate'

export const dynamic = 'force-dynamic'

/**
 * Las mismas reglas que la creación, antes de subir un solo byte: rechazar «X no
 * recibe video» después de un video de 200 MB por datos móviles es tirar el tráfico
 * del dueño. Solo cuenta archivos; las URLs todavía no existen.
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const borrador = parseBorradorMovil(body)
  if ('error' in borrador) return NextResponse.json({ error: borrador.error }, { status: 400 })
  const conteos = parseConteos(body)
  if ('error' in conteos) return NextResponse.json({ error: conteos.error }, { status: 400 })

  const now = new Date()
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: conteos.fotos,
      videoCount: conteos.videos,
      networks: borrador.redes,
      scheduledAt: resolverCuando(borrador.ahora, borrador.cuando, now),
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: La URL firmada**

```ts
// src/app/api/mobile/upload-url/route.ts
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { CUERPO_ILEGIBLE, prepararSubida, requireMobile } from '@/lib/mobile-api'
import { SIN_ALMACEN, urlParaSubir } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Un PUT firmado por archivo. El teléfono sube directo a R2 con él: un video del
 * teléfono pasa los 100 MB que Vercel acepta de cuerpo, y así ningún byte cruza la
 * función. Lo que se suba y nunca llegue a un post lo borra el barrido diario.
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: { nombre?: unknown; tipo?: unknown; bytes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const nombre = typeof body.nombre === 'string' ? body.nombre : ''
  const tipo = typeof body.tipo === 'string' ? body.tipo : ''
  const subida = prepararSubida(nombre, tipo, body.bytes, randomUUID())
  if ('error' in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

  try {
    const { subir, publica } = await urlParaSubir(subida.key, subida.tipo)
    return NextResponse.json({ subir, publica, mediaType: subida.mediaType })
  } catch (error) {
    console.error('upload-url:', String(error).slice(0, 300))
    return NextResponse.json({ error: SIN_ALMACEN }, { status: 500 })
  }
}
```

- [ ] **Step 3: La creación**

En `src/app/api/mobile/schedule/route.ts`, amplía los imports:

```ts
import {
  ARCHIVO_AJENO,
  ARCHIVO_FALTANTE,
  CUERPO_ILEGIBLE,
  NO_SE_GUARDO,
  parseBorradorMovil,
  parseMediaMovil,
  requireMobile,
  resolverCuando,
} from '@/lib/mobile-api'
import { crearPostProgramado } from '@/lib/social/publish/crear'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { basePublica, existe, keyDesdeUrl } from '@/lib/storage'
```

y agrega al final del archivo, después del `GET`:

```ts
/**
 * El post con sus archivos ya en R2. Dos comprobaciones antes de las reglas: que cada
 * URL sea del almacén propio y bajo `scheduled/` (un cuerpo forjado no puede apuntar a
 * cualquier URL de internet), y que el objeto exista (un post que referencia una subida
 * que nunca terminó fallaría en el publisher con tres reintentos y un error confuso).
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const borrador = parseBorradorMovil(body)
  if ('error' in borrador) return NextResponse.json({ error: borrador.error }, { status: 400 })
  const media = parseMediaMovil(body)
  if ('error' in media) return NextResponse.json({ error: media.error }, { status: 400 })

  const base = basePublica()
  for (const m of media) {
    const key = base ? keyDesdeUrl(base, m.url) : null
    if (!key || !key.startsWith('scheduled/')) {
      return NextResponse.json({ error: ARCHIVO_AJENO }, { status: 400 })
    }
  }
  try {
    for (const m of media) {
      if (!(await existe(m.url))) return NextResponse.json({ error: ARCHIVO_FALTANTE }, { status: 400 })
    }
  } catch (error) {
    console.error('schedule/existe:', String(error).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }

  const now = new Date()
  const scheduledAt = resolverCuando(borrador.ahora, borrador.cuando, now)
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: media.filter((m) => m.mediaType === 'image').length,
      videoCount: media.filter((m) => m.mediaType === 'video').length,
      networks: borrador.redes,
      scheduledAt,
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  try {
    const id = await crearPostProgramado({
      caption: borrador.texto,
      scheduledAt: scheduledAt!,
      media,
      networks: borrador.redes,
    })
    return NextResponse.json({ id, cuando: isoInZone(scheduledAt!, SITE_TIMEZONE) })
  } catch (dbError) {
    console.error('schedule/crear:', String(dbError).slice(0, 300))
    return NextResponse.json({ error: NO_SE_GUARDO }, { status: 500 })
  }
}
```

`scheduledAt!` es seguro: `validateScheduleDraft` devuelve «La fecha no se entendió.» cuando es null, y ya retornamos.

- [ ] **Step 4: Verificar y commitear**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: verde, y en la tabla del build aparecen `/api/mobile/schedule/check` y `/api/mobile/upload-url`.

```bash
git add src/app/api/mobile/schedule/check/route.ts src/app/api/mobile/upload-url/route.ts src/app/api/mobile/schedule/route.ts
git commit -m "Agrega el chequeo, la URL firmada y la creación de posts desde la app"
```

---

### Task 5: Los módulos nativos y la identidad 1.1.0

**Files:**
- Modify: `mobile/package.json` (vía `expo install`), `mobile/app.json`, `mobile/eas.json`

**Interfaces:**
- Produces (Tasks 7-8): `expo-image-picker`, `expo-file-system`, `@react-native-community/datetimepicker`, `expo-updates` instalados en las versiones que fija el SDK 57.

- [ ] **Step 1: Instalar con la herramienta de Expo, no con npm**

Desde `mobile/`:

Run: `npx expo install expo-image-picker expo-file-system @react-native-community/datetimepicker expo-updates`
Expected: los cuatro entran en `dependencies` con las versiones que el SDK 57 fija. Si alguno pide confirmación de versión, acepta la que propone Expo.

- [ ] **Step 2: `app.json`**

Dentro de `expo`:

1. `"version": "1.0.0"` → `"version": "1.1.0"`.
2. Agrega, al mismo nivel que `version`: `"runtimeVersion": { "policy": "appVersion" }`.
   Con esta política, cada `version` distinta es un runtime distinto: una actualización
   por aire solo llega a los APK con esa misma versión, que es lo que los módulos
   nativos exigen.
3. En `plugins`, después de `"expo-secure-store"`:

```json
      [
        "expo-image-picker",
        {
          "photosPermission": "Para elegir las fotos y videos que vas a publicar."
        }
      ]
```

No agregues `updates.url` ni `extra.eas.projectId` a mano: los escribe
`eas update:configure` con la cuenta del dueño (Task 9 lo documenta).

- [ ] **Step 3: `eas.json`**

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "preview": {
      "android": { "buildType": "apk" },
      "distribution": "internal",
      "channel": "preview"
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "channel": "production"
    }
  }
}
```

- [ ] **Step 4: Verificar y commitear**

Desde `mobile/`: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: verde; nada usa todavía los módulos nuevos.

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/eas.json
git commit -m "Instala galería, subida desde disco, selector de fecha y actualizaciones por aire"
```

---

### Task 6: Lo puro de la app

**Files:**
- Create: `mobile/src/lib/publicar.ts`, `mobile/src/lib/cambios.ts`
- Test: `mobile/src/lib/publicar.test.ts`, `mobile/src/lib/cambios.test.ts`

**Interfaces:**
- Produces (Tasks 7-8), de `publicar.ts`:
  - `type Elegido = { uri: string; nombre: string; tipo: string; bytes: number; mediaType: 'image' | 'video' }`
  - `describirArchivo(asset: { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null }): Elegido | { error: string }`
  - `type Envio`, `type Evento`, `type Retomar`, `reducirEnvio(estado: Envio, evento: Evento): Envio`, `ENVIO_INICIAL: Envio`
  - `etiquetaEnvio(estado: Envio): string | null`
  - `textoConfirmacion(redes: string[]): string`
  - `proximaHoraEnPunto(now: Date): Date`
  - `puedeEnviar(texto: string, archivos: number): boolean`
  - Constantes: `MAX_BYTES`, `MAX_ARCHIVOS = 10`, `REDES_PUBLICABLES`, `TIPO_NO_PUBLICABLE`, `ARCHIVO_MUY_GRANDE`, `SIN_SENAL`, `SIN_SENAL_SUBIDA`.
- Produces, de `cambios.ts`: `anotarCambio(now?: number): void`, `huboCambioDesde(savedAt: number | null): boolean`.

- [ ] **Step 1: Tests de `publicar.ts`**

```ts
// mobile/src/lib/publicar.test.ts
import { describe, expect, it } from 'vitest'

import {
  ARCHIVO_MUY_GRANDE,
  ENVIO_INICIAL,
  MAX_BYTES,
  SIN_SENAL_SUBIDA,
  TIPO_NO_PUBLICABLE,
  describirArchivo,
  etiquetaEnvio,
  proximaHoraEnPunto,
  puedeEnviar,
  reducirEnvio,
  textoConfirmacion,
  type Envio,
} from './publicar'

describe('describirArchivo', () => {
  it('toma el tipo que entrega el selector', () => {
    expect(
      describirArchivo({ uri: 'content://media/1', fileName: 'VID_1.mp4', mimeType: 'video/mp4', fileSize: 500 }),
    ).toEqual({ uri: 'content://media/1', nombre: 'VID_1.mp4', tipo: 'video/mp4', bytes: 500, mediaType: 'video' })
  })

  it('sin mimeType, lo deduce de la extensión con la misma tabla del sitio', () => {
    expect(describirArchivo({ uri: 'file:///a/clip.MOV', fileName: 'clip.MOV', fileSize: 1 })).toMatchObject({
      tipo: 'video/quicktime',
      mediaType: 'video',
    })
    expect(describirArchivo({ uri: 'file:///a/f.jpg', fileName: 'f.jpg', fileSize: 1 })).toMatchObject({
      tipo: 'image/jpeg',
      mediaType: 'image',
    })
  })

  it('sin nombre, usa el último segmento de la uri', () => {
    expect(describirArchivo({ uri: 'file:///cache/foto.png', mimeType: 'image/png', fileSize: 1 })).toMatchObject({
      nombre: 'foto.png',
    })
  })

  it('rechaza lo que no es imagen ni video, y lo que no tiene ni tipo ni extensión', () => {
    expect(describirArchivo({ uri: 'file:///a/doc.pdf', fileName: 'doc.pdf', mimeType: 'application/pdf', fileSize: 1 })).toEqual({
      error: TIPO_NO_PUBLICABLE,
    })
    expect(describirArchivo({ uri: 'content://media/9', fileSize: 1 })).toEqual({ error: TIPO_NO_PUBLICABLE })
  })

  it('rechaza más de 500 MB antes de pedir una URL que el servidor va a negar', () => {
    expect(describirArchivo({ uri: 'file:///v.mp4', mimeType: 'video/mp4', fileSize: MAX_BYTES + 1 })).toEqual({
      error: ARCHIVO_MUY_GRANDE,
    })
  })

  it('un tamaño desconocido no bloquea: el servidor es la puerta', () => {
    expect(describirArchivo({ uri: 'file:///v.mp4', mimeType: 'video/mp4' })).toMatchObject({ bytes: 0 })
  })
})

describe('reducirEnvio', () => {
  it('recorre el camino feliz', () => {
    let e: Envio = ENVIO_INICIAL
    e = reducirEnvio(e, { tipo: 'chequear' })
    expect(e).toEqual({ paso: 'chequeando' })
    e = reducirEnvio(e, { tipo: 'subir', indice: 0, total: 2 })
    expect(e).toEqual({ paso: 'subiendo', indice: 0, total: 2, progreso: 0 })
    e = reducirEnvio(e, { tipo: 'progreso', progreso: 0.5 })
    expect(e).toEqual({ paso: 'subiendo', indice: 0, total: 2, progreso: 0.5 })
    e = reducirEnvio(e, { tipo: 'subir', indice: 1, total: 2 })
    e = reducirEnvio(e, { tipo: 'crear' })
    expect(e).toEqual({ paso: 'creando' })
    e = reducirEnvio(e, { tipo: 'hecho' })
    expect(e).toEqual({ paso: 'hecho' })
  })

  it('el progreso se acota a [0, 1] y solo cuenta mientras sube', () => {
    const subiendo: Envio = { paso: 'subiendo', indice: 0, total: 1, progreso: 0 }
    expect(reducirEnvio(subiendo, { tipo: 'progreso', progreso: 1.7 })).toMatchObject({ progreso: 1 })
    expect(reducirEnvio(subiendo, { tipo: 'progreso', progreso: -1 })).toMatchObject({ progreso: 0 })
    expect(reducirEnvio({ paso: 'creando' }, { tipo: 'progreso', progreso: 0.5 })).toEqual({ paso: 'creando' })
  })

  it('un rechazo del servidor vuelve a listo con la frase: hay algo que cambiar', () => {
    expect(reducirEnvio({ paso: 'chequeando' }, { tipo: 'rechazado', mensaje: 'X recibe hasta cuatro imágenes.' })).toEqual({
      paso: 'listo',
      error: 'X recibe hasta cuatro imágenes.',
    })
  })

  it('un fallo de red guarda desde dónde retomar, y reintentar vuelve exactamente ahí', () => {
    const retomar = { paso: 'subiendo', indice: 1, total: 3, progreso: 0 } as const
    const caido = reducirEnvio(
      { paso: 'subiendo', indice: 1, total: 3, progreso: 0.4 },
      { tipo: 'fallo', mensaje: SIN_SENAL_SUBIDA, retomar },
    )
    expect(caido).toEqual({ paso: 'error', mensaje: SIN_SENAL_SUBIDA, retomar })
    expect(reducirEnvio(caido, { tipo: 'reintentar' })).toEqual(retomar)
  })

  it('reintentar fuera de un error no hace nada', () => {
    expect(reducirEnvio({ paso: 'creando' }, { tipo: 'reintentar' })).toEqual({ paso: 'creando' })
  })

  it('cancelar vuelve a listo sin error', () => {
    expect(reducirEnvio({ paso: 'subiendo', indice: 0, total: 1, progreso: 0.3 }, { tipo: 'cancelar' })).toEqual(ENVIO_INICIAL)
  })
})

describe('etiquetaEnvio', () => {
  it('dice en qué va, en español, con el archivo y el porcentaje', () => {
    expect(etiquetaEnvio({ paso: 'listo', error: null })).toBeNull()
    expect(etiquetaEnvio({ paso: 'chequeando' })).toBe('Comprobando…')
    expect(etiquetaEnvio({ paso: 'subiendo', indice: 1, total: 3, progreso: 0.456 })).toBe('Subiendo 2 de 3 · 46 %')
    expect(etiquetaEnvio({ paso: 'creando' })).toBe('Guardando…')
    expect(etiquetaEnvio({ paso: 'hecho' })).toBe('Listo')
    expect(etiquetaEnvio({ paso: 'error', mensaje: 'x', retomar: { paso: 'creando' } })).toBeNull()
  })
})

describe('textoConfirmacion', () => {
  it('nombra las redes con «y» al final y avisa el plazo', () => {
    expect(textoConfirmacion(['instagram'])).toBe('¿Publicar ahora en Instagram? Saldrá en los próximos 5 minutos.')
    expect(textoConfirmacion(['instagram', 'youtube'])).toBe(
      '¿Publicar ahora en Instagram y YouTube? Saldrá en los próximos 5 minutos.',
    )
    expect(textoConfirmacion(['instagram', 'facebook', 'x'])).toBe(
      '¿Publicar ahora en Instagram, Facebook y X? Saldrá en los próximos 5 minutos.',
    )
  })
})

describe('proximaHoraEnPunto', () => {
  it('redondea hacia arriba a la hora siguiente', () => {
    expect(proximaHoraEnPunto(new Date(2026, 8, 9, 15, 20, 30))).toEqual(new Date(2026, 8, 9, 16, 0, 0, 0))
  })

  it('en punto exacto, igual salta a la siguiente: «la próxima» nunca es ahora mismo', () => {
    expect(proximaHoraEnPunto(new Date(2026, 8, 9, 15, 0, 0))).toEqual(new Date(2026, 8, 9, 16, 0, 0, 0))
  })
})

describe('puedeEnviar', () => {
  it('solo impide mandar un formulario sin nada: el resto lo dice el servidor', () => {
    expect(puedeEnviar('', 0)).toBe(false)
    expect(puedeEnviar('   ', 0)).toBe(false)
    expect(puedeEnviar('Hola', 0)).toBe(true)
    expect(puedeEnviar('', 1)).toBe(true)
  })
})
```

- [ ] **Step 2: Tests de `cambios.ts`**

```ts
// mobile/src/lib/cambios.test.ts
import { describe, expect, it } from 'vitest'

import { anotarCambio, huboCambioDesde } from './cambios'

describe('cambios', () => {
  it('sin marca de caché siempre hay que refrescar', () => {
    expect(huboCambioDesde(null)).toBe(true)
  })

  it('una caché guardada después del último cambio no necesita refresco', () => {
    anotarCambio(1_000)
    expect(huboCambioDesde(2_000)).toBe(false)
  })

  it('una caché guardada antes del último cambio sí', () => {
    anotarCambio(5_000)
    expect(huboCambioDesde(4_000)).toBe(true)
  })
})
```

- [ ] **Step 3: Verificar que fallan**

Desde `mobile/`: `npx vitest run`
Expected: FAIL — los módulos no existen.

- [ ] **Step 4: Implementar `publicar.ts`**

```ts
// mobile/src/lib/publicar.ts
import { NOMBRE_RED } from './tipos'

export const MAX_BYTES = 500 * 1024 * 1024
export const MAX_ARCHIVOS = 10
/** Las cinco con publisher; TikTok lee métricas pero no publica. */
export const REDES_PUBLICABLES = ['instagram', 'facebook', 'youtube', 'threads', 'x']

export const TIPO_NO_PUBLICABLE = 'Ese tipo de archivo no se puede publicar.'
export const ARCHIVO_MUY_GRANDE = 'El archivo supera los 500 MB.'
export const SIN_SENAL = 'No se pudo conectar. Revisa tu señal.'
export const SIN_SENAL_SUBIDA = 'No se pudo subir el archivo. Revisa tu señal.'

// La misma tabla que tipoArchivo en el sitio (src/lib/social/publish/batch.ts): el
// selector de Android a veces entrega mimeType vacío para un .mov.
const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

export type Elegido = {
  uri: string
  nombre: string
  tipo: string
  bytes: number
  mediaType: 'image' | 'video'
}

/**
 * Lo que la app necesita saber de un archivo elegido, resuelto una vez: el tipo (del
 * selector o de la extensión), el nombre (del selector o de la uri) y el tamaño. Un
 * tamaño desconocido no bloquea: el servidor es la puerta; acá solo se evita pedir una
 * URL que sabemos que va a negar.
 */
export function describirArchivo(asset: {
  uri: string
  fileName?: string | null
  mimeType?: string | null
  fileSize?: number | null
}): Elegido | { error: string } {
  const nombre = asset.fileName?.trim() || asset.uri.split('/').pop() || 'archivo'
  const extension = nombre.split('.').pop()?.toLowerCase() ?? ''
  const declarado = asset.mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  const tipo =
    declarado.startsWith('image/') || declarado.startsWith('video/')
      ? declarado
      : (TIPO_POR_EXTENSION[extension] ?? '')
  if (!tipo) return { error: TIPO_NO_PUBLICABLE }
  const bytes = asset.fileSize ?? 0
  if (bytes > MAX_BYTES) return { error: ARCHIVO_MUY_GRANDE }
  return { uri: asset.uri, nombre, tipo, bytes, mediaType: tipo.startsWith('video/') ? 'video' : 'image' }
}

/** Desde dónde retoma un envío caído: el chequeo, un archivo en particular, o la creación. */
export type Retomar =
  | { paso: 'chequeando' }
  | { paso: 'subiendo'; indice: number; total: number; progreso: number }
  | { paso: 'creando' }

export type Envio =
  | { paso: 'listo'; error: string | null }
  | Retomar
  | { paso: 'hecho' }
  | { paso: 'error'; mensaje: string; retomar: Retomar }

export type Evento =
  | { tipo: 'chequear' }
  | { tipo: 'rechazado'; mensaje: string }
  | { tipo: 'subir'; indice: number; total: number }
  | { tipo: 'progreso'; progreso: number }
  | { tipo: 'crear' }
  | { tipo: 'hecho' }
  | { tipo: 'fallo'; mensaje: string; retomar: Retomar }
  | { tipo: 'cancelar' }
  | { tipo: 'reintentar' }

export const ENVIO_INICIAL: Envio = { paso: 'listo', error: null }

/**
 * La máquina de pasos del envío. Dos salidas distintas a propósito: «rechazado» es el
 * servidor diciendo que algo del borrador está mal (vuelve a listo con la frase, el
 * dueño tiene que cambiar algo), y «fallo» es la red que se cayó (queda en error con
 * desde dónde retomar, porque el borrador está bien).
 */
export function reducirEnvio(estado: Envio, evento: Evento): Envio {
  switch (evento.tipo) {
    case 'chequear':
      return { paso: 'chequeando' }
    case 'rechazado':
      return { paso: 'listo', error: evento.mensaje }
    case 'subir':
      return { paso: 'subiendo', indice: evento.indice, total: evento.total, progreso: 0 }
    case 'progreso':
      return estado.paso === 'subiendo'
        ? { ...estado, progreso: Math.min(1, Math.max(0, evento.progreso)) }
        : estado
    case 'crear':
      return { paso: 'creando' }
    case 'hecho':
      return { paso: 'hecho' }
    case 'fallo':
      return { paso: 'error', mensaje: evento.mensaje, retomar: evento.retomar }
    case 'cancelar':
      return ENVIO_INICIAL
    case 'reintentar':
      return estado.paso === 'error' ? estado.retomar : estado
  }
}

/** Qué mostrar bajo los botones mientras el envío corre; null cuando no hay nada que decir. */
export function etiquetaEnvio(estado: Envio): string | null {
  switch (estado.paso) {
    case 'chequeando':
      return 'Comprobando…'
    case 'subiendo':
      return `Subiendo ${estado.indice + 1} de ${estado.total} · ${Math.round(estado.progreso * 100)} %`
    case 'creando':
      return 'Guardando…'
    case 'hecho':
      return 'Listo'
    default:
      return null
  }
}

export function textoConfirmacion(redes: string[]): string {
  const nombres = redes.map((r) => NOMBRE_RED[r] ?? r)
  const lista =
    nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  return `¿Publicar ahora en ${lista}? Saldrá en los próximos 5 minutos.`
}

/** El valor inicial del selector: la próxima hora en punto, nunca «ahora mismo». */
export function proximaHoraEnPunto(now: Date): Date {
  const siguiente = new Date(now)
  siguiente.setHours(now.getHours() + 1, 0, 0, 0)
  return siguiente
}

/** La única regla que la app aplica sola; todas las demás las dice el servidor. */
export function puedeEnviar(texto: string, archivos: number): boolean {
  return texto.trim().length > 0 || archivos > 0
}
```

- [ ] **Step 5: Implementar `cambios.ts`**

```ts
// mobile/src/lib/cambios.ts

/**
 * La marca en memoria de «la app escribió algo en el servidor». Las pantallas que
 * muestran lo programado (Resumen, Calendario) la comparan con la fecha de su caché al
 * recibir foco: si la caché es anterior al cambio, refrescan aunque parezca fresca.
 * En memoria a propósito: al reabrir la app la caché se refresca sola por edad.
 */
let ultimoCambio = 0

export function anotarCambio(now: number = Date.now()): void {
  ultimoCambio = now
}

export function huboCambioDesde(savedAt: number | null): boolean {
  return savedAt === null || savedAt < ultimoCambio
}
```

- [ ] **Step 6: Verde y commit**

Desde `mobile/`: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add mobile/src/lib/publicar.ts mobile/src/lib/publicar.test.ts mobile/src/lib/cambios.ts mobile/src/lib/cambios.test.ts
git commit -m "Agrega lo puro de publicar desde la app: archivos, pasos del envío y cambios"
```

---

### Task 7: El cliente de escritura y el orquestador de la subida

**Files:**
- Modify: `mobile/src/lib/api.ts`
- Modify: `mobile/src/lib/useScreenData.ts`
- Create: `mobile/src/lib/subir.ts`

**Interfaces:**
- Consumes: Task 6 (`Elegido`, `Evento`, `Retomar`, `SIN_SENAL`, `SIN_SENAL_SUBIDA`), `API_BASE`, `SesionCaducada`, `freshness`, `huboCambioDesde`.
- Produces (Task 8):
  - `apiPost<T>(path: string, token: string, body: unknown): Promise<T>`; `class RechazoApi extends Error` (un 400 con `{ error }`; `message` es la frase).
  - `useScreenData` devuelve además `refrescarSiVieja: () => void`.
  - `type BorradorApp = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }`
  - `type SubidaHecha = { url: string; mediaType: 'image' | 'video' }`
  - `ejecutarEnvio(args: { token: string; borrador: BorradorApp; archivos: Elegido[]; subidas: (SubidaHecha | null)[]; retomar: Retomar; despachar: (e: Evento) => void; signal: AbortSignal }): Promise<(SubidaHecha | null)[]>`

Sin tests: son llamadas de red y un bucle que las encadena; lo que decide algo está en Task 6. La verificación es el chequeo de tipos.

- [ ] **Step 1: `apiPost` y `RechazoApi`**

Agrega al final de `mobile/src/lib/api.ts`:

```ts
/** Un 400 con `{ error }`: la frase fija del servidor, lista para mostrarse tal cual. */
export class RechazoApi extends Error {}

export async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 401) throw new SesionCaducada()
  if (response.status === 400) {
    const cuerpo = (await response.json().catch(() => ({}))) as { error?: string }
    throw new RechazoApi(cuerpo.error ?? 'No se pudo guardar. Intenta de nuevo.')
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}
```

- [ ] **Step 2: `refrescarSiVieja` en `useScreenData`**

En `mobile/src/lib/useScreenData.ts`:

1. Amplía los imports: `import { useCallback, useEffect, useRef, useState } from 'react'` y
   `import { huboCambioDesde } from './cambios'`.
2. Debajo de `const [error, setError] = …`, agrega:

```ts
  // Cuándo se guardó lo que está en pantalla, para decidir al recibir foco si vale
  // la pena refrescar. Un ref y no un estado: cambiarlo no debe redibujar nada.
  const guardadoEn = useRef<number | null>(null)
```

3. En `refrescar`, justo después de `const cuando = Date.now()`, agrega `guardadoEn.current = cuando`.
4. En el efecto de la caché, dentro del `if (guardado) {`, agrega como primera línea `guardadoEn.current = guardado.savedAt`.
5. Antes del `return`, agrega:

```ts
  /**
   * Para `useFocusEffect`: refresca al volver a una pestaña solo si la caché pasó de
   * fresca, o si la app escribió algo (un post nuevo) después de guardarla. Sin esto,
   * el post recién programado no aparecería en Calendario hasta tirar para refrescar.
   */
  const refrescarSiVieja = useCallback(() => {
    const cuando = guardadoEn.current
    if (!freshness(cuando, Date.now()).fresca || huboCambioDesde(cuando)) void refrescar()
  }, [refrescar])
```

6. Cambia el `return` por `return { data, cargando, error, sello, refrescar, refrescarSiVieja }`.

- [ ] **Step 3: El orquestador**

```ts
// mobile/src/lib/subir.ts
import { File } from 'expo-file-system'

import { RechazoApi, SesionCaducada, apiPost } from './api'
import { SIN_SENAL, SIN_SENAL_SUBIDA, type Elegido, type Evento, type Retomar } from './publicar'

export type BorradorApp = { texto: string; redes: string[]; cuando: string | null; ahora: boolean }
export type SubidaHecha = { url: string; mediaType: 'image' | 'video' }

type Destino = { subir: string; publica: string; mediaType: 'image' | 'video' }

// Las dos cabeceras van dentro de la firma del PUT: tienen que ir tal cual o R2 responde
// 403. El valor de Cache-Control es el que pone el servidor en src/lib/storage.ts.
const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'

async function subirArchivo(
  archivo: Elegido,
  destino: Destino,
  onProgreso: (progreso: number) => void,
  signal: AbortSignal,
): Promise<void> {
  // `File` lee desde disco: un video de 200 MB nunca pasa entero por memoria.
  const resultado = await new File(archivo.uri).upload(destino.subir, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': archivo.tipo, 'Cache-Control': CACHE_INMUTABLE },
    onProgress: ({ bytesSent, totalBytes }) => onProgreso(totalBytes > 0 ? bytesSent / totalBytes : 0),
    signal,
  })
  if (resultado.status < 200 || resultado.status >= 300) {
    console.warn('PUT a R2:', resultado.status, resultado.body.slice(0, 300))
    throw new Error(`HTTP ${resultado.status}`)
  }
}

/**
 * El envío entero, retomable. Recorre chequeo → subida archivo por archivo → creación
 * desde el punto que diga `retomar`, reusando las subidas ya hechas de un intento
 * anterior. No decide nada visible: cada paso lo cuenta por `despachar` y la pantalla
 * dibuja lo que el reductor diga. Devuelve las subidas para que el próximo intento no
 * repita las que ya están.
 *
 * Un 401 sube como `SesionCaducada`: la pantalla hace lo de siempre con él.
 */
export async function ejecutarEnvio(args: {
  token: string
  borrador: BorradorApp
  archivos: Elegido[]
  subidas: (SubidaHecha | null)[]
  retomar: Retomar
  despachar: (evento: Evento) => void
  signal: AbortSignal
}): Promise<(SubidaHecha | null)[]> {
  const { token, borrador, archivos, despachar, signal } = args
  const subidas = archivos.map((_, i) => args.subidas[i] ?? null)
  const total = archivos.length
  let paso: Retomar['paso'] = args.retomar.paso
  let desde = args.retomar.paso === 'subiendo' ? args.retomar.indice : 0

  if (paso === 'chequeando') {
    despachar({ tipo: 'chequear' })
    try {
      await apiPost('/api/mobile/schedule/check', token, {
        ...borrador,
        fotos: archivos.filter((a) => a.mediaType === 'image').length,
        videos: archivos.filter((a) => a.mediaType === 'video').length,
      })
    } catch (e) {
      if (e instanceof SesionCaducada) throw e
      if (e instanceof RechazoApi) despachar({ tipo: 'rechazado', mensaje: e.message })
      else despachar({ tipo: 'fallo', mensaje: SIN_SENAL, retomar: { paso: 'chequeando' } })
      return subidas
    }
    paso = 'subiendo'
    desde = 0
  }

  if (paso === 'subiendo') {
    for (let i = desde; i < total; i++) {
      if (subidas[i]) continue
      despachar({ tipo: 'subir', indice: i, total })
      const archivo = archivos[i]!
      try {
        const destino = await apiPost<Destino>('/api/mobile/upload-url', token, {
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          bytes: archivo.bytes,
        })
        await subirArchivo(archivo, destino, (p) => despachar({ tipo: 'progreso', progreso: p }), signal)
        subidas[i] = { url: destino.publica, mediaType: destino.mediaType }
      } catch (e) {
        if (signal.aborted) {
          despachar({ tipo: 'cancelar' })
          return subidas
        }
        if (e instanceof SesionCaducada) throw e
        if (e instanceof RechazoApi) despachar({ tipo: 'rechazado', mensaje: e.message })
        else {
          console.warn('subida:', String(e).slice(0, 300))
          despachar({
            tipo: 'fallo',
            mensaje: SIN_SENAL_SUBIDA,
            retomar: { paso: 'subiendo', indice: i, total, progreso: 0 },
          })
        }
        return subidas
      }
    }
  }

  despachar({ tipo: 'crear' })
  try {
    await apiPost('/api/mobile/schedule', token, {
      ...borrador,
      media: subidas.filter((s): s is SubidaHecha => s !== null),
    })
    despachar({ tipo: 'hecho' })
  } catch (e) {
    if (e instanceof SesionCaducada) throw e
    if (e instanceof RechazoApi) despachar({ tipo: 'rechazado', mensaje: e.message })
    else despachar({ tipo: 'fallo', mensaje: SIN_SENAL, retomar: { paso: 'creando' } })
  }
  return subidas
}
```

Si `tsc` reclama por la forma de `onProgress` o de `upload` en la versión instalada de
`expo-file-system`, abre `mobile/node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts`
y ajusta los nombres a lo que declara; el comportamiento (PUT, cabeceras, progreso,
`AbortSignal`) es el documentado para el SDK 57.

- [ ] **Step 4: Verificar y commitear**

Desde `mobile/`: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: verde.

```bash
git add mobile/src/lib/api.ts mobile/src/lib/useScreenData.ts mobile/src/lib/subir.ts
git commit -m "Agrega el cliente de escritura y el orquestador de la subida directa a R2"
```

---

### Task 8: La pestaña Publicar y el refresco al volver a foco

**Files:**
- Create: `mobile/src/app/(tabs)/publicar.tsx`
- Modify: `mobile/src/components/ui.tsx` (entra `Chip` desde contenido, entra `Miniatura`, entra `Boton`)
- Modify: `mobile/src/app/(tabs)/contenido.tsx` (importa `Chip` desde ui, deja de exportarlo)
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `mobile/src/app/(tabs)/calendario.tsx`, `mobile/src/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: Task 6 y Task 7 completas; `useToken`, `clearToken`, `NOMBRE_RED`, `COLORES`, `Tarjeta`.

- [ ] **Step 1: Mudar `Chip` y agregar `Miniatura` y `Boton` a `ui.tsx`**

1. En `mobile/src/app/(tabs)/contenido.tsx`, borra la función `export function Chip(…)` del final del archivo y agrega `Chip` al import de `'../../components/ui'`.
2. En `mobile/src/components/ui.tsx`, agrega arriba `import { Image } from 'expo-image'` (la misma que usa contenido, no la de react-native), y al final del archivo:

```tsx
export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: activo ? COLORES.tarjeta : 'transparent',
      }}
    >
      <Text style={{ color: activo ? COLORES.texto : COLORES.tenue, fontSize: 12 }}>{texto}</Text>
    </Pressable>
  )
}

/** Un archivo elegido: la imagen o un bloque con «video», y una equis para quitarlo. */
export function Miniatura({
  uri,
  esVideo,
  onQuitar,
}: {
  uri: string
  esVideo: boolean
  onQuitar: () => void
}) {
  return (
    <View style={{ width: 72, height: 72 }}>
      {esVideo ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 10,
            backgroundColor: '#ffffff10',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORES.suave, fontSize: 11 }}>video</Text>
        </View>
      ) : (
        <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 10 }} />
      )}
      <Pressable
        onPress={onQuitar}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: COLORES.fondo,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: COLORES.texto, fontSize: 12 }}>✕</Text>
      </Pressable>
    </View>
  )
}

export function Boton({
  texto,
  onPress,
  deshabilitado,
  destacado,
}: {
  texto: string
  onPress: () => void
  deshabilitado?: boolean
  destacado?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      style={{
        flex: 1,
        backgroundColor: destacado ? COLORES.verde : COLORES.tarjeta,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        opacity: deshabilitado ? 0.5 : 1,
      }}
    >
      <Text style={{ color: destacado ? COLORES.fondo : COLORES.texto, fontWeight: '600' }}>{texto}</Text>
    </Pressable>
  )
}
```

- [ ] **Step 2: La pantalla**

```tsx
// mobile/src/app/(tabs)/publicar.tsx
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'

import { Boton, COLORES, Chip, Miniatura } from '../../components/ui'
import { SesionCaducada } from '../../lib/api'
import { anotarCambio } from '../../lib/cambios'
import {
  ENVIO_INICIAL,
  MAX_ARCHIVOS,
  REDES_PUBLICABLES,
  describirArchivo,
  etiquetaEnvio,
  proximaHoraEnPunto,
  puedeEnviar,
  reducirEnvio,
  textoConfirmacion,
  type Elegido,
  type Retomar,
} from '../../lib/publicar'
import { clearToken } from '../../lib/session'
import { ejecutarEnvio, type SubidaHecha } from '../../lib/subir'
import { NOMBRE_RED } from '../../lib/tipos'
import { useToken } from '../../lib/useToken'

const MAX_TEXTO = 2200

function fechaLegible(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0')
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const hh = String(fecha.getHours()).padStart(2, '0')
  const mi = String(fecha.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} a las ${hh}:${mi}`
}

export default function Publicar() {
  const token = useToken()
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<Elegido[]>([])
  const [redes, setRedes] = useState<string[]>(['instagram'])
  const [fecha, setFecha] = useState<Date>(() => proximaHoraEnPunto(new Date()))
  const [envio, despachar] = useReducer(reducirEnvio, ENVIO_INICIAL)
  const [aviso, setAviso] = useState<string | null>(null)
  // Lo que ya subió en un intento anterior y el AbortController del envío en curso.
  // Refs, no estado: cambiarlos no debe redibujar, y el orquestador los lee entre awaits.
  const subidas = useRef<(SubidaHecha | null)[]>([])
  const ultimoBorrador = useRef<{ texto: string; redes: string[]; cuando: string | null; ahora: boolean } | null>(null)
  const abortar = useRef<AbortController | null>(null)

  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  async function elegir() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) {
      setAviso('Sin permiso para ver la galería.')
      return
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ARCHIVOS - archivos.length,
    })
    if (resultado.canceled) return
    const nuevos: Elegido[] = []
    for (const asset of resultado.assets) {
      const descrito = describirArchivo(asset)
      if ('error' in descrito) {
        setAviso(descrito.error)
        return
      }
      nuevos.push(descrito)
    }
    setAviso(null)
    setArchivos([...archivos, ...nuevos].slice(0, MAX_ARCHIVOS))
    // Archivos distintos, subidas distintas: lo subido antes ya no corresponde.
    subidas.current = []
  }

  function quitar(indice: number) {
    setArchivos(archivos.filter((_, i) => i !== indice))
    subidas.current = []
  }

  function alternarRed(red: string) {
    setRedes(redes.includes(red) ? redes.filter((r) => r !== red) : [...redes, red])
  }

  function elegirFecha() {
    // Android no tiene un selector de fecha y hora en uno: primero el día, luego la hora.
    DateTimePickerAndroid.open({
      value: fecha,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (evento, dia) => {
        if (evento.type !== 'set' || !dia) return
        DateTimePickerAndroid.open({
          value: dia,
          mode: 'time',
          is24Hour: true,
          onChange: (evento2, conHora) => {
            if (evento2.type === 'set' && conHora) setFecha(conHora)
          },
        })
      },
    })
  }

  async function enviar(ahora: boolean, retomar: Retomar) {
    if (!token) return
    const borrador =
      retomar.paso === 'chequeando'
        ? { texto: texto.trim(), redes, cuando: ahora ? null : fecha.toISOString(), ahora }
        : ultimoBorrador.current
    if (!borrador) return
    ultimoBorrador.current = borrador
    const control = new AbortController()
    abortar.current = control
    try {
      subidas.current = await ejecutarEnvio({
        token,
        borrador,
        archivos,
        subidas: subidas.current,
        retomar,
        despachar,
        signal: control.signal,
      })
    } catch (e) {
      if (e instanceof SesionCaducada) {
        await salir()
        return
      }
      throw e
    } finally {
      abortar.current = null
    }
  }

  function programar() {
    void enviar(false, { paso: 'chequeando' })
  }

  function publicarAhora() {
    Alert.alert('Publicar ahora', textoConfirmacion(redes), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Publicar', onPress: () => void enviar(true, { paso: 'chequeando' }) },
    ])
  }

  function reintentar() {
    if (envio.paso !== 'error') return
    const retomar = envio.retomar
    despachar({ tipo: 'reintentar' })
    void enviar(ultimoBorrador.current?.ahora ?? false, retomar)
  }

  function cancelar() {
    abortar.current?.abort()
  }

  // Tras «hecho»: se vacía el formulario y se salta al Calendario, que refresca al
  // recibir foco porque anotamos el cambio. Un efecto y no un `if` en el render:
  // navegar es un efecto secundario, y los `setState` de acá son la reacción a un
  // paso del envío, exactamente el caso que la regla no puede ver por sí sola.
  useEffect(() => {
    if (envio.paso !== 'hecho') return
    anotarCambio()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    despachar({ tipo: 'cancelar' })
    setTexto('')
    setArchivos([])
    setRedes(['instagram'])
    setFecha(proximaHoraEnPunto(new Date()))
    subidas.current = []
    ultimoBorrador.current = null
    router.navigate('/(tabs)/calendario')
  }, [envio.paso, router])

  const ocupado = envio.paso === 'chequeando' || envio.paso === 'subiendo' || envio.paso === 'creando'
  const etiqueta = etiquetaEnvio(envio)
  const error = envio.paso === 'listo' ? envio.error : envio.paso === 'error' ? envio.mensaje : null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORES.fondo }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        value={texto}
        onChangeText={setTexto}
        multiline
        maxLength={MAX_TEXTO}
        editable={!ocupado}
        placeholder="Texto del post…"
        placeholderTextColor={COLORES.tenue}
        style={{
          backgroundColor: COLORES.tarjeta,
          color: COLORES.texto,
          borderRadius: 12,
          padding: 14,
          minHeight: 120,
          textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORES.tenue, fontSize: 11 }}>En YouTube el primer renglón es el título</Text>
        <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
          {texto.length} / {MAX_TEXTO}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {archivos.map((a, i) => (
          <Miniatura key={`${a.uri}:${i}`} uri={a.uri} esVideo={a.mediaType === 'video'} onQuitar={() => quitar(i)} />
        ))}
        {archivos.length < MAX_ARCHIVOS && !ocupado ? (
          <Chip texto="＋ Fotos o video" activo={false} onPress={() => void elegir()} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REDES_PUBLICABLES.map((red) => (
          <Chip
            key={red}
            texto={NOMBRE_RED[red] ?? red}
            activo={redes.includes(red)}
            onPress={() => (ocupado ? undefined : alternarRed(red))}
          />
        ))}
      </View>

      <Chip texto={`Cuándo: ${fechaLegible(fecha)}`} activo onPress={() => (ocupado ? undefined : elegirFecha())} />

      {aviso ? <Text style={{ color: COLORES.rojo }}>{aviso}</Text> : null}
      {error ? <Text style={{ color: COLORES.rojo }}>{error}</Text> : null}
      {etiqueta ? <Text style={{ color: COLORES.suave }}>{etiqueta}</Text> : null}
      {envio.paso === 'subiendo' ? (
        <View style={{ height: 4, backgroundColor: '#ffffff10', borderRadius: 2 }}>
          <View style={{ height: 4, width: `${Math.round(envio.progreso * 100)}%`, backgroundColor: COLORES.verde, borderRadius: 2 }} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {envio.paso === 'error' ? (
          <Boton texto="Reintentar" onPress={reintentar} destacado />
        ) : ocupado ? (
          <Boton texto="Cancelar" onPress={cancelar} deshabilitado={envio.paso !== 'subiendo'} />
        ) : (
          <>
            <Boton texto="Programar" onPress={programar} deshabilitado={!puedeEnviar(texto, archivos.length)} />
            <Boton texto="Publicar ahora" onPress={publicarAhora} deshabilitado={!puedeEnviar(texto, archivos.length)} destacado />
          </>
        )}
      </View>
    </ScrollView>
  )
}
```

Si `tsc` reclama que `onChange` no existe en la versión instalada de
`@react-native-community/datetimepicker`, usa `onValueChange: (_evento, dia) => …` (la
versión 9 lo renombró y el evento ya no trae `type`; en ese caso, sin chequear `type`).

Si el lint no reclama por el efecto de «hecho», quita el `eslint-disable-next-line`:
un disable que no silencia nada es ruido.

- [ ] **Step 3: La quinta pestaña**

En `mobile/src/app/(tabs)/_layout.tsx`, entre `contenido` y `cuentas`:

```tsx
      <Tabs.Screen name="publicar" options={{ title: 'Publicar' }} />
```

- [ ] **Step 4: Calendario y Resumen refrescan al recibir foco**

En `mobile/src/app/(tabs)/calendario.tsx`:

1. `import { useFocusEffect, useRouter } from 'expo-router'`.
2. Toma `refrescarSiVieja` del `useScreenData`: `const { data, cargando, error, sello, refrescar, refrescarSiVieja } = …`.
3. Justo después de esa línea:

```tsx
  // Al volver a esta pestaña: si Publicar acaba de crear un post, o la caché ya es
  // vieja, refresca sola. Es lo que hace aparecer el post recién programado.
  useFocusEffect(refrescarSiVieja)
```

Lo mismo, línea por línea, en `mobile/src/app/(tabs)/index.tsx` (Resumen muestra «qué viene»).

- [ ] **Step 5: Verificar y commitear**

Desde `mobile/`: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: verde.

```bash
git add "mobile/src/app/(tabs)/publicar.tsx" "mobile/src/app/(tabs)/_layout.tsx" "mobile/src/app/(tabs)/contenido.tsx" "mobile/src/app/(tabs)/calendario.tsx" "mobile/src/app/(tabs)/index.tsx" mobile/src/components/ui.tsx
git commit -m "Agrega la pestaña Publicar y el refresco al volver al calendario"
```

---

### Task 9: El instructivo y el cierre

**Files:**
- Modify: `mobile/README.md`
- Modify: `docs/superpowers/plans/2026-09-09-publicar-desde-el-telefono.md` (marcar tareas)

- [ ] **Step 1: El README**

1. En la lista de la introducción, después de «el detalle de cada post», agrega: «y
   desde la versión 1.1 también **publica**: eliges fotos o un video de la galería,
   escribes el texto, marcas las redes y lo programas, o lo mandas a salir ahora».
2. Reemplaza la sección «Cómo generar el instalable (`.apk`)» por esta, que distingue
   los dos tipos de cambio:

```markdown
## Cómo generar el instalable (`.apk`)

Solo hace falta cuando cambia algo **nativo** de la app (un módulo nuevo, la versión
en `app.json`). Los cambios de pantalla y de lógica llegan solos, ver la sección
siguiente.

1. Abre una terminal en la carpeta `mobile/` de este proyecto.
2. **La primera vez**, y solo una vez, deja configuradas las actualizaciones por aire:

   ```bash
   npx eas-cli update:configure
   ```

   Te pide iniciar sesión con tu cuenta de Expo y escribe dos líneas en `app.json`
   (`updates.url` y `extra.eas.projectId`). Commitea ese cambio.
3. Ejecuta:

   ```bash
   npx eas-cli build -p android --profile preview
   ```

4. El comando se demora unos minutos (se construye en los servidores de Expo, no en
   tu computador). Al terminar, imprime un link (algo como
   `https://expo.dev/artifacts/eas/....apk`).

## Cómo mandar un cambio sin reinstalar

Cuando cambia una pantalla o la lógica (no un módulo nativo), basta con:

```bash
npx eas-cli update --channel preview --message "qué cambió"
```

La app lo descarga la próxima vez que se abre y lo aplica en la apertura siguiente.
Solo llega a los teléfonos que tengan instalada la misma versión de `app.json`; si
subiste la versión, hay que generar el APK de nuevo.
```

3. Después de la sección «Cómo entrar», agrega:

```markdown
## Cómo publicar desde el teléfono

En la pestaña **Publicar**:

1. Escribe el texto. En YouTube, el primer renglón es el título del video.
2. Toca **Fotos o video** y elige de la galería (hasta diez archivos; un video de
   hasta 500 MB).
3. Marca las redes. Instagram viene marcada.
4. Toca **Cuándo** para elegir día y hora, y luego **Programar**. O toca
   **Publicar ahora**: confirma, y sale en los próximos cinco minutos.

La subida muestra el avance de cada archivo. Si se corta la señal, **Reintentar**
retoma desde el archivo que falló, sin volver a subir los anteriores. Al terminar, la
app salta al Calendario con el post recién programado.

Lo que no se puede hacer desde el teléfono, y sigue siendo del panel web: poner una
portada, etiquetar con atributos, y editar o borrar lo ya programado.
```

4. En «Qué no hace todavía», reemplaza la primera línea («No publica ni programa
   contenido: es solo para mirar números.») por «No pone portada ni atributos, y no
   edita lo ya programado: eso sigue en el panel.».

- [ ] **Step 2: Verificación final, ambos lados**

Desde la raíz: `npm test && npm run typecheck && npm run lint && npx next build`
Desde `mobile/`: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: todo verde.

- [ ] **Step 3: Marcar el plan y commitear**

Marca `[x]` cada step cumplido en este plan.

```bash
git add mobile/README.md docs/superpowers/plans/2026-09-09-publicar-desde-el-telefono.md
git commit -m "Documenta cómo publicar desde el teléfono y las actualizaciones por aire"
```

**El build, el `update:configure` y la instalación los hace el dueño**: exigen su cuenta
de Expo y su teléfono. El PR de esta rama apunta a `contenido-presentacion` y va después
del #62; y como siempre, producción necesita el segundo PR de promoción a `main`.
