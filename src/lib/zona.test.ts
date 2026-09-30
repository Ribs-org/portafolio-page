import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZONA_INVALIDA, ZONA_POR_DEFECTO, esZonaValida, horaEn, zonasDisponibles } from './zona'

/**
 * La derivación corre al cargar el módulo, así que cada caso pone la variable, tira el
 * registro de módulos y vuelve a importar. Es posible acá y no en otros sitios porque este
 * archivo es puro: no arrastra `server-only` ni la base.
 */
async function derivarCon(valor: string | undefined): Promise<string> {
  const antes = process.env.SITE_TIMEZONE
  if (valor === undefined) delete process.env.SITE_TIMEZONE
  else process.env.SITE_TIMEZONE = valor
  vi.resetModules()
  try {
    return (await import('./zona')).SITE_TIMEZONE
  } finally {
    if (antes === undefined) delete process.env.SITE_TIMEZONE
    else process.env.SITE_TIMEZONE = antes
  }
}

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

describe('SITE_TIMEZONE: la derivación de la variable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('una zona válida en el entorno manda', async () => {
    await expect(derivarCon('Europe/Madrid')).resolves.toBe('Europe/Madrid')
  })

  it('sin variable, el respaldo', async () => {
    await expect(derivarCon(undefined)).resolves.toBe('America/Santiago')
  })

  it('una errata avisa y cae al respaldo, en vez de reventar cada render', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(derivarCon('Europa/Madrid')).resolves.toBe('America/Santiago')
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(String(aviso.mock.calls[0]?.[0])).toContain('Europa/Madrid')
  })
})
