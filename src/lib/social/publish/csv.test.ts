import { describe, expect, it } from 'vitest'
import { CSV_HEADER_ERROR, csvToBatchItems, parseCsv } from './csv'

describe('parseCsv', () => {
  it('separa campos y filas simples', () => {
    expect(parseCsv('a,b,c\nd,e,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ])
  })

  it('las comillas protegen comas, saltos de línea y comillas dobles', () => {
    expect(parseCsv('"hola, mundo","línea\npartida","dijo ""hola"""')).toEqual([
      ['hola, mundo', 'línea\npartida', 'dijo "hola"'],
    ])
  })

  it('tolera CRLF e ignora filas totalmente vacías', () => {
    expect(parseCsv('a,b\r\n\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('csvToBatchItems', () => {
  const header = 'fecha,texto,redes,media'

  it('mapea filas al item del lote, separando redes y media por |', () => {
    const result = csvToBatchItems(
      `${header}\n2026-09-03 10:00,"Hola, lote",threads|x,\n2026-09-03 18:30,Con foto,instagram,https://ej.com/a.jpg|https://ej.com/b.jpg`,
    )
    expect(result).toEqual({
      items: [
        { fecha: '2026-09-03 10:00', texto: 'Hola, lote', redes: ['threads', 'x'], media: [] },
        {
          fecha: '2026-09-03 18:30',
          texto: 'Con foto',
          redes: ['instagram'],
          media: ['https://ej.com/a.jpg', 'https://ej.com/b.jpg'],
        },
      ],
    })
  })

  it('rechaza el lote entero si el encabezado no es el esperado', () => {
    expect(csvToBatchItems('fecha,caption,redes,media\n')).toEqual({ error: CSV_HEADER_ERROR })
    expect(csvToBatchItems('')).toEqual({ error: CSV_HEADER_ERROR })
  })

  it('un CSV con solo encabezado produce cero items', () => {
    expect(csvToBatchItems(header)).toEqual({ items: [] })
  })
})
