import { recortar } from './ventana'

export type EntradaPrompt = {
  instrucciones: string
  caption: string | null
  comentario: string
  autor: string | null
}

const PAPEL =
  'Eres quien responde los comentarios de las publicaciones de una sola persona, en su nombre. Devuelve únicamente el texto de la respuesta: sin comillas, sin prefijos y sin explicar lo que hiciste.'

export function armarPrompt(entrada: EntradaPrompt): { system: string; prompt: string } {
  const { instrucciones, caption, comentario, autor } = entrada
  const publicacion = caption?.trim() ? caption.trim() : '(publicación sin texto)'
  const quien = autor?.trim() ? `Lo dejó ${autor.trim()}.` : ''
  const prompt = [
    `Publicación:\n${publicacion}`,
    `Comentario:\n${comentario.trim()}`,
    quien,
    'Escribe la respuesta.',
  ]
    .filter((parte) => parte.length > 0)
    .join('\n\n')
  return { system: `${PAPEL}\n\nInstrucciones de la persona:\n${instrucciones}`, prompt }
}

const ENVOLTORIOS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['«', '»'],
  ["'", "'"],
]

/** El modelo a veces se presenta antes de responder; esto es lo que se le ha visto hacer. */
const PREFIJO = /^(respuesta|reply)\s*:\s*/i

/**
 * Las comillas se quitan solo cuando envuelven toda la respuesta. Que empiece con una
 * apertura y termine con su cierre no basta: `"hola" y "chao"` también cumple eso y es
 * dos frases, no un envoltorio — despojarlo dejaría una comilla colgando. Por eso además
 * se exige que el interior no repita el cierre; si lo repite, se corta el bucle igual,
 * sin tocar el texto, para no probar el par siguiente sobre una cadena que ya no
 * empieza como el bucle cree.
 */
export function limpiarBorrador(bruto: string, limite: number): string {
  let texto = bruto.trim().replace(PREFIJO, '').trim()
  for (const [abre, cierra] of ENVOLTORIOS) {
    if (texto.length >= 2 && texto.startsWith(abre) && texto.endsWith(cierra)) {
      const interior = texto.slice(abre.length, texto.length - cierra.length)
      if (!interior.includes(cierra)) texto = interior.trim()
      break
    }
  }
  return recortar(texto, limite)
}
