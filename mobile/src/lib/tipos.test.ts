import { describe, expect, it } from 'vitest'

import { ETIQUETA_RANGO, RANGOS } from './tipos'

describe('ETIQUETA_RANGO', () => {
  it('cada rango que la app ofrece tiene rótulo, y ninguno viene vacío', () => {
    for (const rango of RANGOS) {
      expect(ETIQUETA_RANGO[rango]).toBeTypeOf('string')
      expect(ETIQUETA_RANGO[rango].trim()).not.toBe('')
    }
  })

  it('no rotula rangos que no existen', () => {
    expect(Object.keys(ETIQUETA_RANGO).sort()).toEqual([...RANGOS].sort())
  })
})
