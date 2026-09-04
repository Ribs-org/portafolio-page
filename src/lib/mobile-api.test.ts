import { describe, expect, it } from 'vitest'
import { parseRango } from './mobile-api'

const now = new Date('2026-06-15T18:00:00Z')

describe('parseRango', () => {
  it('«hoy» son las últimas 24 horas', () => {
    const { from, to } = parseRango('hoy', now)
    expect(to).toEqual(now)
    expect(from).toEqual(new Date('2026-06-14T18:00:00Z'))
  })

  it('7d y 30d cuentan hacia atrás desde ahora', () => {
    expect(parseRango('7d', now).from).toEqual(new Date('2026-06-08T18:00:00Z'))
    expect(parseRango('30d', now).from).toEqual(new Date('2026-05-16T18:00:00Z'))
  })

  it('cualquier otra cosa cae en 7d: la app nunca queda sin datos por un typo', () => {
    expect(parseRango(null, now).from).toEqual(parseRango('7d', now).from)
    expect(parseRango('mañana', now).from).toEqual(parseRango('7d', now).from)
  })
})
