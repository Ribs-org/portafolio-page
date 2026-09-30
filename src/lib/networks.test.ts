import { describe, expect, it } from 'vitest'
import { AVISO_META_EN_REVISION, avisosDe } from './networks'

describe('avisosDe', () => {
  it('cada red dice lo que exige, letra por letra', () => {
    expect(avisosDe('instagram', false)).toEqual([
      'Cuenta Business o Creator, enlazada a una página de Facebook. Una cuenta personal no puede conectar.',
    ])
    expect(avisosDe('facebook', false)).toEqual(['Una página, no un perfil personal.'])
    expect(avisosDe('youtube', false)).toEqual(['Hasta que Google apruebe la cuota de la app, lo que publiques sale privado.'])
    expect(avisosDe('tiktok', false)).toEqual(['Hasta que TikTok apruebe la publicación directa, lo que publiques sale como “Solo yo”.'])
  })

  it('mientras Meta revisa la app, Instagram y Facebook llevan la segunda línea; las demás no', () => {
    expect(AVISO_META_EN_REVISION).toBe(
      'Mientras Meta revisa la app, solo pueden conectar las cuentas que invitamos como testers. Si Facebook dice que la función no está disponible, escríbenos.',
    )
    expect(avisosDe('instagram', true)).toHaveLength(2)
    expect(avisosDe('instagram', true)[1]).toBe(AVISO_META_EN_REVISION)
    expect(avisosDe('facebook', true)).toHaveLength(2)
    expect(avisosDe('tiktok', true)).toHaveLength(1)
    expect(avisosDe('youtube', true)).toHaveLength(1)
  })

  it('una red sin aviso fijo —threads— no dice nada, revise o no revise Meta', () => {
    expect(avisosDe('threads', false)).toEqual([])
    expect(avisosDe('threads', true)).toEqual([])
  })
})
