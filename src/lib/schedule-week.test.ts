import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayKey,
  dayLabel,
  groupByDay,
  hourLabel,
  mondayOf,
  mondayOfKey,
  normalizeWeekParam,
  weekDays,
  weekLabel,
} from './schedule-week'

const ZONE = 'America/Santiago'

describe('dayKey y hourLabel', () => {
  it('convierte un instante UTC al día y la hora de la zona', () => {
    // 02:30 UTC del 8 sep = 23:30 del 7 sep en Chile (UTC-3).
    const d = new Date('2026-09-08T02:30:00Z')
    expect(dayKey(d, ZONE)).toBe('2026-09-07')
    expect(hourLabel(d, ZONE)).toBe('23:30')
  })

  it('antes del cambio de horario (6 sep) Chile sigue en UTC-4', () => {
    // 15:00 UTC del 5 sep = 11:00 del 5 sep en Chile (UTC-4, aún invierno).
    const d = new Date('2026-09-05T15:00:00Z')
    expect(dayKey(d, ZONE)).toBe('2026-09-05')
    expect(hourLabel(d, ZONE)).toBe('11:00')
  })
})

describe('mondayOf y mondayOfKey', () => {
  it('encuentra el lunes de la semana de cualquier día', () => {
    expect(mondayOfKey('2026-09-09')).toBe('2026-09-07') // miércoles
    expect(mondayOfKey('2026-09-07')).toBe('2026-09-07') // lunes
    expect(mondayOfKey('2026-09-13')).toBe('2026-09-07') // domingo
  })

  it('respeta la zona: un lunes temprano en Chile sigue siendo de esa semana', () => {
    // 00:00 UTC del lunes 7 = 21:00 del domingo 6 en Chile (UTC-3).
    expect(mondayOf(new Date('2026-09-07T00:00:00Z'), ZONE)).toBe('2026-08-31')
  })
})

describe('addDays y weekDays', () => {
  it('suma días cruzando meses', () => {
    expect(addDays('2026-08-31', 7)).toBe('2026-09-07')
    expect(addDays('2026-09-07', -7)).toBe('2026-08-31')
  })

  it('la semana son 7 días desde el lunes', () => {
    expect(weekDays('2026-09-07')).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
      '2026-09-11', '2026-09-12', '2026-09-13',
    ])
  })
})

describe('normalizeWeekParam', () => {
  const now = new Date('2026-09-09T15:00:00Z')

  it('un lunes válido pasa tal cual; otro día se normaliza a su lunes', () => {
    expect(normalizeWeekParam('2026-09-07', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam('2026-09-10', now, ZONE)).toBe('2026-09-07')
  })

  it('ilegible o fecha imposible cae a la semana actual', () => {
    expect(normalizeWeekParam('mañana', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam('2026-02-31', now, ZONE)).toBe('2026-09-07')
    expect(normalizeWeekParam(undefined, now, ZONE)).toBe('2026-09-07')
  })
})

describe('weekLabel y dayLabel', () => {
  it('misma quincena, mes distinto y cruce de año', () => {
    expect(weekLabel('2026-09-07')).toBe('7 – 13 sep')
    expect(weekLabel('2026-08-31')).toBe('31 ago – 6 sep')
    expect(weekLabel('2026-12-28')).toBe('28 dic 2026 – 3 ene 2027')
  })

  it('la columna dice el día de la semana y el número', () => {
    expect(dayLabel('2026-09-07', 0)).toBe('lun 7')
    expect(dayLabel('2026-09-13', 6)).toBe('dom 13')
  })
})

describe('groupByDay', () => {
  it('agrupa por día de la zona, no del servidor', () => {
    const items = [
      { id: 'a', scheduledAt: new Date('2026-09-08T02:30:00Z') }, // 7 sep en Chile
      { id: 'b', scheduledAt: new Date('2026-09-08T15:00:00Z') }, // 8 sep en Chile
    ]
    const grouped = groupByDay(items, ZONE)
    expect(grouped.get('2026-09-07')?.map((i) => i.id)).toEqual(['a'])
    expect(grouped.get('2026-09-08')?.map((i) => i.id)).toEqual(['b'])
  })
})
