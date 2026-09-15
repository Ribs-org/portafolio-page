// `creator_info` es la consulta que TikTok exige antes de cada publicación directa: dice
// qué privacidades puede elegir el dueño hoy y qué interacciones tiene bloqueadas. La usa
// el compositor para armar el bloque, y el publisher (publish/tiktok.ts) para confirmar
// antes de subir.
import { PRIVACIDADES_TIKTOK, type PrivacidadTikTok } from './opciones'

const API = 'https://open.tiktokapis.com/v2'

export type CreadorTikTok = {
  nombre: string
  avatarUrl: string | null
  privacidades: PrivacidadTikTok[]
  comentariosDeshabilitados: boolean
  duoDeshabilitado: boolean
  pegarDeshabilitado: boolean
  maxDuracionSeg: number | null
}

export const TIKTOK_RECONECTAR = 'Reconecta TikTok para autorizar la publicación.'
export const TIKTOK_CREADOR_ILEGIBLE = 'No pude leer tu cuenta de TikTok.'
export const TIKTOK_SIN_CUENTA = 'Conecta TikTok en Cuentas antes de programar.'

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Null si TikTok no devolvió ninguna privacidad elegible: sin eso no hay qué mostrar. */
export function normalizarCreador(data: unknown): CreadorTikTok | null {
  if (!esObjeto(data)) return null
  const opciones = Array.isArray(data.privacy_level_options) ? data.privacy_level_options : []
  const privacidades = opciones.filter((p): p is PrivacidadTikTok =>
    (PRIVACIDADES_TIKTOK as readonly unknown[]).includes(p),
  )
  if (privacidades.length === 0) return null
  const nickname = typeof data.creator_nickname === 'string' ? data.creator_nickname : ''
  const username = typeof data.creator_username === 'string' ? data.creator_username : ''
  return {
    nombre: nickname || username,
    avatarUrl: typeof data.creator_avatar_url === 'string' && data.creator_avatar_url ? data.creator_avatar_url : null,
    privacidades,
    comentariosDeshabilitados: data.comment_disabled === true,
    duoDeshabilitado: data.duet_disabled === true,
    pegarDeshabilitado: data.stitch_disabled === true,
    maxDuracionSeg: typeof data.max_video_post_duration_sec === 'number' ? data.max_video_post_duration_sec : null,
  }
}

export async function consultarCreador(token: string): Promise<{ creador: CreadorTikTok } | { error: string }> {
  let response: Response
  try {
    response = await fetch(`${API}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    })
  } catch (error) {
    console.error('TikTok creator_info:', String(error).slice(0, 300))
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }

  let body: { data?: unknown; error?: { code?: string; message?: string } } = {}
  try {
    body = (await response.json()) as typeof body
  } catch {
    // Sin JSON no hay código que leer; el status decide abajo.
  }
  const code = body.error?.code ?? 'ok'
  if (code === 'scope_not_authorized' || code === 'access_token_invalid') return { error: TIKTOK_RECONECTAR }
  if (!response.ok || code !== 'ok') {
    console.error('TikTok creator_info:', response.status, code, String(body.error?.message ?? '').slice(0, 300))
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }
  const creador = normalizarCreador(body.data)
  if (!creador) {
    // JSON.stringify(undefined) es `undefined` (no lanza, pero .slice revienta): pasa
    // cuando el 200 no trae `data`, como un `error.code: 'ok'` sin cuerpo o un body que
    // no era JSON.
    console.error(
      'TikTok creator_info sin privacidades:',
      String(JSON.stringify(body.data) ?? 'sin data').slice(0, 300),
    )
    return { error: TIKTOK_CREADOR_ILEGIBLE }
  }
  return { creador }
}
