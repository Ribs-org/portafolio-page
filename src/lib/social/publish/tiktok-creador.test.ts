import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/tiktok-creator-info.json'
import {
  TIKTOK_CREADOR_ILEGIBLE,
  TIKTOK_RECONECTAR,
  consultarCreador,
  normalizarCreador,
} from './tiktok-creador'

describe('normalizarCreador', () => {
  it('mapea nombre, avatar, privacidades y qué interacciones están bloqueadas', () => {
    expect(normalizarCreador(fixture.data)).toEqual({
      nombre: 'Ribs',
      avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
      privacidades: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      comentariosDeshabilitados: false,
      duoDeshabilitado: true,
      pegarDeshabilitado: false,
      maxDuracionSeg: 600,
    })
  })

  it('cae al username si no hay nickname, y filtra privacidades que no conoce', () => {
    expect(
      normalizarCreador({ ...fixture.data, creator_nickname: '', privacy_level_options: ['SELF_ONLY', 'RARA'] }),
    ).toMatchObject({ nombre: 'ribs', privacidades: ['SELF_ONLY'] })
  })

  it('sin privacidades no hay creador utilizable', () => {
    expect(normalizarCreador({ ...fixture.data, privacy_level_options: [] })).toBeNull()
    expect(normalizarCreador(null)).toBeNull()
    expect(normalizarCreador('x')).toBeNull()
  })
})

describe('consultarCreador', () => {
  afterEach(() => vi.unstubAllGlobals())

  function respond(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })),
    )
  }

  it('devuelve el creador normalizado y llama al endpoint con el bearer', async () => {
    respond(200, fixture)
    const result = await consultarCreador('tok')
    expect(result).toEqual({ creador: normalizarCreador(fixture.data) })
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(call[0]).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/')
    expect((call[1] as RequestInit).method).toBe('POST')
    expect((call[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('un scope no autorizado pide reconectar', async () => {
    respond(401, { error: { code: 'scope_not_authorized', message: 'x', log_id: '1' } })
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_RECONECTAR })
  })

  it('cualquier otro tropiezo es ilegible, sin filtrar el texto de TikTok', async () => {
    respond(500, { error: { code: 'internal_error', message: 'boom', log_id: '1' } })
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    expect(await consultarCreador('tok')).toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
  })

  it('un 200 con body que no es JSON no revienta: JSON.stringify(undefined) no tiene .slice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    )
    await expect(consultarCreador('tok')).resolves.toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
  })

  it('un 200 con error.code ok pero sin data tampoco revienta', async () => {
    respond(200, { error: { code: 'ok' } })
    await expect(consultarCreador('tok')).resolves.toEqual({ error: TIKTOK_CREADOR_ILEGIBLE })
  })
})
