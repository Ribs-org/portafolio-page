import { describe, expect, it } from 'vitest'

import { num, pct, shortDate } from './format'

describe('num', () => {
  it('un null es un guion, nunca un cero', () => {
    expect(num(null)).toBe('—')
    expect(num(0)).toBe('0')
  })

  it('los miles se abrevian para que quepan en un teléfono', () => {
    expect(num(842)).toBe('842')
    expect(num(1200)).toBe('1,2 mil')
    expect(num(41838)).toBe('41,8 mil')
    expect(num(1250000)).toBe('1,3 M')
  })
})

describe('pct', () => {
  it('un null es un guion', () => {
    expect(pct(null)).toBe('—')
    expect(pct(7.14)).toBe('7,1%')
  })
})

describe('shortDate', () => {
  it('lee la fecha ISO con offset sin moverla de zona', () => {
    expect(shortDate('2026-09-03T11:06:00-04:00')).toBe('3 sep, 11:06')
  })
})
