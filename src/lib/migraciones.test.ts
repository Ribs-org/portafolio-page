import { describe, expect, it } from 'vitest'
import { SIN_MIGRACIONES, decidirMigracion, filaBaseline } from './migraciones'

describe('decidirMigracion', () => {
  it('sin DATABASE_URL se salta: es el build del CI', () => {
    expect(decidirMigracion({})).toEqual({ accion: 'saltar', motivo: 'sin DATABASE_URL: build sin base, como el CI' })
    expect(decidirMigracion({ databaseUrl: '', vercelEnv: 'production' })).toMatchObject({ accion: 'saltar' })
  })

  it('un preview solo migra con la bandera encendida', () => {
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'preview' })).toEqual({
      accion: 'saltar',
      motivo: 'preview sin rama de Neon propia (MIGRAR_PREVIEWS no es 1)',
    })
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'preview', migrarPreviews: '1' })).toEqual({ accion: 'migrar' })
  })

  it('producción, development y local migran', () => {
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'production' })).toEqual({ accion: 'migrar' })
    expect(decidirMigracion({ databaseUrl: 'postgres://x', vercelEnv: 'development' })).toEqual({ accion: 'migrar' })
    expect(decidirMigracion({ databaseUrl: 'postgres://x' })).toEqual({ accion: 'migrar' })
  })
})

describe('filaBaseline', () => {
  it('es la primera migración por marca de tiempo', () => {
    expect(
      filaBaseline([
        { hash: 'b', folderMillis: 200 },
        { hash: 'a', folderMillis: 100 },
      ]),
    ).toEqual({ hash: 'a', folderMillis: 100 })
  })

  it('sin migraciones lanza con la frase', () => {
    expect(() => filaBaseline([])).toThrow(SIN_MIGRACIONES)
  })
})
