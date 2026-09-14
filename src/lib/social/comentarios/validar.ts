export const ESCRIBE_RESPUESTA = 'Escribe una respuesta.'

/**
 * Lo que el dueño escribió a mano no se recorta en silencio como un borrador: si se pasa
 * del límite de la red, se le dice cuánto, porque la red lo rechazaría igual.
 */
export function validarRespuesta(
  texto: string,
  limite: number,
): { texto: string } | { error: string } {
  const limpio = texto.trim()
  if (limpio.length === 0) return { error: ESCRIBE_RESPUESTA }
  if ([...limpio].length > limite) {
    return { error: `La respuesta no puede pasar de ${limite} caracteres.` }
  }
  return { texto: limpio }
}
