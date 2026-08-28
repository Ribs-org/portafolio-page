import { describe, expect, it } from 'vitest'
import fixture from './fixtures/instagram-media.json'
import {
  AMBIGUOUS_INSTAGRAM_ACCOUNT,
  InstagramAccountError,
  NO_INSTAGRAM_ACCOUNT,
  PINNED_INSTAGRAM_ACCOUNT_MISSING,
  instagramTokenExpiry,
  normalizeInstagramMedia,
  pickInstagramAccount,
  type FacebookPages,
  type InstagramInsights,
  type InstagramMedia,
} from './instagram'

const media = fixture.media as InstagramMedia
const insights = fixture.insights as InstagramInsights
const imageMedia = fixture.imageMedia as InstagramMedia
const imageInsights = fixture.imageInsights as InstagramInsights

describe('normalizeInstagramMedia', () => {
  it('mapea identidad y contenido', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.externalId).toBe('17912345678901234')
    expect(post.permalink).toBe('https://www.instagram.com/reel/C8xK2Lp/')
    expect(post.caption).toBe('Rutina de gimnasio completa 💪 link en bio')
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/thumb.jpg')
    expect(post.mediaType).toBe('reel')
    expect(post.publishedAt.toISOString()).toBe('2026-08-12T18:22:04.000Z')
  })

  it('aplana la forma anidada de insights', () => {
    const post = normalizeInstagramMedia(media, insights)
    expect(post.metrics).toEqual({
      views: 42130,
      reach: 38104,
      likes: 3211,
      comments: 180,
      saves: 640,
      shares: 212,
    })
  })

  it('deja en null la métrica que no vino', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.metrics.reach).toBe(900)
    expect(post.metrics.views).toBeNull()
    expect(post.metrics.likes).toBeNull()
  })

  it('usa media_url cuando no hay thumbnail, que es el caso de las fotos', () => {
    const post = normalizeInstagramMedia(imageMedia, imageInsights)
    expect(post.thumbnailUrl).toBe('https://scontent.cdninstagram.com/v/foto.jpg')
    expect(post.mediaType).toBe('image')
  })

  it('tolera un post sin caption', () => {
    expect(normalizeInstagramMedia(imageMedia, imageInsights).caption).toBeNull()
  })
})

describe('pickInstagramAccount', () => {
  it('saca la cuenta de la única página que la tiene', () => {
    const pages: FacebookPages = {
      data: [
        {
          id: '61550000000001',
          name: 'Vicente Pareja',
          instagram_business_account: { id: '17841400000000001', username: 'vicente' },
        },
      ],
    }
    expect(pickInstagramAccount(pages)).toEqual({
      id: '17841400000000001',
      username: 'vicente',
    })
  })

  it('salta las páginas sin cuenta y devuelve la que sí la tiene', () => {
    const pages: FacebookPages = {
      data: [
        { id: '61550000000002', name: 'Página vieja' },
        { id: '61550000000003', name: 'Página sin Instagram', instagram_business_account: null },
        {
          id: '61550000000004',
          name: 'Página buena',
          instagram_business_account: { id: '17841400000000009', username: 'gimnasio' },
        },
      ],
    }
    // El id que importa es el de Instagram, nunca el de la página que lo contiene.
    expect(pickInstagramAccount(pages)).toEqual({
      id: '17841400000000009',
      username: 'gimnasio',
    })
  })

  it('falla si ninguna página tiene cuenta de Instagram', () => {
    const pages: FacebookPages = {
      data: [{ id: '61550000000005', name: 'Solo Facebook' }],
    }
    expect(() => pickInstagramAccount(pages)).toThrowError(NO_INSTAGRAM_ACCOUNT)
  })

  it('falla cuando no hay páginas', () => {
    expect(() => pickInstagramAccount({ data: [] })).toThrowError(NO_INSTAGRAM_ACCOUNT)
    expect(() => pickInstagramAccount({})).toThrowError(NO_INSTAGRAM_ACCOUNT)
  })

  it('acepta una cuenta sin username en vez de inventarlo', () => {
    const pages: FacebookPages = {
      data: [{ id: '6155000000006', instagram_business_account: { id: '17841400000000010' } }],
    }
    expect(pickInstagramAccount(pages)).toEqual({ id: '17841400000000010', username: null })
  })

  // El dueño tiene tres cuentas de Instagram, así que este es el caso real, no el raro.
  const tresCuentas: FacebookPages = {
    data: [
      {
        id: '61550000000010',
        name: 'Personal',
        instagram_business_account: { id: '17841400000000101', username: 'vicente' },
      },
      { id: '61550000000011', name: 'Página sin Instagram' },
      {
        id: '61550000000012',
        name: 'Gimnasio',
        instagram_business_account: { id: '17841400000000102', username: 'gimnasio' },
      },
      {
        id: '61550000000013',
        name: 'Proyecto',
        instagram_business_account: { id: '17841400000000103', username: 'proyecto' },
      },
    ],
  }

  it('se niega a elegir cuando hay varias candidatas', () => {
    // Nunca la primera: el orden en que Meta lista las páginas no es una promesa, y
    // adivinar aquí archiva el catálogo de la cuenta anterior.
    expect(() => pickInstagramAccount(tresCuentas)).toThrowError(AMBIGUOUS_INSTAGRAM_ACCOUNT)
  })

  it('con varias candidatas elige la fijada, no la primera', () => {
    expect(pickInstagramAccount(tresCuentas, '17841400000000103')).toEqual({
      id: '17841400000000103',
      username: 'proyecto',
    })
  })

  it('falla si la cuenta fijada no está entre las disponibles', () => {
    expect(() => pickInstagramAccount(tresCuentas, '17841400000000999')).toThrowError(
      PINNED_INSTAGRAM_ACCOUNT_MISSING,
    )
  })

  it('con un pin que no calza, nombra los ids encontrados y no los usernames', () => {
    try {
      pickInstagramAccount(tresCuentas, '17841400000000999')
      expect.unreachable('debía lanzar')
    } catch (error) {
      const { message } = error as InstagramAccountError
      expect(message).toContain('17841400000000101')
      expect(message).toContain('17841400000000103')
      expect(message).not.toContain('gimnasio')
      expect(message).not.toContain('vicente')
    }
  })

  it('sin ninguna candidata dice que falta el vínculo, aunque haya pin', () => {
    // Un pin que no calza y cero cuentas vinculadas son diagnósticos distintos: el primero
    // apunta a la cuenta equivocada, el segundo a que ninguna página tiene cuenta asociada.
    expect(() => pickInstagramAccount({ data: [] }, '17841400000000999')).toThrowError(
      NO_INSTAGRAM_ACCOUNT,
    )
  })

  it('deja las candidatas en el error, no en el mensaje', () => {
    // Los usernames vienen de Meta: sirven para el log del servidor, nunca para el texto
    // que se le muestra a nadie.
    try {
      pickInstagramAccount(tresCuentas)
      expect.unreachable('debía lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(InstagramAccountError)
      const accountError = error as InstagramAccountError
      expect(accountError.message).toBe(AMBIGUOUS_INSTAGRAM_ACCOUNT)
      expect(accountError.message).not.toContain('gimnasio')
      expect(accountError.candidates).toEqual([
        { id: '17841400000000101', username: 'vicente' },
        { id: '17841400000000102', username: 'gimnasio' },
        { id: '17841400000000103', username: 'proyecto' },
      ])
    }
  })

  it('una sola candidata sigue sin necesitar la variable', () => {
    const pages: FacebookPages = {
      data: [
        { id: '61550000000014', name: 'Sin Instagram' },
        {
          id: '61550000000015',
          name: 'La única',
          instagram_business_account: { id: '17841400000000104', username: 'unica' },
        },
      ],
    }
    expect(pickInstagramAccount(pages)).toEqual({ id: '17841400000000104', username: 'unica' })
  })
})

describe('instagramTokenExpiry', () => {
  it('usa los ~60 días documentados cuando Meta no dice nada', () => {
    const expiry = instagramTokenExpiry(undefined)
    expect(expiry).not.toBeNull()
    const days = (expiry!.getTime() - Date.now()) / 864e5
    expect(days).toBeGreaterThan(59)
    expect(days).toBeLessThan(61)
  })

  it('respeta el plazo que venga', () => {
    const expiry = instagramTokenExpiry(3600)
    const minutes = (expiry!.getTime() - Date.now()) / 60000
    expect(minutes).toBeGreaterThan(59)
    expect(minutes).toBeLessThan(61)
  })

  it('lee un cero como «no vence», no como «venció recién»', () => {
    // Con `?? 5184000` el cero pasaba de largo y se guardaba Date.now(): una credencial
    // buena marcada como muerta en el mismo instante de escribirla.
    expect(instagramTokenExpiry(0)).toBeNull()
  })
})
