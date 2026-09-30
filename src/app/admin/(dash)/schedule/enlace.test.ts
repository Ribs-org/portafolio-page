import { describe, expect, it } from 'vitest'
import { scheduleHref } from './enlace'

describe('scheduleHref', () => {
  it('sin parámetros ni cambios, la ruta pelada', () => {
    expect(scheduleHref({}, {})).toBe('/admin/schedule')
  })

  it('carga lo que venía y aplica el cambio', () => {
    expect(scheduleHref({ vista: 'calendario', semana: '2026-09-28' }, { semana: '2026-10-05' })).toBe(
      '/admin/schedule?vista=calendario&semana=2026-10-05',
    )
  })

  it('un cambio en null borra la clave', () => {
    expect(scheduleHref({ vista: 'calendario', semana: '2026-09-28' }, { vista: null, semana: null })).toBe(
      '/admin/schedule',
    )
  })

  it('«componer» no viaja: la orden de abrir el compositor es de un solo uso', () => {
    // Es de lo que depende «Poner al fuego» de El Fuego: llega con componer=1, y cualquier
    // clic de ahí en adelante —una pestaña, el «volver» del editor— tiene que dejarlo atrás.
    expect(scheduleHref({ componer: '1' }, {})).toBe('/admin/schedule')
    expect(scheduleHref({ componer: '1', vista: 'calendario' }, { vista: 'calendario' })).toBe(
      '/admin/schedule?vista=calendario',
    )
  })

  it('«mensaje» tampoco, que es el desenlace de una vuelta de OAuth', () => {
    expect(scheduleHref({ mensaje: 'cuenta-conectada', vista: 'calendario' }, {})).toBe(
      '/admin/schedule?vista=calendario',
    )
  })

  it('pedir explícitamente un parámetro de un solo uso sí lo escribe', () => {
    // La exclusión es sobre lo que se arrastra, no sobre lo que se pide: sin esto nadie
    // podría construir el enlace que abre el compositor.
    expect(scheduleHref({}, { componer: '1' })).toBe('/admin/schedule?componer=1')
  })

  it('una clave repetida viaja entera', () => {
    expect(scheduleHref({ red: ['tiktok', 'instagram'] }, {})).toBe('/admin/schedule?red=tiktok&red=instagram')
  })
})
