import { recortar } from './ventana'

export const CLAVE_INSTRUCCIONES = 'comentarios_instrucciones'

/** El tope que el panel le pone al campo; el prompt las lleva enteras en cada llamada. */
export const TOPE_INSTRUCCIONES = 2000

export const INSTRUCCIONES_POR_DEFECTO = `Responde en español, en primera persona, breve y cálido: una o dos frases. Agradece cuando el comentario es un elogio, responde la pregunta cuando la hay, y si preguntan por precios o por trabajar juntos, invita a escribir por mensaje directo sin dar cifras. No inventes datos que no estén en la publicación. No uses hashtags. Un emoji como máximo, y solo si el comentario tiene uno.`

/**
 * Lo guardado manda salvo que esté vacío: unas instrucciones en blanco dejarían al modelo
 * sin ninguna, que es peor que las de la casa.
 */
export function normalizarInstrucciones(bruto: string | null): string {
  const limpio = recortar(bruto ?? '', TOPE_INSTRUCCIONES)
  return limpio.length > 0 ? limpio : INSTRUCCIONES_POR_DEFECTO
}
