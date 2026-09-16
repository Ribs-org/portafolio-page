import 'server-only'
import { env } from './env'

/**
 * Un correo por Resend. Mejor esfuerzo: sin clave no manda y devuelve false; un fallo de
 * Resend va al log y devuelve false. Quien llama decide qué decirle al usuario, que en el
 * ingreso es siempre la misma frase neutra.
 */
export async function enviarCorreo(mensaje: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = env('RESEND_API_KEY')
  if (!apiKey) return false
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('INGRESO_FROM') ?? 'onboarding@resend.dev', ...mensaje }),
    })
    if (!response.ok) {
      console.error('[correo] Resend respondió', response.status, (await response.text()).slice(0, 200))
      return false
    }
    return true
  } catch (error) {
    console.error('[correo]', String(error).slice(0, 300))
    return false
  }
}
