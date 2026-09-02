import { describe, expect, it } from 'vitest'
import { diffMedia, diffTargets, PUBLISHED_LOCKED } from './edit'

describe('diffTargets', () => {
  const current = [
    { id: 't1', network: 'instagram', status: 'published' },
    { id: 't2', network: 'x', status: 'failed' },
    { id: 't3', network: 'threads', status: 'scheduled' },
  ]

  it('crea las nuevas, borra las desmarcadas pendientes y re-arma las fallidas que quedan', () => {
    expect(diffTargets(current, ['instagram', 'x', 'facebook'])).toEqual({
      create: ['facebook'],
      deleteIds: ['t3'],
      rearmIds: ['t2'],
    })
  })

  it('desmarcar una red ya publicada es el error fijo', () => {
    expect(diffTargets(current, ['x', 'threads'])).toEqual({ error: PUBLISHED_LOCKED })
  })

  it('una fallida desmarcada se borra, no se re-arma', () => {
    expect(diffTargets(current, ['instagram', 'threads'])).toEqual({
      create: [],
      deleteIds: ['t2'],
      rearmIds: [],
    })
  })

  it('publishing jamás aparece en el plan aunque el form lo desmarque', () => {
    const withPublishing = [{ id: 't9', network: 'youtube', status: 'publishing' }]
    expect(diffTargets(withPublishing, [])).toEqual({ create: [], deleteIds: [], rearmIds: [] })
  })
})

describe('diffMedia', () => {
  it('borra lo quitado y arma el orden final: lo que queda (en su orden) más lo nuevo', () => {
    const added = [{ url: 'https://blob/n1.jpg', mediaType: 'image' as const }]
    expect(diffMedia(['m1', 'm2', 'm3'], ['m3', 'm1'], added)).toEqual({
      deleteIds: ['m2'],
      order: [
        { kind: 'kept', id: 'm3' },
        { kind: 'kept', id: 'm1' },
        { kind: 'new', url: 'https://blob/n1.jpg', mediaType: 'image' },
      ],
    })
  })

  it('un id ajeno en la lista de conservadas se ignora: el form no inventa media', () => {
    expect(diffMedia(['m1'], ['m1', 'hack'], [])).toEqual({
      deleteIds: [],
      order: [{ kind: 'kept', id: 'm1' }],
    })
  })

  it('sin media queda todo vacío', () => {
    expect(diffMedia([], [], [])).toEqual({ deleteIds: [], order: [] })
  })
})
