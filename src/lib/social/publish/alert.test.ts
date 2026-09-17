import { describe, expect, it } from 'vitest'
import { destinatario, failureEmail } from './alert'

describe('failureEmail', () => {
  it('asunto y cuerpo con la red, el motivo fijo y el comienzo del caption', () => {
    const mail = failureEmail('Nueva rutina en el gimnasio 💪', 'instagram', 'Instagram rechazó la publicación.')
    expect(mail.subject).toBe('No se pudo publicar en Instagram')
    expect(mail.text).toContain('Nueva rutina en el gimnasio 💪')
    expect(mail.text).toContain('Instagram rechazó la publicación.')
  })

  it('recorta un caption kilométrico para que el correo respire', () => {
    const mail = failureEmail('x'.repeat(500), 'instagram', 'motivo')
    expect(mail.text.length).toBeLessThan(400)
  })

  it('capitaliza la red aunque venga en minúscula', () => {
    expect(failureEmail('a', 'facebook', 'm').subject).toBe('No se pudo publicar en Facebook')
  })
})

describe('destinatario', () => {
  it('con correo del dueño devuelve ese', () => {
    process.env.PUBLISH_ALERT_TO = 'despliegue@ejemplo.com'
    expect(destinatario('dueno@ejemplo.com')).toBe('dueno@ejemplo.com')
    delete process.env.PUBLISH_ALERT_TO
  })

  it('con undefined o con espacios devuelve el de PUBLISH_ALERT_TO', () => {
    process.env.PUBLISH_ALERT_TO = 'despliegue@ejemplo.com'
    expect(destinatario(undefined)).toBe('despliegue@ejemplo.com')
    expect(destinatario('   ')).toBe('despliegue@ejemplo.com')
    delete process.env.PUBLISH_ALERT_TO
  })

  it('sin ninguno de los dos devuelve undefined', () => {
    delete process.env.PUBLISH_ALERT_TO
    expect(destinatario(undefined)).toBeUndefined()
  })
})
