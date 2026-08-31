import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_FACEBOOK_PAGE,
  FacebookPageError,
  NO_FACEBOOK_PAGE,
  PINNED_FACEBOOK_PAGE_MISSING,
  pickFacebookPage,
  type FacebookPagesList,
} from './facebook'

describe('pickFacebookPage', () => {
  it('elige la única página administrable', () => {
    const pages: FacebookPagesList = {
      data: [{ id: '61550000000001', name: 'Ribs', access_token: 'PAGE_TOKEN' }],
    }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000001',
      name: 'Ribs',
      accessToken: 'PAGE_TOKEN',
    })
  })

  it('tolera una página sin nombre o sin token, con null y no inventando', () => {
    const pages: FacebookPagesList = { data: [{ id: '61550000000002' }] }
    expect(pickFacebookPage(pages)).toEqual({
      id: '61550000000002',
      name: null,
      accessToken: null,
    })
  })

  it('falla cuando no hay páginas', () => {
    expect(() => pickFacebookPage({ data: [] })).toThrowError(NO_FACEBOOK_PAGE)
    expect(() => pickFacebookPage({})).toThrowError(NO_FACEBOOK_PAGE)
  })

  const varias: FacebookPagesList = {
    data: [
      { id: '61550000000010', name: 'Personal', access_token: 'T10' },
      { id: '61550000000011', name: 'Gimnasio', access_token: 'T11' },
      { id: '61550000000012', name: 'Proyecto', access_token: 'T12' },
    ],
  }

  it('se niega a elegir cuando hay varias candidatas', () => {
    // Nunca la primera: el orden de me/accounts no es una promesa, y conectar otra
    // página archiva el catálogo entero de la anterior.
    expect(() => pickFacebookPage(varias)).toThrowError(AMBIGUOUS_FACEBOOK_PAGE)
  })

  it('con varias candidatas elige la fijada, no la primera', () => {
    expect(pickFacebookPage(varias, '61550000000012')).toEqual({
      id: '61550000000012',
      name: 'Proyecto',
      accessToken: 'T12',
    })
  })

  it('falla si la página fijada no está entre las disponibles', () => {
    expect(() => pickFacebookPage(varias, '61550000000099')).toThrowError(
      PINNED_FACEBOOK_PAGE_MISSING,
    )
  })

  it('con un pin que no calza, nombra los ids encontrados y no los nombres', () => {
    try {
      pickFacebookPage(varias, '61550000000099')
      expect.unreachable('debía lanzar')
    } catch (error) {
      const { message } = error as FacebookPageError
      expect(message).toContain('61550000000010')
      expect(message).toContain('61550000000012')
      expect(message).not.toContain('Gimnasio')
    }
  })

  it('sin ninguna candidata dice que no hay páginas, aunque haya pin', () => {
    expect(() => pickFacebookPage({ data: [] }, '61550000000099')).toThrowError(
      NO_FACEBOOK_PAGE,
    )
  })

  it('deja las candidatas en el error, no en el mensaje', () => {
    // Los nombres vienen de Meta: sirven para el log del servidor, nunca para el
    // texto que se le muestra a nadie.
    try {
      pickFacebookPage(varias)
      expect.unreachable('debía lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(FacebookPageError)
      const pageError = error as FacebookPageError
      expect(pageError.message).toBe(AMBIGUOUS_FACEBOOK_PAGE)
      expect(pageError.candidates.map((c) => c.id)).toEqual([
        '61550000000010',
        '61550000000011',
        '61550000000012',
      ])
    }
  })
})
