// Lo que Instagram y Facebook comparten de verdad: el mismo GET contra Graph y el mismo
// cuerpo de error, que solo se diferencian en el nombre de la red del mensaje. Los payloads
// y los normalizadores de cada red no están acá a propósito: no se parecen en nada.

/** El código con el que Graph dice «este objeto ya no está». */
export const GRAPH_OBJETO_AUSENTE = 100

export async function pedirGraph(red: string, url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${red} ${response.status}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

/** El `error.code` del cuerpo, o null si el cuerpo no es JSON o no lo trae. Nunca lanza. */
export function codigoGraph(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } } | null
    const code = parsed?.error?.code
    return typeof code === 'number' ? code : null
  } catch {
    return null
  }
}
