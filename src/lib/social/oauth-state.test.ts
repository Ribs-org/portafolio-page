import { beforeAll, describe, expect, it } from 'vitest'
import { oauthStateMatches, signOAuthState } from './oauth-state'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
})

describe('state de OAuth', () => {
  it('vale para su red y su dueño', async () => {
    const state = await signOAuthState('instagram', 'u1')
    expect(await oauthStateMatches(state, 'instagram', 'u1')).toBe(true)
  })

  it('no vale para otra red ni para otro dueño', async () => {
    const state = await signOAuthState('instagram', 'u1')
    expect(await oauthStateMatches(state, 'tiktok', 'u1')).toBe(false)
    // Lo que impide que alguien termine tu conexión a medias con su propia sesión.
    expect(await oauthStateMatches(state, 'instagram', 'u2')).toBe(false)
    expect(await oauthStateMatches('', 'instagram', 'u1')).toBe(false)
  })
})
