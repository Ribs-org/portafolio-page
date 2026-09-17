import { describe, expect, it } from 'vitest'
import {
  MAX_CODIGOS_POR_VENTANA,
  MAX_INTENTOS,
  VENTANA_MS,
  VIGENCIA_MS,
  codigoCoincide,
  generarCodigo,
  hashCodigo,
  normalizarCorreo,
  puedePedir,
  vigente,
} from './ingreso'

const now = new Date('2026-09-16T12:00:00Z')

describe('normalizarCorreo', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarCorreo('  Vicente@Ejemplo.CL ')).toBe('vicente@ejemplo.cl')
  })
  it('rechaza lo que no parece correo', () => {
    expect(normalizarCorreo('')).toBeNull()
    expect(normalizarCorreo('sin-arroba')).toBeNull()
    expect(normalizarCorreo('a@b')).toBeNull()
    expect(normalizarCorreo('dos @dominio.cl')).toBeNull()
    expect(normalizarCorreo('a'.repeat(250) + '@x.cl')).toBeNull()
  })
})

describe('generarCodigo y hashCodigo', () => {
  it('seis dígitos, con ceros a la izquierda', () => {
    for (let i = 0; i < 50; i++) expect(generarCodigo()).toMatch(/^\d{6}$/)
  })
  it('el hash es estable, distinto por clave, y coincide en tiempo constante', () => {
    const h = hashCodigo('123456', 'clave')
    expect(h).toBe(hashCodigo('123456', 'clave'))
    expect(h).not.toBe(hashCodigo('123456', 'otra'))
    expect(codigoCoincide('123456', h, 'clave')).toBe(true)
    expect(codigoCoincide('123457', h, 'clave')).toBe(false)
    expect(codigoCoincide('12345', h, 'clave')).toBe(false)
  })
})

describe('vigente', () => {
  const fila = { expiraEn: new Date(now.getTime() + VIGENCIA_MS), usadoEn: null, intentos: 0 }
  it('vale si no venció, no se usó y no agotó intentos', () => {
    expect(vigente(fila, now)).toBe(true)
  })
  it('no vale vencido, usado o agotado', () => {
    expect(vigente({ ...fila, expiraEn: new Date(now.getTime() - 1) }, now)).toBe(false)
    expect(vigente({ ...fila, usadoEn: now }, now)).toBe(false)
    expect(vigente({ ...fila, intentos: MAX_INTENTOS }, now)).toBe(false)
  })
})

describe('puedePedir', () => {
  it('tres por ventana; el cuarto espera', () => {
    const hace = (ms: number) => new Date(now.getTime() - ms)
    expect(puedePedir([], now)).toBe(true)
    expect(puedePedir([hace(1000), hace(2000)], now)).toBe(true)
    expect(puedePedir([hace(1000), hace(2000), hace(3000)], now)).toBe(false)
    expect(puedePedir([hace(VENTANA_MS + 1), hace(2000), hace(3000)], now)).toBe(true)
    expect(MAX_CODIGOS_POR_VENTANA).toBe(3)
  })
})
