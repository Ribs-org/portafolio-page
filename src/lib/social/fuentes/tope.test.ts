import { describe, expect, it } from 'vitest'
import {
  TOPE_POR_DEFECTO,
  diaDe,
  idMayor,
  leidasHoy,
  normalizarTope,
  serializarContador,
} from './tope'

describe('diaDe', () => {
  it('da el día en UTC, no en la zona de quien corre el test', () => {
    expect(diaDe(new Date('2026-09-11T23:30:00.000Z'))).toBe('2026-09-11')
    expect(diaDe(new Date('2026-09-12T00:30:00.000Z'))).toBe('2026-09-12')
  })
})

describe('leidasHoy', () => {
  it('cuenta lo guardado cuando el día coincide', () => {
    expect(leidasHoy('2026-09-11:120', '2026-09-11')).toBe(120)
  })

  it('vuelve a cero cuando el día cambió', () => {
    expect(leidasHoy('2026-09-10:299', '2026-09-11')).toBe(0)
  })

  it('vuelve a cero cuando no hay nada guardado o está corrupto', () => {
    expect(leidasHoy(null, '2026-09-11')).toBe(0)
    expect(leidasHoy('basura', '2026-09-11')).toBe(0)
    expect(leidasHoy('2026-09-11:abc', '2026-09-11')).toBe(0)
  })
})

describe('serializarContador', () => {
  it('vuelve a leerse igual', () => {
    expect(leidasHoy(serializarContador('2026-09-11', 7), '2026-09-11')).toBe(7)
  })
})

describe('normalizarTope', () => {
  it('usa el de por defecto cuando no hay nada guardado o no es un número', () => {
    expect(normalizarTope(null)).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('muchas')).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('0')).toBe(TOPE_POR_DEFECTO)
    expect(normalizarTope('-5')).toBe(TOPE_POR_DEFECTO)
  })

  it('respeta un número guardado', () => {
    expect(normalizarTope('50')).toBe(50)
  })
})

describe('idMayor', () => {
  it('compara como número, no como texto', () => {
    // Como texto, '9' sería mayor que '10'. Los ids de X crecen y cambian de largo.
    expect(idMayor('9', '10')).toBe('10')
    expect(idMayor('1800000000000000000', '1799999999999999999')).toBe('1800000000000000000')
  })

  it('devuelve el otro cuando uno falta', () => {
    expect(idMayor(null, '10')).toBe('10')
    expect(idMayor('10', null)).toBe('10')
    expect(idMayor(null, null)).toBeNull()
  })

  it('degrada en vez de reventar cuando un id no es un entero', () => {
    expect(idMayor('abc', '10')).toBe('10')
    expect(idMayor('10', 'abc')).toBe('10')
    expect(idMayor('abc', 'def')).toBeNull()
  })
})
