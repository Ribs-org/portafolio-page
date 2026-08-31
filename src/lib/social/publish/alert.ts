import { env } from '@/lib/env'

export function failureEmail(
  caption: string,
  network: string,
  reason: string,
): { subject: string; text: string } {
  const name = network.charAt(0).toUpperCase() + network.slice(1)
  const excerpt = caption.length > 120 ? `${caption.slice(0, 120)}…` : caption
  return {
    subject: `No se pudo publicar en ${name}`,
    text: `La publicación «${excerpt}» falló sus tres intentos en ${name}.\n\nMotivo: ${reason}\n\nRevisa el calendario en /admin/schedule para reprogramarla.`,
  }
}

/**
 * Best-effort by design: the calendar's 'failed' state is the source of truth, and a
 * mail provider outage must never turn into a crashed cron run. Hence the swallow.
 */
export async function sendFailureAlert(caption: string, network: string, reason: string): Promise<void> {
  const apiKey = env('RESEND_API_KEY')
  const to = env('PUBLISH_ALERT_TO')
  if (!apiKey || !to) return

  const { subject, text } = failureEmail(caption, network, reason)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('PUBLISH_ALERT_FROM') ?? 'onboarding@resend.dev',
        to,
        subject,
        text,
      }),
    })
    if (!response.ok) {
      console.error('Resend respondió', response.status, (await response.text()).slice(0, 200))
    }
  } catch (error) {
    console.error('No se pudo enviar el aviso de fallo:', error)
  }
}
