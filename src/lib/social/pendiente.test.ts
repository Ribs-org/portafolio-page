import { beforeAll, describe, expect, it } from 'vitest'
import { encryptToken } from './crypto'
import { COOKIE_PENDIENTE, PENDIENTE_MAX_AGE, elegidas, leerPendiente, serializarPendiente } from './pendiente'

beforeAll(() => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo-para-hkdf'
})

const pendiente = {
  network: 'facebook',
  accessToken: 'USER-TOKEN',
  refreshToken: null,
  expiresAt: '2026-11-09T00:00:00.000Z',
  candidatas: [
    { externalId: '61550000000001', handle: 'Ribs' },
    { externalId: '61550000000002', handle: null },
  ],
}

describe('serializarPendiente / leerPendiente', () => {
  it('ida y vuelta cifrada', () => {
    const raw = serializarPendiente(pendiente)
    expect(raw).not.toContain('USER-TOKEN')
    expect(leerPendiente(raw)).toEqual(pendiente)
  })

  it('basura, vacío, ausente o manipulado dan null, nunca lanzan', () => {
    expect(leerPendiente(undefined)).toBeNull()
    expect(leerPendiente('')).toBeNull()
    expect(leerPendiente('no-es-una-cookie')).toBeNull()
    const raw = serializarPendiente(pendiente)
    expect(leerPendiente(raw.slice(0, -4) + 'AAAA')).toBeNull()
  })

  it('un payload cifrado con otra forma también da null', () => {
    expect(leerPendiente(encryptToken(JSON.stringify({ network: 'x' })))).toBeNull()
    expect(leerPendiente(encryptToken(JSON.stringify({ ...pendiente, candidatas: [{ handle: 'sin id' }] })))).toBeNull()
  })

  it('la cookie tiene nombre y vida fijos', () => {
    expect(COOKIE_PENDIENTE).toBe('conexion-pendiente')
    expect(PENDIENTE_MAX_AGE).toBe(600)
  })
})

describe('elegidas', () => {
  it('filtra por id conservando el orden de las candidatas y sin repetir', () => {
    expect(elegidas(pendiente.candidatas, ['61550000000002', '61550000000001', '61550000000002'])).toEqual([
      { externalId: '61550000000001', handle: 'Ribs' },
      { externalId: '61550000000002', handle: null },
    ])
  })

  it('un id que no es candidata se ignora: no se conecta lo que Meta no listó', () => {
    expect(elegidas(pendiente.candidatas, ['999'])).toEqual([])
  })
})
