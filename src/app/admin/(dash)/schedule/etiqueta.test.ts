import { describe, expect, it } from 'vitest'
import { etiquetaDestino } from './etiqueta'

describe('etiquetaDestino', () => {
  it('los estados de siempre', () => {
    expect(etiquetaDestino({ network: 'instagram', status: 'scheduled', externalId: null, opciones: null })).toBe('Programado')
    expect(etiquetaDestino({ network: 'instagram', status: 'publishing', externalId: null, opciones: null })).toBe('Publicando…')
    expect(etiquetaDestino({ network: 'instagram', status: 'published', externalId: '1', opciones: null })).toBe('Publicado')
    expect(etiquetaDestino({ network: 'tiktok', status: 'failed', externalId: null, opciones: { modo: 'borrador' } })).toBe('Falló')
  })

  it('un borrador de TikTok publicado quedó en la bandeja, no en el perfil', () => {
    expect(etiquetaDestino({ network: 'tiktok', status: 'published', externalId: null, opciones: { modo: 'borrador' } })).toBe(
      'En tu bandeja de TikTok',
    )
    // directo privado sin id todavía: publicado igual
    expect(
      etiquetaDestino({ network: 'tiktok', status: 'published', externalId: null, opciones: { modo: 'directo', privacidad: 'SELF_ONLY' } }),
    ).toBe('Publicado')
  })
})
