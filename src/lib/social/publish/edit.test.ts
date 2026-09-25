import { describe, expect, it } from 'vitest'
import { diffMedia, diffTargets, PUBLISHED_LOCKED, type TargetLite } from './edit'

/** Atajo de test: una cuenta elegida, con el handle que no importa para estos casos. */
function cuenta(id: string, network: string) {
  return { id, network, handle: null }
}

describe('diffTargets', () => {
  const current = [
    { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'published' },
    { id: 't2', network: 'x', accountId: 'x-1', status: 'failed' },
    { id: 't3', network: 'threads', accountId: 'threads-1', status: 'scheduled' },
  ]

  it('crea las nuevas, borra las desmarcadas pendientes y re-arma las fallidas que quedan', () => {
    expect(
      diffTargets(current, [cuenta('ig-1', 'instagram'), cuenta('x-1', 'x'), cuenta('fb-1', 'facebook')]),
    ).toEqual({
      create: [cuenta('fb-1', 'facebook')],
      deleteIds: ['t3'],
      rearmIds: ['t2'],
    })
  })

  it('desmarcar una cuenta ya publicada es el error fijo', () => {
    expect(diffTargets(current, [cuenta('x-1', 'x'), cuenta('threads-1', 'threads')])).toEqual({
      error: PUBLISHED_LOCKED,
    })
  })

  it('una fallida desmarcada se borra, no se re-arma', () => {
    expect(diffTargets(current, [cuenta('ig-1', 'instagram'), cuenta('threads-1', 'threads')])).toEqual({
      create: [],
      deleteIds: ['t2'],
      rearmIds: [],
    })
  })

  it('publishing jamás aparece en el plan aunque el form lo desmarque', () => {
    const withPublishing = [{ id: 't9', network: 'youtube', accountId: 'yt-1', status: 'publishing' }]
    expect(diffTargets(withPublishing, [])).toEqual({ create: [], deleteIds: [], rearmIds: [] })
  })

  it('quita el destino de una cuenta y conserva el de la otra, misma red', () => {
    const current: TargetLite[] = [
      { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'scheduled' },
      { id: 't2', network: 'instagram', accountId: 'ig-2', status: 'scheduled' },
    ]
    const plan = diffTargets(current, [cuenta('ig-1', 'instagram')])
    expect(plan).toEqual({ create: [], deleteIds: ['t2'], rearmIds: [] })
  })

  it('no deja quitar una cuenta ya publicada', () => {
    const current: TargetLite[] = [
      { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'published' },
    ]
    expect(diffTargets(current, [])).toEqual({ error: PUBLISHED_LOCKED })
  })

  it('rearma el destino fallido de una cuenta que sigue elegida', () => {
    const current: TargetLite[] = [{ id: 't1', network: 'x', accountId: 'x-1', status: 'failed' }]
    expect(diffTargets(current, [cuenta('x-1', 'x')])).toEqual({ create: [], deleteIds: [], rearmIds: ['t1'] })
  })

  it('una publicada y una programada de la misma red: se desmarca la programada y la publicada no bloquea', () => {
    const current: TargetLite[] = [
      { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'published' },
      { id: 't2', network: 'instagram', accountId: 'ig-2', status: 'scheduled' },
    ]
    const plan = diffTargets(current, [cuenta('ig-1', 'instagram')])
    expect(plan).toEqual({ create: [], deleteIds: ['t2'], rearmIds: [] })
  })

  it('dos publicadas de la misma red: desmarcar una es el error fijo', () => {
    const current: TargetLite[] = [
      { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'published' },
      { id: 't2', network: 'instagram', accountId: 'ig-2', status: 'published' },
    ]
    expect(diffTargets(current, [cuenta('ig-1', 'instagram')])).toEqual({ error: PUBLISHED_LOCKED })
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
