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

export function limpiarBorrador(bruto: string, limite: number): string {
  let texto = bruto.trim().replace(PREFIJO, '').trim()
  for (const [abre, cierra] of ENVOLTORIOS) {
    if (texto.length >= 2 && texto.startsWith(abre) && texto.endsWith(cierra)) {
      texto = texto.slice(abre.length, texto.length - cierra.length).trim()
      break
    }
  }
  return recortar(texto, limite)
}
