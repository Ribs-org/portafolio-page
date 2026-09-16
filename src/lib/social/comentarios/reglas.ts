// La regla de palabra clave: qué es una palabra válida, cuándo un comentario la dice, y
// qué se responde. Puro: sin base, sin red. El orquestador vive en automatico.ts.

/** Meta acepta un solo privado a quien comentó, dentro de este plazo desde el comentario. */
export const DIAS_PRIVADO = 7

export const RESPUESTA_PUBLICA_POR_DEFECTO = 'Te lo mandé por privado 📩'
export const REGLA_PALABRA = 'La palabra clave es una sola palabra, sin espacios, hasta 30 letras.'
export const REGLA_MENSAJE = 'El mensaje del privado va de 1 a 1000 caracteres.'
export const REGLA_RESPUESTA = 'La respuesta pública va de 1 a 300 caracteres.'

export const MAX_PALABRA = 30
export const MAX_MENSAJE = 1000
export const MAX_RESPUESTA = 300
/** Cada automática son dos llamadas a la red dentro de los 120 s del sondeo. */
export const MAX_AUTOMATICAS_POR_CORRIDA = 20

const REDES_CON_PRIVADO = new Set(['instagram', 'facebook'])

export type ReglaLimpia = { palabra: string; mensaje: string; respuestaPublica: string }

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Minúsculas, sin tildes, solo letras y dígitos; null si no sirve como palabra clave. */
export function normalizarPalabra(bruta: string): string | null {
  const limpia = sinTildes(bruta.trim().toLowerCase())
  if (limpia.length === 0 || limpia.length > MAX_PALABRA) return null
  if (!/^[a-z0-9]+$/.test(limpia)) return null
  return limpia
}

/** La palabra completa dentro del texto: «guiar» no dice «guia»; «#GUÍA!» sí. */
export function coincide(texto: string, palabra: string): boolean {
  if (!texto || !palabra) return false
  const tokens = sinTildes(texto.toLowerCase()).split(/[^a-z0-9]+/)
  return tokens.includes(palabra)
}

function mismoHost(a: string, b: string): boolean {
  const limpiar = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return limpiar(a) === limpiar(b)
}

/**
 * Agrega `s=dm-<palabra>` al primer enlace del mensaje que apunte al sitio propio, para que
 * Analítica lo cuente como fila aparte. Un enlace externo no lo lee nuestra analítica y
 * queda igual. La puntuación de cierre de la frase (`.`, `,`, `;`, `:`, `!`, `?`) que haya
 * quedado pegada al final del enlace se saca antes de interpretarlo como URL y se vuelve a
 * pegar después de etiquetarlo, para no mandar esa puntuación como parte del enlace. Si el
 * enlace tiene fragmento (`#…`), la etiqueta va antes de él: un `#` corta la query, así que
 * después de él la etiqueta no llegaría al servidor.
 */
export function enlaceMedible(mensaje: string, palabra: string, sitioHost: string | null): string {
  if (!sitioHost) return mensaje
  let hecho = false
  return mensaje.replace(/https?:\/\/[^\s<>"')\]]+/g, (crudo) => {
    if (hecho) return crudo
    const cierre = crudo.match(/^(.*?)([.,;:!?]+)$/)
    const cuerpo = cierre ? cierre[1] : crudo
    const puntuacion = cierre ? cierre[2] : ''
    let url: URL
    try {
      url = new URL(cuerpo)
    } catch {
      return crudo
    }
    if (!mismoHost(url.hostname, sitioHost)) return crudo
    hecho = true
    const separador = url.search ? '&' : '?'
    const etiquetado = `${url.origin}${url.pathname}${url.search}${separador}s=dm-${palabra}${url.hash}`
    return `${etiquetado}${puntuacion}`
  })
}

function esObjeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * La regla tal como llega del formulario, el lote o el CSV. Sin palabra ni mensaje no hay
 * regla (no es un error: el bloque quedó vacío). Cualquier otra forma se rechaza con la
 * frase del campo que falla.
 */
export function validarRegla(raw: unknown): { regla: ReglaLimpia | null } | { error: string } {
  if (raw === undefined || raw === null) return { regla: null }
  if (!esObjeto(raw)) return { error: REGLA_PALABRA }
  const palabraBruta = typeof raw.palabra === 'string' ? raw.palabra : ''
  const mensaje = typeof raw.mensaje === 'string' ? raw.mensaje.trim() : ''
  const respuestaBruta = typeof raw.respuestaPublica === 'string' ? raw.respuestaPublica.trim() : ''
  if (palabraBruta.trim().length === 0 && mensaje.length === 0) return { regla: null }

  const palabra = normalizarPalabra(palabraBruta)
  if (!palabra) return { error: REGLA_PALABRA }
  if (mensaje.length < 1 || [...mensaje].length > MAX_MENSAJE) return { error: REGLA_MENSAJE }
  const respuestaPublica = respuestaBruta.length > 0 ? respuestaBruta : RESPUESTA_PUBLICA_POR_DEFECTO
  if ([...respuestaPublica].length > MAX_RESPUESTA) return { error: REGLA_RESPUESTA }
  return { regla: { palabra, mensaje, respuestaPublica } }
}

export type Plan =
  | { accion: 'ignorar' }
  | { accion: 'responder'; publico: string; privado: string | null }

/**
 * Qué hacer con un comentario frente a la regla de su post. Si hay privado, el público es
 * la respuesta corta y el mensaje con enlace va por privado; si no lo hay (red sin
 * mensajes, bandera apagada, plazo de Meta vencido), el mensaje con enlace va en público:
 * nunca se promete un privado que no salió. Un autor que ya recibió privado en este post
 * recibe solo la respuesta pública.
 */
export function decidirAutomatica(entrada: {
  texto: string
  esPropio: boolean
  yaRecibioPrivado: boolean
  network: string
  publishedAt: Date
  now: Date
  privadoEncendido: boolean
  regla: ReglaLimpia
  sitioHost: string | null
}): Plan {
  if (entrada.esPropio) return { accion: 'ignorar' }
  if (!coincide(entrada.texto, entrada.regla.palabra)) return { accion: 'ignorar' }

  const mensaje = enlaceMedible(entrada.regla.mensaje, entrada.regla.palabra, entrada.sitioHost)
  const dentroDelPlazo = entrada.now.getTime() - entrada.publishedAt.getTime() < DIAS_PRIVADO * 864e5
  const hayPrivado =
    entrada.privadoEncendido && REDES_CON_PRIVADO.has(entrada.network) && dentroDelPlazo

  if (!hayPrivado) return { accion: 'responder', publico: mensaje, privado: null }
  if (entrada.yaRecibioPrivado) return { accion: 'responder', publico: entrada.regla.respuestaPublica, privado: null }
  return { accion: 'responder', publico: entrada.regla.respuestaPublica, privado: mensaje }
}
