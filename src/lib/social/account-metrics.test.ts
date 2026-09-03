import { describe, expect, it } from 'vitest'
import {
  normalizeFacebookAccount,
  normalizeInstagramAccount,
  normalizeYoutubeAccount,
} from './account-metrics'

describe('normalizeInstagramAccount', () => {
  // Forma real de la respuesta: `total_value` para las métricas nuevas y `values`
  // para las clásicas, en el mismo array `data`.
  const insights = {
    data: [
      { name: 'profile_views', total_value: { value: 122 } },
      { name: 'views', total_value: { value: 6845 } },
      { name: 'accounts_engaged', total_value: { value: 88 } },
      { name: 'reach', values: [{ value: 130 }, { value: 3206 }] },
    ],
  }

  it('lee ambos formatos y toma la última lectura de las series', () => {
    expect(normalizeInstagramAccount(insights, { followers_count: 1520 })).toEqual({
      followers: 1520,
      totalViews: null,
      videoCount: null,
      profileViews: 122,
      reach: 3206,
      views: 6845,
      accountsEngaged: 88,
    })
  })

  it('lo ausente queda null, nunca cero', () => {
    expect(normalizeInstagramAccount({ data: [] }, {})).toEqual({
      followers: null,
      totalViews: null,
      videoCount: null,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })

  it('una respuesta sin `data` no revienta', () => {
    expect(normalizeInstagramAccount({}, { followers_count: 7 }).followers).toBe(7)
  })
})

describe('normalizeFacebookAccount', () => {
  it('prefiere followers_count y cae a fan_count', () => {
    expect(normalizeFacebookAccount({ followers_count: 1, fan_count: 3 }).followers).toBe(1)
    expect(normalizeFacebookAccount({ fan_count: 3 }).followers).toBe(3)
    expect(normalizeFacebookAccount({}).followers).toBeNull()
  })

  it('no inventa las métricas que la página no da', () => {
    expect(normalizeFacebookAccount({ followers_count: 1 })).toEqual({
      followers: 1,
      totalViews: null,
      videoCount: null,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })
})

describe('normalizeYoutubeAccount', () => {
  it('convierte las cadenas de la API a números', () => {
    expect(
      normalizeYoutubeAccount({ subscriberCount: '1240', viewCount: '58210', videoCount: '96' }),
    ).toEqual({
      followers: 1240,
      totalViews: 58210,
      videoCount: 96,
      profileViews: null,
      reach: null,
      views: null,
      accountsEngaged: null,
    })
  })

  it('un canal que oculta sus suscriptores deja null', () => {
    expect(normalizeYoutubeAccount({ viewCount: '10' }).followers).toBeNull()
    expect(normalizeYoutubeAccount({}).totalViews).toBeNull()
  })
})
