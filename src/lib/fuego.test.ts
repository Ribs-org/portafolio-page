import { describe, expect, it } from 'vitest'
import { formatNumber } from './utils'
import {
  avisoDelSiguiente,
  cortesDeHoy,
  horaConDia,
  miradasDe,
  pieDeAyer,
  quemados,
  siguienteCorte,
  type Corte,
} from './fuego'

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

describe('avisoDelSiguiente', () => {
  it('mañana se dice «mañana»; más allá, el día con su mes', () => {
    // «mar 30» obliga a mirar un calendario para entender que es mañana, y la ventana de
    // El Fuego llega a treinta días: sin el mes, «mar 3» no dice de cuál.
    expect(avisoDelSiguiente(new Date('2026-09-30T13:00:00Z'), AHORA, ZONE)).toBe(
      'El siguiente sale mañana a las 10:00.',
    )
    expect(avisoDelSiguiente(new Date('2026-10-23T12:15:00Z'), AHORA, ZONE)).toBe(
      'El siguiente sale el vie 23 de oct a las 09:15.',
    )
  })

  it('el día es el de la zona del sitio, no el del servidor', () => {
    // 02:30 UTC del 1 de octubre son las 23:30 del 30 de septiembre en Chile: mañana.
    expect(avisoDelSiguiente(new Date('2026-10-01T02:30:00Z'), AHORA, ZONE)).toBe(
      'El siguiente sale mañana a las 23:30.',
    )
  })
})

describe('horaConDia', () => {
  it('lo de hoy lleva solo la hora; lo de otro día, su día delante', () => {
    // «Se quemó» no tiene ventana de fecha: sin el día, un fallo de la semana pasada se
    // lee igual que uno de esta mañana en la pantalla que dice qué pide una acción hoy.
    expect(horaConDia(new Date('2026-09-29T22:00:00Z'), AHORA, ZONE)).toBe('19:00')
    expect(horaConDia(new Date('2026-09-25T12:15:00Z'), AHORA, ZONE)).toBe('vie 25 · 09:15')
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

  it('el más reciente arriba: lo de hoy pide la acción antes que lo de la semana pasada', () => {
    const viejo = corte('v', '2026-09-22T12:00:00Z', [destino('failed', 'Falló.')])
    const hoy = corte('h', '2026-09-29T12:00:00Z', [destino('failed', 'Falló.')])
    const medio = corte('m', '2026-09-25T12:00:00Z', [destino('failed', 'Falló.')])
    // Entran en el orden en que los da la base, que es ascendente por hora.
    expect(quemados([viejo, medio, hoy]).map((q) => q.corte.post.id)).toEqual(['h', 'm', 'v'])
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
