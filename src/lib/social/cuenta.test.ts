import { describe, expect, it } from 'vitest'
import { SIN_CUENTA, agruparPorRed, planBackfill, primariaDe } from './cuenta'

describe('primariaDe', () => {
  it('la primaria es la más antigua, no la primera de la lista', () => {
    expect(
      primariaDe([
        { id: 'b', createdAt: new Date('2026-09-01') },
        { id: 'a', createdAt: new Date('2026-08-01') },
      ]),
    ).toBe('a')
  })

  it('sin cuentas no hay primaria', () => {
    expect(primariaDe([])).toBeNull()
  })
})

describe('planBackfill', () => {
  it('con una cuenta por red, mapea red → id', () => {
    expect(
      planBackfill([
        { id: 'ig1', network: 'instagram' },
        { id: 'fb1', network: 'facebook' },
      ]),
    ).toEqual(new Map([['instagram', 'ig1'], ['facebook', 'fb1']]))
  })

  it('se niega si una red tiene más de una cuenta: el backfill no adivina', () => {
    expect(
      planBackfill([
        { id: 'fb1', network: 'facebook' },
        { id: 'fb2', network: 'facebook' },
      ]),
    ).toEqual({ error: 'La red facebook tiene 2 cuentas; el backfill necesita exactamente una.' })
  })
})

describe('agruparPorRed', () => {
  it('agrupa conservando el orden de llegada dentro de cada red', () => {
    const grupos = agruparPorRed([
      { id: 'a', network: 'facebook' },
      { id: 'b', network: 'instagram' },
      { id: 'c', network: 'facebook' },
    ])
    expect([...grupos.keys()]).toEqual(['facebook', 'instagram'])
    expect(grupos.get('facebook')!.map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('SIN_CUENTA', () => {
  it('nombra la red', () => {
    expect(SIN_CUENTA('youtube')).toBe('No hay una cuenta de youtube conectada.')
  })
})
