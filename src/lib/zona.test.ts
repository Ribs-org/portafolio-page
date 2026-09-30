import { describe, expect, it } from 'vitest'
import { ZONA_INVALIDA, ZONA_POR_DEFECTO, esZonaValida, horaEn, zonasDisponibles } from './zona'

describe('zona', () => {
  it('la frase, letra por letra', () => {
    expect(ZONA_INVALIDA).toBe('Esa zona horaria no existe.')
    expect(ZONA_POR_DEFECTO).toBe('America/Santiago')
  })
  it('acepta las zonas IANA y rechaza lo demás', () => {
    expect(esZonaValida('America/Santiago')).toBe(true)
    expect(esZonaValida('Europe/Madrid')).toBe(true)
    expect(esZonaValida('UTC')).toBe(true)
    expect(esZonaValida('America/Santiagoo')).toBe(false)
    expect(esZonaValida('')).toBe(false)
    expect(esZonaValida('  ')).toBe(false)
  })
  it('la lista trae las de siempre y la de por defecto', () => {
    const zonas = zonasDisponibles()
    expect(zonas).toContain('America/Santiago')
    expect(zonas).toContain('Europe/Madrid')
    expect(zonas.length).toBeGreaterThan(300)
  })
  it('la hora en una zona, en 24 h', () => {
    const t = new Date('2026-09-30T18:05:00Z')
    expect(horaEn('America/Santiago', t)).toBe('15:05')
    expect(horaEn('Europe/Madrid', t)).toBe('20:05')
    expect(horaEn('UTC', new Date('2026-09-30T00:07:00Z'))).toBe('00:07')
  })
})
