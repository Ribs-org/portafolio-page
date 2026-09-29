import { describe, expect, it } from 'vitest'
import { networkLabel } from '@/lib/networks'
import { colorDeDestino, etiquetaDestino, nombreDestino } from './etiqueta'

describe('nombreDestino', () => {
  it('nombra la red y el handle, para que dos destinos de la misma red se distingan', () => {
    const texto = nombreDestino({ network: 'instagram', handle: '@vicenteclips' })
    expect(texto).toContain('@vicenteclips')
    // La red también: aunque el calendario y la cola ya dibujan un icono de la red
    // (`Redes`), este nombre sigue haciendo falta para el `title`, el `sr-only` y el
    // editor, donde no hay icono.
    expect(texto).toContain(networkLabel('instagram'))
  })

  it('sin handle cae en el nombre de la red', () => {
    expect(nombreDestino({ network: 'instagram', handle: null })).toBe(networkLabel('instagram'))
  })
})

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

describe('colorDeDestino', () => {
  it('solo el fallo y el éxito tiñen; lo demás queda en gris y deja hablar a la cocción', () => {
    expect(colorDeDestino('failed')).toBe('negativo')
    expect(colorDeDestino('published')).toBe('positivo')
    expect(colorDeDestino('scheduled')).toBe('gris')
    expect(colorDeDestino('publishing')).toBe('gris')
    expect(colorDeDestino('lo-que-sea')).toBe('gris')
  })
})
