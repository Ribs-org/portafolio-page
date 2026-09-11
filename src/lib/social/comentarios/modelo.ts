import { generateText } from 'ai'
import { env } from '@/lib/env'
import { armarPrompt, type EntradaPrompt } from './prompt'

/** Lo único que el dueño llega a leer cuando el modelo no responde. */
export const SIN_BORRADOR = 'No se pudo redactar la respuesta.'

/**
 * Rápido y barato, que es lo que pide un borrador de dos frases. Se cambia sin desplegar
 * con `COMENTARIOS_MODELO`: la pasarela recibe el string tal cual, así que si el nombre no
 * existe la redacción falla con la frase fija y arreglarlo es una variable de entorno.
 */
export const MODELO_POR_DEFECTO = 'anthropic/claude-haiku-4.5'

/** Dos frases no necesitan más, y el tope acota lo que una respuesta desbocada puede costar. */
const MAX_TOKENS = 300

/** Un borrador que tarda más que esto ya no sirve: la corrida tiene que seguir. */
const TIMEOUT_MS = 20_000

/**
 * Sin credencial no se redacta, y no es un error: el sitio funciona sin la pasarela y los
 * comentarios entran a la cola para responderse a mano. En Vercel el OIDC puede reemplazar
 * a la clave, y por eso también vale `VERCEL_OIDC_TOKEN`.
 */
export function hayPasarela(): boolean {
  return Boolean(env('AI_GATEWAY_API_KEY') || env('VERCEL_OIDC_TOKEN'))
}

export async function pedirBorrador(entrada: EntradaPrompt): Promise<string> {
  const { system, prompt } = armarPrompt(entrada)
  const { text } = await generateText({
    model: env('COMENTARIOS_MODELO') ?? MODELO_POR_DEFECTO,
    instructions: system,
    prompt,
    maxOutputTokens: MAX_TOKENS,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return text
}
