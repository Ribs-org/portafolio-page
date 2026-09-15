import { afterEach, describe, expect, it, vi } from 'vitest'
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
  tiktokPublisher,
  tituloFoto,
  veredictoEstado,
} from './tiktok'
import { TIKTOK_RECONECTAR, type CreadorTikTok } from './tiktok-creador'
import { TIKTOK_PATROCINADO_PRIVADO, TIKTOK_SIN_PRIVACIDAD } from './opciones'
import { TIKTOK_MEDIA } from './validate'
import { PUBLISH_NETWORK_ERROR } from './publisher'
import fixture from '../fixtures/tiktok-creator-info.json'

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
    // Si TikTok corrige su propio typo a "publicly_available_post_id", se leen igual.
    const corregido = texto.replace('publicaly_available_post_id', 'publicly_available_post_id')
    expect(idsDesdeTexto(corregido)).toEqual(['7234567890123456789', '7234567890123456790'])
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

  let n = 0
  /** Cuenta distinta por test: el cupo por minuto vive en el módulo y no debe cruzarse entre casos. */
  const cuenta = () => `open-${++n}-${Date.now()}`

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
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cuenta() })).toEqual({ kind: 'processing', containerId: 'v_pub.123' })
    expect(llamadas.map((l) => new URL(l.url).pathname)).toEqual([
      '/v2/post/publish/creator_info/query/',
      '/v2/post/publish/video/init/',
    ])
    expect((llamadas[1]!.body as { post_info: { privacy_level: string } }).post_info.privacy_level).toBe('SELF_ONLY')
  })

  it('borrador: sin creator_info, init de bandeja', async () => {
    stub({ '/post/publish/inbox/video/init/': { body: { data: { publish_id: 'v_inbox.1' }, ...ok } } })
    expect(await tiktokPublisher.publish({ ...base, opciones: { modo: 'borrador' }, accountExternalId: cuenta() })).toEqual({
      kind: 'processing',
      containerId: 'v_inbox.1',
    })
    expect(llamadas).toHaveLength(1)
  })

  it('sin opciones o con media que TikTok no toma, falla antes de llamar a nadie', async () => {
    stub({})
    expect(await tiktokPublisher.publish({ ...base, opciones: null, accountExternalId: cuenta() })).toEqual({ kind: 'failed', reason: TIKTOK_SIN_PRIVACIDAD })
    expect(await tiktokPublisher.publish({ ...base, media: [video, foto(1)], accountExternalId: cuenta() })).toEqual({ kind: 'failed', reason: TIKTOK_MEDIA })
    expect(llamadas).toHaveLength(0)
  })

  it('patrocinado y privado falla con su propio motivo, no con el de privacidad faltante', async () => {
    stub({})
    expect(
      await tiktokPublisher.publish({ ...base, opciones: { ...directo, comercial: 'patrocinado' }, accountExternalId: cuenta() }),
    ).toEqual({ kind: 'failed', reason: TIKTOK_PATROCINADO_PRIVADO })
    expect(llamadas).toHaveLength(0)
  })

  it('la privacidad elegida ya no está entre las de la cuenta', async () => {
    stub({
      '/post/publish/creator_info/query/': {
        body: { ...fixture, data: { ...fixture.data, privacy_level_options: ['PUBLIC_TO_EVERYONE'] } },
      },
    })
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cuenta() })).toEqual({ kind: 'failed', reason: TIKTOK_PRIVACIDAD_NO_DISPONIBLE })
  })

  it('creator_info sin scope pide reconectar; sin red, reintenta como error de red', async () => {
    const cta = cuenta()
    stub({ '/post/publish/creator_info/query/': { status: 401, body: { error: { code: 'scope_not_authorized' } } } })
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cta })).toEqual({ kind: 'failed', reason: TIKTOK_RECONECTAR })
    stub({ '/post/publish/creator_info/query/': { status: 500, body: { error: { code: 'internal_error' } } } })
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cta })).toEqual({ kind: 'failed', reason: PUBLISH_NETWORK_ERROR })
  })

  it('el init con error trae su frase, y el cupo de TikTok difiere', async () => {
    const cta = cuenta()
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { status: 400, body: { error: { code: 'url_ownership_unverified', message: 'x' } } },
    })
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cta })).toEqual({ kind: 'failed', reason: TIKTOK_DOMINIO })
    stub({
      '/post/publish/creator_info/query/': { body: fixture },
      '/post/publish/video/init/': { status: 429, body: { error: { code: 'rate_limit_exceeded' } } },
    })
    expect(await tiktokPublisher.publish({ ...base, accountExternalId: cta })).toEqual({ kind: 'deferred' })
    // Prueba que el mapeo viene de la respuesta de TikTok y no del cupo propio: el init sí se llamó.
    expect(new URL(llamadas[llamadas.length - 1]!.url).pathname).toBe('/v2/post/publish/video/init/')
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
