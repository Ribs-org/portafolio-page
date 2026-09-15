# TikTok 2: el publisher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cron publique en TikTok lo que el compositor y el lote ya guardan con sus opciones: un video o un carrusel directo al perfil con la privacidad elegida, o un borrador a la bandeja del dueño; y que el calendario lo cuente igual que las demás redes.

**Architecture:** Un `Publisher` más en `src/lib/social/publish/tiktok.ts` con el mismo molde que YouTube e Instagram: la primera corrida valida las opciones, consulta `creator_info`, hace el `init` con la URL pública de R2 y devuelve `processing` con el `publish_id`; las siguientes consultan `status/fetch` y deciden. Todo lo que decide algo es puro y se testea (cuerpos de `init`, veredicto del estado, frases por código de error, cupo de seis `init` por minuto); lo que habla con TikTok vive en el mismo archivo detrás de `fetch`. El contrato del publisher gana dos cosas chicas que el resto de las redes ignora: `PublishInput.opciones` y un resultado `deferred` que deja el destino programado sin gastar intento.

**Tech Stack:** Next.js App Router, Drizzle + Neon, Vitest con `vi.stubGlobal('fetch', …)`, TikTok Content Posting API v2.

**Spec:** `docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md` (secciones 1, 3, 4 «Calendario y editor», «Manejo de errores», «Testing», «Trámite del dueño»). Cuatro desviaciones de la spec se deciden en este plan y se anotan en la spec en la Task 5: (a) `PUBLISH_COMPLETE` marca publicado aunque TikTok no devuelva todavía el id del video, porque los posts privados (los únicos posibles hasta la auditoría) pueden no recibirlo nunca y el destino se quedaría 24 h en «publicando» hasta fallar; (b) no hay chequeo local de duración: el repo no conoce la duración del video y `duration_check_failed` de TikTok ya la cubre; (c) `NETWORKS` del editor **no** gana `tiktok`: el editor no puede pedir las opciones y la entrega 1 ya rechaza crear ese destino desde ahí, así que ofrecer la casilla sería un callejón sin salida; (d) la tarjeta de Cuentas no se pone en rojo por un fallo de publicación: el publisher no escribe en la cuenta, y la frase «Reconecta TikTok…» ya sale en el chip del calendario y en el compositor.

Rama: `publicar-en-tiktok`, HEAD `b70af33` fusionado en `main` por el PR #83. Esta entrega se apila encima y se fusiona con su propio PR a `main`.

## Global Constraints

- Frases fijas en español hacia la base y la UI; el detalle de TikTok solo a `console.error` truncado a 300.
- Base de API `https://open.tiktokapis.com/v2`; cabeceras `Authorization: Bearer <token>` y `Content-Type: application/json; charset=UTF-8`.
- Endpoints: directo video `POST /post/publish/video/init/`; directo fotos y borrador fotos `POST /post/publish/content/init/` (`post_mode` `DIRECT_POST` o `MEDIA_UPLOAD`, `media_type: 'PHOTO'`); borrador video `POST /post/publish/inbox/video/init/`; estado `POST /post/publish/status/fetch/` con `{ publish_id }`; `creator_info` vía `consultarCreador` que ya existe.
- Media siempre por `source_info.source = 'PULL_FROM_URL'` con las URLs públicas de R2 tal como llegan en `PublishMedia.url`. Sin portada externa: `video_cover_timestamp_ms: 0` en video, `photo_cover_index: 0` en fotos.
- Fotos: `title` = primera línea no vacía del caption recortada a 90, `description` = caption completo; `auto_add_music: false`, `is_aigc` no se envía.
- `brand_organic_toggle = comercial === 'marca_propia'`, `brand_content_toggle = comercial === 'patrocinado'`; `disable_comment = !comentarios`, `disable_duet = !duo`, `disable_stitch = !pegar`; si `creator_info` reporta una interacción deshabilitada, se fuerza el `disable_*` correspondiente a `true` sin fallar.
- Cupo: como mucho **6 `init` por minuto por cuenta**; el séptimo devuelve `deferred`. `status/fetch` no se limita (30/min es holgado para un calendario).
- Un error de red o HTTP al consultar `status/fetch` **no gasta intento**: sigue `processing`.
- `PublishOutcome` publicado admite `externalId: string | null`; el borrador siempre publica con `null`.
- Los gemelos: `PUBLISHERS` gana `tiktokPublisher`; `ENABLED` y `PUBLISHABLE` ya lo tienen; `NETWORKS` del editor y `REDES_PUBLICABLES` del móvil no cambian; `REDES_MOVIL` tampoco.
- Scopes del connect: `user.info.basic,video.list,video.upload,video.publish`.
- Comentarios en el código solo para restricciones que el código no puede mostrar, tono de los vecinos. Commits en español, presente, con footer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw`
- Disciplina git: HEAD verificado antes de empezar (`git log --oneline -1` debe mostrar `b70af33` o un commit de este plan), jamás checkout/reset/rebase/stash, `git add` por archivo.
- Verificación por task: `npx vitest run <archivo>`; al cerrar: `npm test && npm run typecheck && npm run lint && npx next build`. Ningún `db:push`: esta entrega no toca el esquema.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/social/publish/publisher.ts` | contrato: `opciones` en la entrada, `externalId` nulo, resultado `deferred` |
| `src/lib/social/publish/run.ts` | pasa `target.opciones` al publisher; cuenta `deferred` en el reporte |
| `src/lib/social/publish/tiktok.ts` | el publisher de TikTok: puro arriba, `fetch` abajo |
| `src/lib/social/publish/tiktok.test.ts` | lo puro con casos, y `publish()` con `fetch` simulado |
| `src/lib/social/publish/index.ts` | registra `tiktokPublisher` |
| `src/app/api/social/[network]/connect/route.ts` | los cuatro scopes |
| `src/app/admin/(dash)/schedule/etiqueta.ts` (+ test) | qué dice el chip de un destino: «En tu bandeja de TikTok» |
| `src/app/admin/(dash)/schedule/queue.tsx` | usa la etiqueta |
| `README.md`, `.env.example`, spec | trámite, sandbox, reconexión, desviaciones |

---

### Task 1: El contrato del publisher gana `opciones` y `deferred`

**Files:**
- Modify: `src/lib/social/publish/publisher.ts`
- Modify: `src/lib/social/publish/run.ts`
- Test: `src/lib/social/publish/publisher.test.ts`

**Interfaces:**
- Consumes: `type OpcionesDestino` de `./opciones` (entrega 1).
- Produces:
  - `PublishInput.opciones: OpcionesDestino | null`
  - `PublishOutcome = { kind: 'published'; externalId: string | null } | { kind: 'processing'; containerId: string } | { kind: 'deferred' } | { kind: 'failed'; reason: string }`
  - `resolveOutcome` con `deferred` → `{ status: 'scheduled', containerId: null, externalId: null, attemptCount (igual), lastError: null }`
  - `Report.deferred: number` en `run.ts`.

- [ ] **Step 1: Escribe los tests que fallan**

En `src/lib/social/publish/publisher.test.ts`, dentro del `describe('resolveOutcome')`:

```ts
  it('publicado sin id externo (un borrador a la bandeja) también cierra el destino', () => {
    expect(resolveOutcome({ kind: 'published', externalId: null }, 2)).toEqual({
      status: 'published',
      containerId: null,
      externalId: null,
      attemptCount: 2,
      lastError: null,
    })
  })

  it('diferido vuelve a programado sin gastar intento ni dejar motivo', () => {
    // La red pidió esperar (cupo por minuto): no es un fallo del post.
    expect(resolveOutcome({ kind: 'deferred' }, 1)).toEqual({
      status: 'scheduled',
      containerId: null,
      externalId: null,
      attemptCount: 1,
      lastError: null,
    })
  })
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/publish/publisher.test.ts`
Expected: FAIL por tipo (`externalId: null` no asignable) o por `deferred` cayendo en la rama de fallo (`attemptCount` 2 en vez de 1).

- [ ] **Step 3: Cambia el contrato**

En `src/lib/social/publish/publisher.ts`:

```ts
import type { TargetStatus } from '@/db/schema'
import type { SocialAccount } from '@/db'
import type { OpcionesDestino } from './opciones'

export type PublishMedia = { url: string; mediaType: 'image' | 'video'; position: number }

export type PublishInput = {
  caption: string
  media: PublishMedia[]
  containerId: string | null
  token: string
  accountExternalId: string
  /** Imagen de portada (URL del Blob) para los caminos de video; null si no hay. */
  coverUrl: string | null
  /** Lo que la red exigió elegir por destino (TikTok); null en las redes que no piden nada. */
  opciones: OpcionesDestino | null
}

export type PublishOutcome =
  // `externalId` nulo cuando la red no entrega un id que cruce con el connector: el
  // borrador a la bandeja de TikTok publica "en la bandeja", no en el perfil.
  | { kind: 'published'; externalId: string | null }
  | { kind: 'processing'; containerId: string }
  // La red pidió esperar (cupo por minuto): se vuelve a intentar en la próxima corrida
  // sin gastar intento ni dejar motivo, porque nada salió mal con el post.
  | { kind: 'deferred' }
  | { kind: 'failed'; reason: string }
```

Y en `resolveOutcome`, después de la rama `processing`:

```ts
  if (outcome.kind === 'deferred') {
    return {
      status: 'scheduled',
      containerId: null,
      externalId: null,
      attemptCount,
      lastError: null,
    }
  }
```

- [ ] **Step 4: `run.ts` pasa las opciones y cuenta los diferidos**

En `src/lib/social/publish/run.ts`:

```ts
import type { OpcionesDestino } from './opciones'

type Report = { published: number; processing: number; retried: number; deferred: number; failed: number }
```

Inicializa `deferred: 0`. En el bloque que contabiliza tras el patch, distingue diferido de reintento: un `scheduled` con el mismo `attemptCount` que tenía el target es diferido, con uno más es reintento:

```ts
    if (patch.status === 'published') {
      report.published++
      await limpiarMedia(post.id)
    } else if (patch.status === 'publishing') report.processing++
    else if (patch.status === 'scheduled') {
      if (patch.attemptCount === target.attemptCount) report.deferred++
      else report.retried++
    } else {
      report.failed++
      await sendFailureAlert(post.caption, target.network, patch.lastError ?? '')
    }
```

En `attempt`, la llamada a `publisher.publish` suma `opciones`:

```ts
    return await publisher.publish({
      caption: content.caption,
      media: media.map((m) => ({ url: m.blobUrl, mediaType: m.mediaType, position: m.position })),
      containerId,
      token,
      accountExternalId: account.externalId,
      coverUrl: content.coverUrl,
      opciones: content.opciones,
    })
```

y `attempt` recibe `opciones` dentro de `content`: cambia la firma a
`content: { caption: string; coverUrl: string | null; opciones: OpcionesDestino | null }`
y en `publishDue` pásale `opciones: (target.opciones as OpcionesDestino | null) ?? null`.

Busca en el repo otros lugares que construyan un `PublishInput` literal (tests de los publishers: `grep -rn "accountExternalId:" src --include=*.test.ts`) y agrégales `opciones: null`; sin eso el typecheck cae.

- [ ] **Step 5: Corre tests y typecheck**

Run: `npx vitest run src/lib/social/publish && npm run typecheck`
Expected: PASS y sin errores. Si el cron route (`src/app/api/cron/publish-social/route.ts`) serializa el reporte campo por campo, agrega `deferred` donde liste los demás.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/publish/publisher.ts src/lib/social/publish/publisher.test.ts src/lib/social/publish/run.ts
git commit -m "Pasa las opciones del destino al publisher y admite diferir sin gastar intento

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

Agrega al commit cualquier test de publisher que hayas tocado por el `opciones: null`.

---

### Task 2: Lo puro del publisher de TikTok

**Files:**
- Create: `src/lib/social/publish/tiktok.ts`
- Test: `src/lib/social/publish/tiktok.test.ts`

**Interfaces:**
- Consumes: `OpcionesTikTok`, `TIKTOK_SIN_PRIVACIDAD` de `./opciones`; `TIKTOK_MEDIA` de `./validate`; `CreadorTikTok`, `TIKTOK_RECONECTAR` de `./tiktok-creador`; `PublishMedia` de `./publisher`.
- Produces (los usa la Task 3 en el mismo archivo y la Task 4 no):
  - Frases: `TIKTOK_RECHAZO`, `TIKTOK_DOMINIO`, `TIKTOK_ARCHIVO`, `TIKTOK_PRIVACIDAD_NO_DISPONIBLE`, `TIKTOK_BANDEJA_LLENA`, `TIKTOK_NO_AUDITADA`
  - `MAX_INITS_POR_MINUTO = 6`, `MAX_TITULO_FOTO = 90`
  - `type MediaTikTok = { kind: 'video'; url: string } | { kind: 'fotos'; urls: string[] }`
  - `mediaTikTok(media: PublishMedia[]): MediaTikTok | null`
  - `tituloFoto(caption: string): string`
  - `interaccionesEfectivas(opciones: Extract<OpcionesTikTok, { modo: 'directo' }>, creador: CreadorTikTok | null): { disable_comment: boolean; disable_duet: boolean; disable_stitch: boolean }`
  - `cuerpoInit(opciones: OpcionesTikTok, caption: string, media: MediaTikTok, creador: CreadorTikTok | null): { path: string; body: Record<string, unknown> }`
  - `type VeredictoEstado = { kind: 'complete'; postId: string | null } | { kind: 'inbox' } | { kind: 'processing' } | { kind: 'failed'; reason: string }`
  - `idsDesdeTexto(texto: string): string[]` — los `publicaly_available_post_id` leídos del JSON **crudo**: son enteros de 19 dígitos y `JSON.parse` les pierde precisión, con lo que el id nunca cruzaría con `video.id` del connector
  - `veredictoEstado(data: unknown, ids?: string[]): VeredictoEstado` — si vienen `ids`, mandan sobre los del `data`
  - `fraseDeFallo(failReason: string | undefined): string`
  - `fraseDeInit(code: string | undefined): string | 'deferred'`
  - `class CupoInit { puede(cuenta: string, now: Date): boolean }` con `MAX_INITS_POR_MINUTO`.

- [ ] **Step 1: Escribe los tests que fallan**

`src/lib/social/publish/tiktok.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CupoInit,
  TIKTOK_ARCHIVO,
  TIKTOK_BANDEJA_LLENA,
  TIKTOK_DOMINIO,
  TIKTOK_NO_AUDITADA,
  TIKTOK_PRIVACIDAD_NO_DISPONIBLE,
  TIKTOK_RECHAZO,
  cuerpoInit,
  fraseDeFallo,
  fraseDeInit,
  idsDesdeTexto,
  interaccionesEfectivas,
  mediaTikTok,
  tituloFoto,
  veredictoEstado,
} from './tiktok'
import { TIKTOK_RECONECTAR, type CreadorTikTok } from './tiktok-creador'

const video = { url: 'https://media-bucket.vicente-pareja.cl/scheduled/a.mp4', mediaType: 'video' as const, position: 0 }
const foto = (n: number) => ({ url: `https://media-bucket.vicente-pareja.cl/scheduled/${n}.jpg`, mediaType: 'image' as const, position: n })

const directo = {
  modo: 'directo' as const,
  privacidad: 'SELF_ONLY' as const,
  comentarios: true,
  duo: false,
  pegar: true,
  comercial: 'no' as const,
}

const creador: CreadorTikTok = {
  nombre: 'Ribs',
  avatarUrl: null,
  privacidades: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
  comentariosDeshabilitados: false,
  duoDeshabilitado: true,
  pegarDeshabilitado: true,
  maxDuracionSeg: 600,
}

describe('mediaTikTok', () => {
  it('un video solo, o de una a treinta y cinco fotos en orden', () => {
    expect(mediaTikTok([video])).toEqual({ kind: 'video', url: video.url })
    expect(mediaTikTok([foto(1), foto(0)])).toEqual({ kind: 'fotos', urls: [foto(0).url, foto(1).url] })
  })

  it('nada, mezcla, dos videos o treinta y seis fotos no son media de TikTok', () => {
    expect(mediaTikTok([])).toBeNull()
    expect(mediaTikTok([video, foto(1)])).toBeNull()
    expect(mediaTikTok([video, { ...video, position: 1 }])).toBeNull()
    expect(mediaTikTok(Array.from({ length: 36 }, (_, i) => foto(i)))).toBeNull()
  })
})

describe('tituloFoto', () => {
  it('primera línea no vacía, recortada a 90; sin texto queda Fotos', () => {
    expect(tituloFoto('  \n¿Sirve el networking?\nresto')).toBe('¿Sirve el networking?')
    expect(tituloFoto('x'.repeat(120))).toHaveLength(90)
    expect(tituloFoto('')).toBe('Fotos')
  })
})

describe('interaccionesEfectivas', () => {
  it('traduce permitir a disable_ y respeta lo que la cuenta tiene bloqueado', () => {
    expect(interaccionesEfectivas(directo, null)).toEqual({
      disable_comment: false,
      disable_duet: true,
      disable_stitch: false,
    })
    // pegar pedido pero bloqueado en la cuenta → se fuerza deshabilitado, sin fallar
    expect(interaccionesEfectivas(directo, creador)).toEqual({
      disable_comment: false,
      disable_duet: true,
      disable_stitch: true,
    })
  })
})

describe('cuerpoInit', () => {
  it('video directo', () => {
    expect(cuerpoInit(directo, 'Hola', { kind: 'video', url: video.url }, null)).toEqual({
      path: '/post/publish/video/init/',
      body: {
        post_info: {
          title: 'Hola',
          privacy_level: 'SELF_ONLY',
          disable_comment: false,
          disable_duet: true,
          disable_stitch: false,
          video_cover_timestamp_ms: 0,
          brand_organic_toggle: false,
          brand_content_toggle: false,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: video.url },
      },
    })
  })

  it('fotos directo, con título de 90 y descripción completa, y el comercial traducido', () => {
    const caption = 'Título\ncuerpo largo'
    expect(
      cuerpoInit({ ...directo, comercial: 'patrocinado', privacidad: 'PUBLIC_TO_EVERYONE' }, caption, { kind: 'fotos', urls: [foto(0).url, foto(1).url] }, null),
    ).toEqual({
      path: '/post/publish/content/init/',
      body: {
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
        post_info: {
          title: 'Título',
          description: caption,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          auto_add_music: false,
          brand_organic_toggle: false,
          brand_content_toggle: true,
        },
        source_info: { source: 'PULL_FROM_URL', photo_images: [foto(0).url, foto(1).url], photo_cover_index: 0 },
      },
    })
  })

  it('video borrador solo lleva la fuente; fotos borrador llevan título y descripción', () => {
    expect(cuerpoInit({ modo: 'borrador' }, 'Hola', { kind: 'video', url: video.url }, null)).toEqual({
      path: '/post/publish/inbox/video/init/',
      body: { source_info: { source: 'PULL_FROM_URL', video_url: video.url } },
    })
    expect(cuerpoInit({ modo: 'borrador' }, 'Hola\nmás', { kind: 'fotos', urls: [foto(0).url] }, null)).toEqual({
      path: '/post/publish/content/init/',
      body: {
        post_mode: 'MEDIA_UPLOAD',
        media_type: 'PHOTO',
        post_info: { title: 'Hola', description: 'Hola\nmás' },
        source_info: { source: 'PULL_FROM_URL', photo_images: [foto(0).url], photo_cover_index: 0 },
      },
    })
  })
})

describe('idsDesdeTexto', () => {
  it('lee los ids de 19 dígitos del JSON crudo sin perder precisión', () => {
    const texto = '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7234567890123456789, 7234567890123456790]},"error":{"code":"ok"}}'
    expect(idsDesdeTexto(texto)).toEqual(['7234567890123456789', '7234567890123456790'])
    // JSON.parse habría redondeado: esa es la razón de leer el texto.
    expect(String((JSON.parse(texto) as { data: { publicaly_available_post_id: number[] } }).data.publicaly_available_post_id[0])).not.toBe('7234567890123456789')
  })

  it('sin la clave, o con la lista vacía, no hay ids', () => {
    expect(idsDesdeTexto('{"data":{"status":"PROCESSING_DOWNLOAD"}}')).toEqual([])
    expect(idsDesdeTexto('{"data":{"publicaly_available_post_id":[]}}')).toEqual([])
  })
})

describe('veredictoEstado', () => {
  it('PUBLISH_COMPLETE cierra con el primer id público, o sin id si TikTok aún no lo da', () => {
    expect(veredictoEstado({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7234567890123] }, ['7234567890123456789'])).toEqual({
      kind: 'complete',
      postId: '7234567890123456789',
    })
    expect(veredictoEstado({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7234567890123] })).toEqual({ kind: 'complete', postId: '7234567890123' })
    expect(veredictoEstado({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [] })).toEqual({ kind: 'complete', postId: null })
    expect(veredictoEstado({ status: 'PUBLISH_COMPLETE' })).toEqual({ kind: 'complete', postId: null })
  })

  it('SEND_TO_USER_INBOX es la bandeja; procesando y desconocido siguen esperando', () => {
    expect(veredictoEstado({ status: 'SEND_TO_USER_INBOX' })).toEqual({ kind: 'inbox' })
    expect(veredictoEstado({ status: 'PROCESSING_DOWNLOAD' })).toEqual({ kind: 'processing' })
    expect(veredictoEstado({ status: 'PROCESSING_UPLOAD' })).toEqual({ kind: 'processing' })
    expect(veredictoEstado({ status: 'ALGO_NUEVO' })).toEqual({ kind: 'processing' })
    expect(veredictoEstado(null)).toEqual({ kind: 'processing' })
  })

  it('FAILED trae la frase de su motivo', () => {
    expect(veredictoEstado({ status: 'FAILED', fail_reason: 'file_format_check_failed' })).toEqual({ kind: 'failed', reason: TIKTOK_ARCHIVO })
    expect(veredictoEstado({ status: 'FAILED', fail_reason: 'spam_risk' })).toEqual({ kind: 'failed', reason: TIKTOK_RECHAZO })
  })
})

describe('fraseDeFallo', () => {
  it('agrupa los motivos de TikTok en nuestras frases', () => {
    for (const r of ['file_format_check_failed', 'picture_size_check_failed', 'duration_check_failed', 'frame_rate_check_failed', 'video_pull_failed', 'photo_pull_failed']) {
      expect(fraseDeFallo(r)).toBe(TIKTOK_ARCHIVO)
    }
    expect(fraseDeFallo('auth_removed')).toBe(TIKTOK_RECONECTAR)
    expect(fraseDeFallo('scope_not_authorized')).toBe(TIKTOK_RECONECTAR)
    expect(fraseDeFallo('url_ownership_unverified')).toBe(TIKTOK_DOMINIO)
    expect(fraseDeFallo('spam_risk_too_many_posts')).toBe(TIKTOK_RECHAZO)
    expect(fraseDeFallo(undefined)).toBe(TIKTOK_RECHAZO)
  })
})

describe('fraseDeInit', () => {
  it('cada código de error del init tiene frase, y el cupo de TikTok difiere', () => {
    expect(fraseDeInit('url_ownership_unverified')).toBe(TIKTOK_DOMINIO)
    expect(fraseDeInit('scope_not_authorized')).toBe(TIKTOK_RECONECTAR)
    expect(fraseDeInit('access_token_invalid')).toBe(TIKTOK_RECONECTAR)
    expect(fraseDeInit('privacy_level_option_mismatch')).toBe(TIKTOK_PRIVACIDAD_NO_DISPONIBLE)
    expect(fraseDeInit('spam_risk_too_many_pending_share')).toBe(TIKTOK_BANDEJA_LLENA)
    expect(fraseDeInit('unaudited_client_can_only_post_to_private_accounts')).toBe(TIKTOK_NO_AUDITADA)
    expect(fraseDeInit('rate_limit_exceeded')).toBe('deferred')
    expect(fraseDeInit('spam_risk_user_banned_from_posting')).toBe(TIKTOK_RECHAZO)
    expect(fraseDeInit('internal_error')).toBe(TIKTOK_RECHAZO)
    expect(fraseDeInit(undefined)).toBe(TIKTOK_RECHAZO)
  })
})

describe('CupoInit', () => {
  it('seis por minuto por cuenta; el séptimo espera; otro minuto u otra cuenta empiezan de cero', () => {
    const cupo = new CupoInit()
    const t0 = new Date('2026-09-15T12:00:10Z')
    for (let i = 0; i < 6; i++) expect(cupo.puede('a', t0)).toBe(true)
    expect(cupo.puede('a', t0)).toBe(false)
    expect(cupo.puede('b', t0)).toBe(true)
    expect(cupo.puede('a', new Date('2026-09-15T12:01:00Z'))).toBe(true)
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/publish/tiktok.test.ts`
Expected: FAIL, `Failed to resolve import "./tiktok"`.

- [ ] **Step 3: Escribe la parte pura**

`src/lib/social/publish/tiktok.ts` (la Task 3 le agrega el publisher debajo; deja el archivo terminando en `CupoInit`):

```ts
import type { PublishMedia } from './publisher'
import type { OpcionesTikTok } from './opciones'
import { TIKTOK_RECONECTAR, type CreadorTikTok } from './tiktok-creador'

// Todo lo que el dueño puede leer. El detalle de TikTok solo va al log.
export const TIKTOK_RECHAZO = 'TikTok rechazó la publicación.'
export const TIKTOK_DOMINIO = 'TikTok no reconoce el dominio de tus archivos; verifícalo en el portal.'
export const TIKTOK_ARCHIVO = 'TikTok no acepta el archivo: revisa formato, tamaño o duración.'
export const TIKTOK_PRIVACIDAD_NO_DISPONIBLE = 'TikTok ya no permite esa privacidad en tu cuenta; edita la publicación.'
export const TIKTOK_BANDEJA_LLENA = 'Tienes 5 borradores pendientes en TikTok; publica alguno antes.'
export const TIKTOK_NO_AUDITADA = 'TikTok solo deja publicar en privado hasta que apruebe la app.'

export const MAX_INITS_POR_MINUTO = 6
export const MAX_TITULO_FOTO = 90
const MAX_FOTOS = 35

export type MediaTikTok = { kind: 'video'; url: string } | { kind: 'fotos'; urls: string[] }
type Directo = Extract<OpcionesTikTok, { modo: 'directo' }>

/** Un video solo, o de 1 a 35 fotos en orden de carrusel; cualquier otra forma es null. */
export function mediaTikTok(media: PublishMedia[]): MediaTikTok | null {
  if (media.length === 0) return null
  const ordenada = [...media].sort((a, b) => a.position - b.position)
  const videos = ordenada.filter((m) => m.mediaType === 'video')
  if (videos.length === 1 && ordenada.length === 1) return { kind: 'video', url: videos[0]!.url }
  if (videos.length > 0) return null
  if (ordenada.length > MAX_FOTOS) return null
  return { kind: 'fotos', urls: ordenada.map((m) => m.url) }
}

/** TikTok separa título (90) y descripción solo en fotos; misma regla que el título de YouTube. */
export function tituloFoto(caption: string): string {
  const primera = caption
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return (primera ?? 'Fotos').slice(0, MAX_TITULO_FOTO) || 'Fotos'
}

/**
 * «Permitir» del compositor en los `disable_*` de TikTok. Lo que la cuenta tiene
 * bloqueado se fuerza a deshabilitado en vez de fallar: TikTok lo ignoraría igual y la
 * guía pide que la casilla salga gris, no que la publicación se caiga.
 */
export function interaccionesEfectivas(
  opciones: Directo,
  creador: CreadorTikTok | null,
): { disable_comment: boolean; disable_duet: boolean; disable_stitch: boolean } {
  return {
    disable_comment: !opciones.comentarios || Boolean(creador?.comentariosDeshabilitados),
    disable_duet: !opciones.duo || Boolean(creador?.duoDeshabilitado),
    disable_stitch: !opciones.pegar || Boolean(creador?.pegarDeshabilitado),
  }
}

function fuente(media: MediaTikTok): Record<string, unknown> {
  return media.kind === 'video'
    ? { source: 'PULL_FROM_URL', video_url: media.url }
    : { source: 'PULL_FROM_URL', photo_images: media.urls, photo_cover_index: 0 }
}

/** Los cuatro cuerpos de `init`: directo/borrador × video/fotos. */
export function cuerpoInit(
  opciones: OpcionesTikTok,
  caption: string,
  media: MediaTikTok,
  creador: CreadorTikTok | null,
): { path: string; body: Record<string, unknown> } {
  if (opciones.modo === 'borrador') {
    if (media.kind === 'video') {
      return { path: '/post/publish/inbox/video/init/', body: { source_info: fuente(media) } }
    }
    return {
      path: '/post/publish/content/init/',
      body: {
        post_mode: 'MEDIA_UPLOAD',
        media_type: 'PHOTO',
        post_info: { title: tituloFoto(caption), description: caption },
        source_info: fuente(media),
      },
    }
  }

  const comercial = {
    brand_organic_toggle: opciones.comercial === 'marca_propia',
    brand_content_toggle: opciones.comercial === 'patrocinado',
  }
  const interacciones = interaccionesEfectivas(opciones, creador)

  if (media.kind === 'video') {
    return {
      path: '/post/publish/video/init/',
      body: {
        post_info: {
          title: caption,
          privacy_level: opciones.privacidad,
          ...interacciones,
          // Sin portada externa: TikTok no la acepta; el primer frame es la portada.
          video_cover_timestamp_ms: 0,
          ...comercial,
        },
        source_info: fuente(media),
      },
    }
  }
  return {
    path: '/post/publish/content/init/',
    body: {
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
      post_info: {
        title: tituloFoto(caption),
        description: caption,
        privacy_level: opciones.privacidad,
        disable_comment: interacciones.disable_comment,
        auto_add_music: false,
        ...comercial,
      },
      source_info: fuente(media),
    },
  }
}

export type VeredictoEstado =
  | { kind: 'complete'; postId: string | null }
  | { kind: 'inbox' }
  | { kind: 'processing' }
  | { kind: 'failed'; reason: string }

const FALLO_ARCHIVO = new Set([
  'file_format_check_failed',
  'picture_size_check_failed',
  'duration_check_failed',
  'frame_rate_check_failed',
  'video_pull_failed',
  'photo_pull_failed',
])
const FALLO_RECONECTAR = new Set(['auth_removed', 'scope_not_authorized', 'access_token_invalid'])

/** `fail_reason` de status/fetch a nuestra frase. Lo desconocido es un rechazo genérico. */
export function fraseDeFallo(failReason: string | undefined): string {
  if (!failReason) return TIKTOK_RECHAZO
  if (FALLO_ARCHIVO.has(failReason)) return TIKTOK_ARCHIVO
  if (FALLO_RECONECTAR.has(failReason)) return TIKTOK_RECONECTAR
  if (failReason === 'url_ownership_unverified') return TIKTOK_DOMINIO
  return TIKTOK_RECHAZO
}

/**
 * Los ids de video que status/fetch devuelve son int64 de 19 dígitos y `JSON.parse` los
 * redondea (pierde los últimos dígitos): leídos así jamás cruzarían con `video.id` del
 * connector. Se sacan del texto crudo, tal como vinieron.
 */
export function idsDesdeTexto(texto: string): string[] {
  const match = /"publicaly_available_post_id"\s*:\s*\[([^\]]*)\]/.exec(texto)
  if (!match) return []
  return (match[1]!.match(/\d+/g) ?? []).map(String)
}

/**
 * Solo PUBLISH_COMPLETE, SEND_TO_USER_INBOX y FAILED son veredictos; lo demás sigue
 * esperando. Un COMPLETE sin id no se queda esperando: los posts privados (los únicos
 * posibles hasta la auditoría) pueden no recibir `publicaly_available_post_id` nunca,
 * y 24 h de «publicando» para terminar en fallo sería mentir sobre un post que salió.
 * `ids` son los leídos del texto crudo (ver `idsDesdeTexto`) y mandan sobre `data`.
 */
export function veredictoEstado(data: unknown, ids?: string[]): VeredictoEstado {
  if (typeof data !== 'object' || data === null) return { kind: 'processing' }
  const d = data as { status?: unknown; fail_reason?: unknown; publicaly_available_post_id?: unknown }
  if (d.status === 'PUBLISH_COMPLETE') {
    const crudos = Array.isArray(d.publicaly_available_post_id) ? d.publicaly_available_post_id : []
    const lista = ids ?? crudos.map((x) => String(x))
    const primero = lista[0]
    return { kind: 'complete', postId: primero ? String(primero) : null }
  }
  if (d.status === 'SEND_TO_USER_INBOX') return { kind: 'inbox' }
  if (d.status === 'FAILED') {
    return { kind: 'failed', reason: fraseDeFallo(typeof d.fail_reason === 'string' ? d.fail_reason : undefined) }
  }
  return { kind: 'processing' }
}

/** `error.code` de un `init` a nuestra frase; `rate_limit_exceeded` no es fallo sino espera. */
export function fraseDeInit(code: string | undefined): string | 'deferred' {
  switch (code) {
    case 'rate_limit_exceeded':
      return 'deferred'
    case 'url_ownership_unverified':
      return TIKTOK_DOMINIO
    case 'scope_not_authorized':
    case 'access_token_invalid':
      return TIKTOK_RECONECTAR
    case 'privacy_level_option_mismatch':
      return TIKTOK_PRIVACIDAD_NO_DISPONIBLE
    case 'spam_risk_too_many_pending_share':
      return TIKTOK_BANDEJA_LLENA
    case 'unaudited_client_can_only_post_to_private_accounts':
      return TIKTOK_NO_AUDITADA
    default:
      return TIKTOK_RECHAZO
  }
}

/**
 * Seis `init` por minuto por cuenta es el tope de TikTok. Vive en memoria del módulo:
 * una corrida del cron es una invocación, y con Fluid Compute dos corridas seguidas
 * pueden compartir instancia, así que la ventana se ancla al minuto de reloj y no a la
 * invocación.
 */
export class CupoInit {
  private ventanas = new Map<string, { minuto: number; usados: number }>()

  puede(cuenta: string, now: Date): boolean {
    const minuto = Math.floor(now.getTime() / 60_000)
    const actual = this.ventanas.get(cuenta)
    if (!actual || actual.minuto !== minuto) {
      this.ventanas.set(cuenta, { minuto, usados: 1 })
      return true
    }
    if (actual.usados >= MAX_INITS_POR_MINUTO) return false
    actual.usados++
    return true
  }
}
```

- [ ] **Step 4: Corre y confirma que pasa**

Run: `npx vitest run src/lib/social/publish/tiktok.test.ts`
Expected: PASS, 15 tests (2 mediaTikTok, 1 tituloFoto, 1 interacciones, 3 cuerpoInit, 2 idsDesdeTexto, 3 veredicto, 1 fraseDeFallo, 1 fraseDeInit, 1 CupoInit).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/publish/tiktok.ts src/lib/social/publish/tiktok.test.ts
git commit -m "Escribe la parte pura del publisher de TikTok: cuerpos, veredictos, frases y cupo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 3: El publisher, su registro y los scopes

**Files:**
- Modify: `src/lib/social/publish/tiktok.ts` (agregar el publisher al final)
- Modify: `src/lib/social/publish/index.ts:1-15`
- Modify: `src/app/api/social/[network]/connect/route.ts:43`
- Test: `src/lib/social/publish/tiktok.test.ts` (agregar el describe de `publish`)

**Interfaces:**
- Consumes: todo lo de la Task 2; `consultarCreador(token)` de `./tiktok-creador` (`{ creador } | { error }`); `validarOpciones('tiktok', raw)` y `TIKTOK_SIN_PRIVACIDAD` de `./opciones`; `TIKTOK_MEDIA` de `./validate`; `PUBLISH_NETWORK_ERROR`, tipos de `./publisher`.
- Produces: `tiktokPublisher: Publisher` (`network: 'tiktok'`, sin `ensureCredential`: usa el del connector de lectura, que ya refresca cada 24 h).

- [ ] **Step 1: Escribe los tests que fallan**

Al final de `src/lib/social/publish/tiktok.test.ts` (suma `afterEach`, `vi` al import de vitest; `tiktokPublisher` al import de `./tiktok`; `TIKTOK_SIN_PRIVACIDAD` de `./opciones`; `TIKTOK_MEDIA` de `./validate`; `PUBLISH_NETWORK_ERROR` de `./publisher`; `fixture` de `'../fixtures/tiktok-creator-info.json'`):

```ts
describe('tiktokPublisher.publish', () => {
  afterEach(() => vi.unstubAllGlobals())

  type Llamada = { url: string; body: unknown }
  const llamadas: Llamada[] = []

  /**
   * Un fetch que responde según el path; guarda cada llamada para inspeccionarla. Un
   * `body` string se envía crudo, tal cual: así se prueba el id de 19 dígitos sin que
   * `JSON.stringify` del test lo redondee antes.
   */
  function stub(respuestas: Record<string, { status?: number; body: unknown }>) {
    llamadas.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname.replace('/v2', '')
        llamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        const r = respuestas[path]
        if (!r) throw new Error(`sin respuesta simulada para ${path}`)
        const texto = typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
        return new Response(texto, { status: r.status ?? 200, headers: { 'content-type': 'application/json' } })
      }),
    )
  }

  const ok = { error: { code: 'ok', message: '', log_id: '1' } }
  const base = {
    caption: 'Hola',
    media: [video],
    containerId: null,
    token: 'tok',
    accountExternalId: 'open-1',
    coverUrl: null,
    opciones: directo,
  }

  it('primera corrida directa: creator_info, init y processing con el publish_id', async () => {
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { body: { data: { publish_id: 'v_pub.123' }, ...ok } },
    })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'processing', containerId: 'v_pub.123' })
    expect(llamadas.map((l) => new URL(l.url).pathname)).toEqual([
      '/v2/post/publish/creator_info/query/',
      '/v2/post/publish/video/init/',
    ])
    expect((llamadas[1]!.body as { post_info: { privacy_level: string } }).post_info.privacy_level).toBe('SELF_ONLY')
  })

  it('borrador: sin creator_info, init de bandeja', async () => {
    stub({ '/post/publish/inbox/video/init/': { body: { data: { publish_id: 'v_inbox.1' }, ...ok } } })
    expect(await tiktokPublisher.publish({ ...base, opciones: { modo: 'borrador' } })).toEqual({
      kind: 'processing',
      containerId: 'v_inbox.1',
    })
    expect(llamadas).toHaveLength(1)
  })

  it('sin opciones o con media que TikTok no toma, falla antes de llamar a nadie', async () => {
    stub({})
    expect(await tiktokPublisher.publish({ ...base, opciones: null })).toEqual({ kind: 'failed', reason: TIKTOK_SIN_PRIVACIDAD })
    expect(await tiktokPublisher.publish({ ...base, media: [video, foto(1)] })).toEqual({ kind: 'failed', reason: TIKTOK_MEDIA })
    expect(llamadas).toHaveLength(0)
  })

  it('la privacidad elegida ya no está entre las de la cuenta', async () => {
    stub({
      '/post/publish/creator_info/query/': {
        body: { ...fixture, data: { ...fixture.data, privacy_level_options: ['PUBLIC_TO_EVERYONE'] } },
      },
    })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'failed', reason: TIKTOK_PRIVACIDAD_NO_DISPONIBLE })
  })

  it('creator_info sin scope pide reconectar; sin red, reintenta como error de red', async () => {
    stub({ '/post/publish/creator_info/query/': { status: 401, body: { error: { code: 'scope_not_authorized' } } } })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'failed', reason: TIKTOK_RECONECTAR })
    stub({ '/post/publish/creator_info/query/': { status: 500, body: { error: { code: 'internal_error' } } } })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'failed', reason: PUBLISH_NETWORK_ERROR })
  })

  it('el init con error trae su frase, y el cupo de TikTok difiere', async () => {
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { status: 400, body: { error: { code: 'url_ownership_unverified', message: 'x' } } },
    })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'failed', reason: TIKTOK_DOMINIO })
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { status: 429, body: { error: { code: 'rate_limit_exceeded' } } },
    })
    expect(await tiktokPublisher.publish(base)).toEqual({ kind: 'deferred' })
  })

  it('el séptimo init en el mismo minuto para la misma cuenta se difiere sin llamar', async () => {
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { body: { data: { publish_id: 'v' }, ...ok } },
    })
    const cuenta = { ...base, accountExternalId: `cupo-${Date.now()}` }
    for (let i = 0; i < 6; i++) expect((await tiktokPublisher.publish(cuenta)).kind).toBe('processing')
    const antes = llamadas.length
    expect(await tiktokPublisher.publish(cuenta)).toEqual({ kind: 'deferred' })
    expect(llamadas.length).toBe(antes)
  })

  it('corridas siguientes: el estado decide', async () => {
    const resume = { ...base, containerId: 'v_pub.123' }
    stub({ '/post/publish/status/fetch/': { body: { data: { status: 'PROCESSING_DOWNLOAD' }, ...ok } } })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'processing', containerId: 'v_pub.123' })
    expect(llamadas[0]!.body).toEqual({ publish_id: 'v_pub.123' })

    // Cuerpo crudo: el id es un int64 que JSON.parse redondearía; el publisher lo lee del texto.
    stub({
      '/post/publish/status/fetch/': {
        body: '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7234567890123456789]},"error":{"code":"ok","message":"","log_id":"1"}}',
      },
    })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'published', externalId: '7234567890123456789' })

    stub({ '/post/publish/status/fetch/': { body: { data: { status: 'PUBLISH_COMPLETE' }, ...ok } } })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'published', externalId: null })

    stub({ '/post/publish/status/fetch/': { body: { data: { status: 'SEND_TO_USER_INBOX' }, ...ok } } })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'published', externalId: null })

    stub({ '/post/publish/status/fetch/': { body: { data: { status: 'FAILED', fail_reason: 'auth_removed' }, ...ok } } })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'failed', reason: TIKTOK_RECONECTAR })
  })

  it('una consulta de estado que no responde no gasta intento', async () => {
    const resume = { ...base, containerId: 'v_pub.123' }
    stub({ '/post/publish/status/fetch/': { status: 500, body: { error: { code: 'internal_error' } } } })
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'processing', containerId: 'v_pub.123' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    expect(await tiktokPublisher.publish(resume)).toEqual({ kind: 'processing', containerId: 'v_pub.123' })
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run src/lib/social/publish/tiktok.test.ts`
Expected: FAIL, `tiktokPublisher` no exportado.

- [ ] **Step 3: Escribe el publisher**

Al final de `src/lib/social/publish/tiktok.ts`, con estos imports sumados arriba:

```ts
import { PUBLISH_NETWORK_ERROR, type PublishInput, type PublishOutcome, type Publisher } from './publisher'
import { TIKTOK_SIN_PRIVACIDAD, validarOpciones, type OpcionesTikTok } from './opciones'
import { TIKTOK_MEDIA } from './validate'
import { consultarCreador, TIKTOK_RECONECTAR, type CreadorTikTok } from './tiktok-creador'
```

(funde el import de `./tiktok-creador` con el que ya existe) y el cuerpo:

```ts
const API = 'https://open.tiktokapis.com/v2'
const cupo = new CupoInit()

type Respuesta = {
  status: number
  body: { data?: unknown; error?: { code?: string; message?: string } } | null
  /** El JSON tal como vino: los ids de video son int64 y solo aquí conservan sus dígitos. */
  texto: string
}

/** POST JSON con bearer; null solo si la red no respondió (el llamador decide qué significa). */
async function postJson(path: string, token: string, body: unknown): Promise<Respuesta | null> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    console.error('TikTok', path, String(error).slice(0, 300))
    return null
  }
  const texto = await response.text()
  let parsed: Respuesta['body'] = null
  try {
    parsed = JSON.parse(texto) as Respuesta['body']
  } catch {
    // Sin JSON: el status y el código ausente deciden abajo.
  }
  return { status: response.status, body: parsed, texto }
}

function codigo(r: Respuesta | null): string | undefined {
  return r?.body?.error?.code
}

function esOk(r: Respuesta | null): r is Respuesta {
  return r !== null && r.status >= 200 && r.status < 300 && (codigo(r) === undefined || codigo(r) === 'ok')
}

export const tiktokPublisher: Publisher = {
  network: 'tiktok',

  async publish(input: PublishInput): Promise<PublishOutcome> {
    // Corridas siguientes: el publish_id ya existe; solo se pregunta cómo va.
    if (input.containerId) {
      const r = await postJson('/post/publish/status/fetch/', input.token, { publish_id: input.containerId })
      if (!esOk(r)) {
        // Un poll que no respondió no dice nada del post: seguir esperando, nunca
        // reintentar el init (subiría una segunda copia). El corte de 24 h sigue vigente.
        console.error('TikTok status/fetch:', r?.status, codigo(r), String(r?.body?.error?.message ?? '').slice(0, 300))
        return { kind: 'processing', containerId: input.containerId }
      }
      const veredicto = veredictoEstado(r.body?.data, idsDesdeTexto(r.texto))
      if (veredicto.kind === 'complete') return { kind: 'published', externalId: veredicto.postId }
      if (veredicto.kind === 'inbox') return { kind: 'published', externalId: null }
      if (veredicto.kind === 'failed') return { kind: 'failed', reason: veredicto.reason }
      return { kind: 'processing', containerId: input.containerId }
    }

    // Primera corrida: validar todo antes de gastar una llamada.
    const check = validarOpciones('tiktok', input.opciones)
    if ('error' in check || !check.opciones) return { kind: 'failed', reason: TIKTOK_SIN_PRIVACIDAD }
    const opciones = check.opciones as OpcionesTikTok
    const media = mediaTikTok(input.media)
    if (!media) return { kind: 'failed', reason: TIKTOK_MEDIA }

    let creador: CreadorTikTok | null = null
    if (opciones.modo === 'directo') {
      const consulta = await consultarCreador(input.token)
      if ('error' in consulta) {
        // Reconectar es un veredicto del dueño; cualquier otra cosa es la red y se reintenta.
        return { kind: 'failed', reason: consulta.error === TIKTOK_RECONECTAR ? TIKTOK_RECONECTAR : PUBLISH_NETWORK_ERROR }
      }
      creador = consulta.creador
      if (!creador.privacidades.includes(opciones.privacidad)) {
        return { kind: 'failed', reason: TIKTOK_PRIVACIDAD_NO_DISPONIBLE }
      }
    }

    if (!cupo.puede(input.accountExternalId, new Date())) return { kind: 'deferred' }

    const { path, body } = cuerpoInit(opciones, input.caption, media, creador)
    const r = await postJson(path, input.token, body)
    if (r === null) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
    if (!esOk(r)) {
      console.error('TikTok init:', path, r.status, codigo(r), String(r.body?.error?.message ?? '').slice(0, 300))
      const frase = fraseDeInit(codigo(r))
      return frase === 'deferred' ? { kind: 'deferred' } : { kind: 'failed', reason: frase }
    }
    const publishId = (r.body?.data as { publish_id?: unknown } | undefined)?.publish_id
    if (typeof publishId !== 'string' || !publishId) {
      console.error('TikTok init sin publish_id:', path, JSON.stringify(r.body).slice(0, 300))
      return { kind: 'failed', reason: TIKTOK_RECHAZO }
    }
    return { kind: 'processing', containerId: publishId }
  },
}
```

- [ ] **Step 4: Regístralo y amplía los scopes**

`src/lib/social/publish/index.ts`:

```ts
import { tiktokPublisher } from './tiktok'
…
export const PUBLISHERS: Publisher[] = [
  instagramPublisher,
  facebookPublisher,
  threadsPublisher,
  youtubePublisher,
  xPublisher,
  tiktokPublisher,
]
```

`src/app/api/social/[network]/connect/route.ts`, la entrada `tiktok` de `SCOPES`:

```ts
  // video.upload viene pegado a Content Posting API en el portal y video.publish exige
  // Direct Post activado; los cuatro se piden juntos porque TikTok no deja sumar scopes
  // a un token existente: las cuentas conectadas antes deben reconectarse una vez.
  tiktok: 'user.info.basic,video.list,video.upload,video.publish',
```

- [ ] **Step 5: Corre, typecheck y commit**

Run: `npx vitest run src/lib/social/publish/tiktok.test.ts src/lib/social/publish && npm run typecheck`
Expected: PASS (24 tests en `tiktok.test.ts`: los 15 puros más 9 de `publish`) y sin errores.

```bash
git add src/lib/social/publish/tiktok.ts src/lib/social/publish/tiktok.test.ts src/lib/social/publish/index.ts "src/app/api/social/[network]/connect/route.ts"
git commit -m "Publica en TikTok desde el cron: directo o borrador, video o fotos, con los scopes nuevos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 4: El calendario dice «En tu bandeja de TikTok»

**Files:**
- Create: `src/app/admin/(dash)/schedule/etiqueta.ts`
- Test: `src/app/admin/(dash)/schedule/etiqueta.test.ts`
- Modify: `src/app/admin/(dash)/schedule/queue.tsx:12-17, 105-110`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `etiquetaDestino(target: { network: string; status: string; externalId: string | null; opciones: unknown }): string`.

- [ ] **Step 1: Escribe el test que falla**

`src/app/admin/(dash)/schedule/etiqueta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { etiquetaDestino } from './etiqueta'

describe('etiquetaDestino', () => {
  it('los estados de siempre', () => {
    expect(etiquetaDestino({ network: 'instagram', status: 'scheduled', externalId: null, opciones: null })).toBe('Programado')
    expect(etiquetaDestino({ network: 'instagram', status: 'publishing', externalId: null, opciones: null })).toBe('Publicando…')
    expect(etiquetaDestino({ network: 'instagram', status: 'published', externalId: '1', opciones: null })).toBe('Publicado')
    expect(etiquetaDestino({ network: 'tiktok', status: 'failed', externalId: null, opciones: { modo: 'borrador' } })).toBe('Falló')
  })

  it('un borrador de TikTok publicado quedó en la bandeja, no en el perfil', () => {
    expect(etiquetaDestino({ network: 'tiktok', status: 'published', externalId: null, opciones: { modo: 'borrador' } })).toBe(
      'En tu bandeja de TikTok',
    )
    // directo privado sin id todavía: publicado igual
    expect(
      etiquetaDestino({ network: 'tiktok', status: 'published', externalId: null, opciones: { modo: 'directo', privacidad: 'SELF_ONLY' } }),
    ).toBe('Publicado')
  })
})
```

- [ ] **Step 2: Corre y confirma que falla**

Run: `npx vitest run "src/app/admin/(dash)/schedule/etiqueta.test.ts"`
Expected: FAIL, import sin resolver.

- [ ] **Step 3: Escribe el módulo y úsalo**

`src/app/admin/(dash)/schedule/etiqueta.ts`:

```ts
// Qué dice el chip de un destino. Puro: la fila que lo dibuja no es la que decide.

const ESTADO: Record<string, string> = {
  scheduled: 'Programado',
  publishing: 'Publicando…',
  published: 'Publicado',
  failed: 'Falló',
}

/**
 * «Publicado» en TikTok tiene dos formas: el post en el perfil, o el borrador que
 * llegó a la bandeja del dueño para terminarlo desde el teléfono. El segundo no tiene
 * id de video —no existe hasta que el dueño lo publique— y el chip lo dice.
 */
export function etiquetaDestino(target: {
  network: string
  status: string
  externalId: string | null
  opciones: unknown
}): string {
  if (target.network === 'tiktok' && target.status === 'published' && esBorrador(target.opciones)) {
    return 'En tu bandeja de TikTok'
  }
  return ESTADO[target.status] ?? target.status
}

function esBorrador(opciones: unknown): boolean {
  return typeof opciones === 'object' && opciones !== null && (opciones as { modo?: unknown }).modo === 'borrador'
}
```

En `src/app/admin/(dash)/schedule/queue.tsx`: borra `STATUS_LABEL`, importa `etiquetaDestino` de `./etiqueta`, y en el chip reemplaza `{STATUS_LABEL[target.status]}` por `{etiquetaDestino(target)}` (`ScheduledPostTarget` ya trae `network`, `status`, `externalId` y `opciones`).

- [ ] **Step 4: Corre, lint, typecheck y commit**

Run: `npx vitest run "src/app/admin/(dash)/schedule/etiqueta.test.ts" && npm run lint && npm run typecheck`
Expected: PASS y sin errores. Si ESLint se queja de que `STATUS_LABEL` ya no se usa, es que quedó una referencia: bórrala.

```bash
git add "src/app/admin/(dash)/schedule/etiqueta.ts" "src/app/admin/(dash)/schedule/etiqueta.test.ts" "src/app/admin/(dash)/schedule/queue.tsx"
git commit -m "Distingue en el calendario el borrador que llegó a la bandeja de TikTok

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

---

### Task 5: Docs, desviaciones en la spec y cierre

**Files:**
- Modify: `README.md:225-237`
- Modify: `.env.example:68-69`
- Modify: `docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md` (§3 tabla de estado, §4 «Los cuatro gemelos», «Las entregas»)
- Modify: `src/app/admin/(dash)/schedule/[id]/editor.tsx:13-16` (solo el comentario)

- [ ] **Step 1: README**

Reemplaza la sección `### TikTok` por:

```markdown
### TikTok

En [developers.tiktok.com](https://developers.tiktok.com), registra una app con los
productos **Login Kit** y **Content Posting API** (con *Direct Post* activado) y los
scopes `user.info.basic`, `video.list`, `video.upload` y `video.publish`. Redirect URI:

```
https://TU-DOMINIO/api/social/tiktok/callback
```

En *URL properties* verifica tu dominio raíz por registro TXT en el DNS: cubre el sitio y
el subdominio de R2 (`R2_PUBLIC_BASE`), de donde TikTok descarga los archivos. No uses el
archivo de firma dentro del bucket: el barrido diario lo borraría.

Mientras TikTok no apruebe la app, solo el **sandbox** deja autorizar cuentas: créalo en
la pestaña Sandbox, agrega tu usuario como *target user*, y usa **sus** credenciales:

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

Al pasar de solo lectura a publicar, las cuentas ya conectadas deben **reconectarse una
vez** desde Cuentas para otorgar los scopes nuevos; el compositor lo pide con «Reconecta
TikTok para autorizar la publicación». Hasta la auditoría de Content Posting, TikTok solo
permite publicar como «Solo yo».
```

- [ ] **Step 2: `.env.example`**

Encima de `TIKTOK_CLIENT_KEY=`:

```
# Del sandbox mientras la app no esté aprobada; los de producción después. Ver README.
```

- [ ] **Step 3: Las tres desviaciones, en la spec**

En §3 «Corridas siguientes», fila `PUBLISH_COMPLETE`, reemplaza el texto de resultado por:

```
`published` con `externalId` = primer `publicaly_available_post_id`, o `null` si la lista viene vacía: un post privado (lo único posible hasta la auditoría) puede no recibir el id nunca, y dejarlo 24 h en «publicando» para terminar en fallo sería mentir sobre un post que salió. Cuando llega, es el mismo `video.id` del connector de lectura y las métricas cruzan
```

En §3 «Primera corrida», punto 2, borra la frase sobre `max_video_post_duration_sec` y `TIKTOK_VIDEO_LARGO`; en su lugar: «La duración no se comprueba localmente: el repo no la conoce y `duration_check_failed` de TikTok la cubre con `TIKTOK_ARCHIVO`.»

En §1, reemplaza «la tarjeta de Cuentas la muestra en rojo con el botón «Reconectar», que ya existe» por: «el chip del destino en el calendario muestra esa frase y el bloque del compositor la repite; la tarjeta de Cuentas no cambia, porque el publisher no escribe en la cuenta».

En §4 «Los cuatro gemelos», reemplaza el párrafo por:

```
`PUBLISHABLE` (`batch.ts`), `ENABLED` (`composer.tsx`) y `PUBLISHERS` (`publish/index.ts`)
tienen `tiktok`. `NETWORKS` del editor **no**: el editor no puede pedir las opciones y la
acción rechaza crear ese destino desde ahí, así que la casilla sería un callejón sin
salida; un destino TikTok ya existente se dibuja y se conserva igual.
```

En «Las entregas», tras el párrafo del PR único, agrega: «Actualización 2026-09-15: la
entrega 1 se fusionó sola (PR #83) a pedido del dueño para probar en producción; la 2 va
en su propio PR y cierra la ventana en que un destino TikTok vencido fallaba en el cron.»

En `editor.tsx`, el comentario sobre `NETWORKS` pierde la mención a «hasta que el publisher (entrega 2) llegue» y queda: `tiktok` no se ofrece aquí porque el editor no puede pedir sus opciones; un destino existente se dibuja vía `drawn`.

- [ ] **Step 4: Verificación completa**

Run: `npm test && npm run typecheck && npm run lint && npx next build`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md "src/app/admin/(dash)/schedule/[id]/editor.tsx"
git commit -m "Documenta el trámite de TikTok con sandbox y anota las desviaciones del publisher en la spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Bt6sz5ddKDJa97rz8CXNGw"
```

`git log --oneline origin/main..HEAD` debe listar seis commits (el plan y los cinco de este plan).
