import { describe, expect, it } from 'vitest'
import { formatNumber } from './utils'
import { cortesDeHoy, miradasDe, pieDeAyer, quemados, siguienteCorte, type Corte } from './fuego'

const ZONE = 'America/Santiago'
// 29 de septiembre de 2026, 15:00 en Chile (UTC-3 en horario de verano).
const AHORA = new Date('2026-09-29T18:00:00Z')

function corte(id: string, iso: string, targets: Corte['targets'] = []): Corte {
  return { post: { id, caption: `Corte ${id}`, scheduledAt: new Date(iso) }, targets }
}
const destino = (status: string, lastError: string | null = null): Corte['targets'][number] => ({
  id: `t-${status}`,
  network: 'instagram',
  handle: 'vicente',
  status,
  externalId: null,
  opciones: null,
  lastError,
})

describe('cortesDeHoy', () => {
  it('es lo programado para el día de hoy en la zona del sitio, en orden de hora, salido o no', () => {
    const manana = corte('m', '2026-09-30T12:00:00Z')
    const tarde = corte('t', '2026-09-29T22:00:00Z') // 19:00 en Chile
    const ya = corte('y', '2026-09-29T13:00:00Z') // 10:00 en Chile, ya pasó
    const ayerNoche = corte('a', '2026-09-29T02:30:00Z') // 23:30 del 28 en Chile
    expect(cortesDeHoy([manana, tarde, ya, ayerNoche], AHORA, ZONE).map((c) => c.post.id)).toEqual(['y', 't'])
  })
})

describe('siguienteCorte', () => {
  it('el primero después de ahora, o null si la parrilla está fría hacia adelante', () => {
    const pasado = corte('p', '2026-09-29T13:00:00Z')
    const proximo = corte('n', '2026-10-02T12:00:00Z')
    const lejano = corte('l', '2026-10-05T12:00:00Z')
    expect(siguienteCorte([lejano, pasado, proximo], AHORA)?.post.id).toBe('n')
    expect(siguienteCorte([pasado], AHORA)).toBeNull()
  })
})

describe('quemados', () => {
  it('cada destino fallido con su corte, y nada más', () => {
    const conFallo = corte('f', '2026-09-28T12:00:00Z', [destino('published'), destino('failed', 'Instagram rechazó la publicación.')])
    const sano = corte('s', '2026-09-28T12:00:00Z', [destino('published')])
    const q = quemados([sano, conFallo])
    expect(q).toHaveLength(1)
    expect(q[0]!.corte.post.id).toBe('f')
    expect(q[0]!.destino.status).toBe('failed')
  })
})

describe('pieDeAyer', () => {
  it('cuenta los cortes servidos y solo suma las miradas cuando existen', () => {
    // El número lo formatea `formatNumber` (compacto solo desde 10000): la expectativa se
    // construye con la propia función para no fijar en este test un formato que es de
    // `utils`, y 12345 cubre la forma compacta real («12.3k») además de la estándar.
    expect(pieDeAyer(6, 1234)).toBe(`Ayer: 6 cortes servidos · ${formatNumber(1234)} miradas`)
    expect(pieDeAyer(6, 12345)).toBe(`Ayer: 6 cortes servidos · ${formatNumber(12345)} miradas`)
    expect(pieDeAyer(1, null)).toBe('Ayer: 1 corte servido')
    expect(pieDeAyer(0, null)).toBe('Ayer no salió nada.')
  })
})

describe('miradasDe', () => {
  it('suma el último día de cada post, y un post cuyo último día no trae número no aporta', () => {
    expect(
      miradasDe([
        { postId: 'a', day: '2026-09-27', views: 100 },
        { postId: 'a', day: '2026-09-28', views: 150 },
        { postId: 'b', day: '2026-09-28', views: 20 },
        { postId: 'b', day: '2026-09-27', views: 999 },
        { postId: 'c', day: '2026-09-28', views: null },
      ]),
    ).toBe(170)
  })

  it('un cero de verdad se distingue de «no se sabe»', () => {
    expect(miradasDe([{ postId: 'a', day: '2026-09-28', views: 0 }])).toBe(0)
    expect(miradasDe([{ postId: 'a', day: '2026-09-28', views: null }])).toBeNull()
    expect(miradasDe([])).toBeNull()
  })
})
