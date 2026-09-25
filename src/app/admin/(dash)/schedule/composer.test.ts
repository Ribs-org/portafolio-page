import { describe, expect, it, vi } from 'vitest'

// `composer.tsx` importa `createScheduledPost` de `actions.ts`, que arrastra módulos con
// `server-only` (mismo motivo que en `aislamiento.test.ts`): se sustituye por un módulo
// vacío para poder importar `vieneMarcada` bajo Vitest.
vi.mock('server-only', () => ({}))

const { vieneMarcada, cuentasTikTokIniciales } = await import('./composer')

describe('vieneMarcada', () => {
  it('con una sola cuenta conectada, viene marcada', () => {
    const sola = { id: 'ig-1', connected: true }
    expect(vieneMarcada(sola, [sola])).toBe(true)
  })

  it('con dos cuentas conectadas, no viene ninguna', () => {
    const a = { id: 'ig-1', connected: true }
    const b = { id: 'ig-2', connected: true }
    expect(vieneMarcada(a, [a, b])).toBe(false)
    expect(vieneMarcada(b, [a, b])).toBe(false)
  })

  it('una desconectada no cuenta para decidir ni viene marcada', () => {
    const viva = { id: 'ig-1', connected: true }
    const muerta = { id: 'ig-2', connected: false }
    expect(vieneMarcada(viva, [viva, muerta])).toBe(true)
    expect(vieneMarcada(muerta, [viva, muerta])).toBe(false)
  })
})

describe('cuentasTikTokIniciales', () => {
  // Sin esto, un dueño cuya única cuenta publicable es de TikTok ve la casilla marcada
  // pero ningún bloque de opciones: `cuentasTikTok` seguía naciendo en `[]` porque
  // `onChange` no corre en el primer render.
  it('con una sola cuenta de TikTok conectada, empieza marcada', () => {
    const tt = { id: 'tt-1', network: 'tiktok', connected: true }
    expect(cuentasTikTokIniciales([tt])).toEqual([tt])
  })

  it('con una sola cuenta de Instagram conectada, no hay nada de TikTok que marcar', () => {
    const ig = { id: 'ig-1', network: 'instagram', connected: true }
    expect(cuentasTikTokIniciales([ig])).toEqual([])
  })

  it('con dos cuentas conectadas, ninguna empieza marcada', () => {
    const tt = { id: 'tt-1', network: 'tiktok', connected: true }
    const ig = { id: 'ig-1', network: 'instagram', connected: true }
    expect(cuentasTikTokIniciales([tt, ig])).toEqual([])
  })
})
