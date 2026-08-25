import { describe, expect, it } from 'vitest'
import { campaignTagFor } from './campaign'

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
    expect(campaignTagFor('threads', 'abc')).toBe('threads-abc')
  })
})
