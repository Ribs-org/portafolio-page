import { PUBLISH_NETWORK_ERROR, type PublishInput, type PublishMedia, type PublishOutcome, type Publisher } from './publisher'
import { TIKTOK_SIN_PRIVACIDAD, validarOpciones, type OpcionesTikTok } from './opciones'
import { TIKTOK_MEDIA } from './validate'
import { consultarCreador, TIKTOK_RECONECTAR, type CreadorTikTok } from './tiktok-creador'

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
  const match = /"public(?:a)?ly_available_post_id"\s*:\s*\[([^\]]*)\]/.exec(texto)
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

// Leídas por función y no por el `r` ya angostado: negar `esOk` angosta `r` a `null` (o,
// cuando ya se descartó null antes, a `never`) y el acceso directo `r?.status` no
// tipa contra ese `r` — pasarlo como argumento fresco sí.
function estado(r: Respuesta | null): number | undefined {
  return r?.status
}

function mensaje(r: Respuesta | null): string {
  return r?.body?.error?.message ?? ''
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
        console.error('TikTok status/fetch:', estado(r), codigo(r), mensaje(r).slice(0, 300))
        return { kind: 'processing', containerId: input.containerId }
      }
      // Lo que TikTok contesta en cada sondeo, sin filtrar: cuando un post se queda
      // «publicando» sin avanzar, esta línea es la única forma de saber si la red dice que
      // sigue procesando, que falló con un motivo, o algo que no sabemos leer.
      console.log('TikTok status/fetch:', r.texto.slice(0, 400))
      const veredicto = veredictoEstado(r.body?.data, idsDesdeTexto(r.texto))
      if (veredicto.kind === 'complete') return { kind: 'published', externalId: veredicto.postId }
      if (veredicto.kind === 'inbox') return { kind: 'published', externalId: null }
      if (veredicto.kind === 'failed') return { kind: 'failed', reason: veredicto.reason }
      return { kind: 'processing', containerId: input.containerId }
    }

    // Primera corrida: validar todo antes de gastar una llamada.
    const check = validarOpciones('tiktok', input.opciones)
    if ('error' in check) return { kind: 'failed', reason: check.error }
    if (!check.opciones) return { kind: 'failed', reason: TIKTOK_SIN_PRIVACIDAD }
    const opciones = check.opciones as OpcionesTikTok
    const media = mediaTikTok(input.media)
    if (!media) return { kind: 'failed', reason: TIKTOK_MEDIA }

    // El cupo se revisa antes de gastar la llamada a creator_info: un intento que va a
    // diferirse no debe consultar la red primero.
    if (!cupo.puede(input.accountExternalId, new Date())) return { kind: 'deferred' }

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

    const { path, body } = cuerpoInit(opciones, input.caption, media, creador)
    const r = await postJson(path, input.token, body)
    if (r === null) return { kind: 'failed', reason: PUBLISH_NETWORK_ERROR }
    if (!esOk(r)) {
      console.error('TikTok init:', path, estado(r), codigo(r), mensaje(r).slice(0, 300))
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
