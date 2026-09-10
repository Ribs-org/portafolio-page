import { describe, expect, it } from 'vitest'
import { campaignTagFor, normalizeCampaignTag } from './campaign'

describe('campaignTagFor', () => {
  it('prefija según la red', () => {
    expect(campaignTagFor('instagram', 'C8xK2Lp')).toBe('ig-C8xK2Lp')
    expect(campaignTagFor('tiktok', '7234567890')).toBe('tt-7234567890')
    expect(campaignTagFor('youtube', 'dQw4w9WgXcQ')).toBe('yt-dQw4w9WgXcQ')
  })

  it('es determinista', () => {
    expect(campaignTagFor('instagram', 'C8xK2Lp')).toBe(campaignTagFor('instagram', 'C8xK2Lp'))
  })

  it('limpia lo que no sobrevive a una query string', () => {
    expect(campaignTagFor('instagram', 'abc/def?g h')).toBe('ig-abc-def-g-h')
  })

  it('colapsa separadores repetidos y recorta los de los bordes', () => {
    expect(campaignTagFor('tiktok', '__7234//')).toBe('tt-7234')
  })

  it('acota el largo', () => {
    expect(campaignTagFor('youtube', 'x'.repeat(200)).length).toBeLessThanOrEqual(48)
  })

  it('cae a la red misma como prefijo cuando no la conoce', () => {
    expect(campaignTagFor('unknown', 'abc')).toBe('unknown-abc')
  })
})

describe('campaignTagFor facebook', () => {
  it('acuña la etiqueta con el prefijo fb', () => {
    expect(campaignTagFor('facebook', '61550000000001_1020304050607080')).toBe(
      'fb-61550000000001_1020304050607080',
    )
  })
})

describe('campaignTagFor threads y x', () => {
  it('acuña th- para threads', () => {
    expect(campaignTagFor('threads', '18000000000000001')).toBe('th-18000000000000001')
  })

  it('acuña x- para x', () => {
    expect(campaignTagFor('x', '1830000000000000000')).toBe('x-1830000000000000000')
  })
})

describe('normalizeCampaignTag', () => {
  it('reduce una entrada hecha solo de símbolos a cadena vacía', () => {
    expect(normalizeCampaignTag('😀😀😀')).toBe('')
    expect(normalizeCampaignTag('###???')).toBe('')
  })
})

describe('campaignTagFor con cuenta', () => {
  it('la cuenta primaria acuña el tag de siempre', () => {
    expect(
      campaignTagFor('facebook', '123_456', { primaria: true, handle: 'Gimnasio', externalId: '99' }),
    ).toBe('fb-123_456')
  })

  it('una cuenta secundaria mete su handle corto entre el prefijo y el id', () => {
    expect(
      campaignTagFor('facebook', '123_456', { primaria: false, handle: 'Gimnasio Ribs', externalId: '99' }),
    ).toBe('fb-Gimnasio-123_456')
    expect(
      campaignTagFor('instagram', 'C8xK2Lp', { primaria: false, handle: '@vicente_pareja_j', externalId: '17' }),
    ).toBe('ig-vicente-C8xK2Lp')
  })

  it('sin handle usa el id externo de la cuenta, también recortado a ocho', () => {
    expect(
      campaignTagFor('youtube', 'dQw4w9WgXcQ', { primaria: false, handle: null, externalId: 'UCugxL4FqqBbYHxGmgedfB3w' }),
    ).toBe('yt-UCugxL4F-dQw4w9WgXcQ')
  })

  it('sigue acotado a 48 caracteres', () => {
    expect(
      campaignTagFor('youtube', 'x'.repeat(200), { primaria: false, handle: 'canal', externalId: null }).length,
    ).toBeLessThanOrEqual(48)
  })

  it('un handle que no normaliza a nada cae al id externo', () => {
    expect(
      campaignTagFor('instagram', 'C8', { primaria: false, handle: '@🎉🎉', externalId: '17841400' }),
    ).toBe('ig-17841400-C8')
  })

  it('sin handle ni id externo, el corto es «alt» y nunca colapsa al tag de la cuenta primaria', () => {
    expect(
      campaignTagFor('facebook', '123', { primaria: false, handle: null, externalId: null }),
    ).toBe('fb-alt-123')
  })
})
