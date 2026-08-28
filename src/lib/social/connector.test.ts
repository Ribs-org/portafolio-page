import { describe, expect, it } from 'vitest'
import { mayConnectAccount } from './connector'

describe('mayConnectAccount', () => {
  it('deja reconectar la misma cuenta', () => {
    // El caso normal: renovar el token cada ~60 días pasa por aquí cada vez.
    expect(mayConnectAccount('17841400000000101', '17841400000000101')).toBe(true)
  })

  it('se niega cuando la cuenta autorizada es otra', () => {
    // Escribir el id de B sobre el de A hace que el siguiente sync lea todo el catálogo
    // de A como borrado. Es el único caso que este predicado existe para impedir.
    expect(mayConnectAccount('17841400000000101', '17841400000000102')).toBe(false)
  })

  it('deja pasar la primera conexión, cuando no hay nada guardado', () => {
    expect(mayConnectAccount(null, '17841400000000101')).toBe(true)
  })

  it('deja pasar cuando la red no informó ningún id', () => {
    // Sin id descubierto no hay nada que comparar, y bloquear aquí dejaría a una red
    // que no publica identificadores sin poder conectarse nunca.
    expect(mayConnectAccount('17841400000000101', null)).toBe(true)
  })

  it('deja pasar cuando faltan los dos', () => {
    expect(mayConnectAccount(null, null)).toBe(true)
  })
})
