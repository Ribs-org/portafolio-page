import { describe, expect, it } from 'vitest'
import { failureEmail } from './alert'

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
