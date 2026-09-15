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
        { fecha: '2026-09-03 10:00', texto: 'Hola, lote', redes: ['threads', 'x'], media: [], portada: '' },
        {
          fecha: '2026-09-03 18:30',
          texto: 'Con foto',
          redes: ['instagram'],
          media: ['https://ej.com/a.jpg', 'https://ej.com/b.jpg'],
          portada: '',
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

describe('portada en el CSV', () => {
  it('el encabezado de 5 columnas mapea la portada; celda vacía es sin portada', () => {
    const text = [
      'fecha,texto,redes,media,portada',
      '2026-09-08 19:00,"Corto 1",instagram|youtube,https://ej.com/c01.mp4,https://ej.com/c01.jpg',
      '2026-09-08 20:00,"Sin portada",threads|x,,',
    ].join('\n')
    const result = csvToBatchItems(text)
    if ('error' in result) throw new Error(result.error)
    expect(result.items[0]!.portada).toBe('https://ej.com/c01.jpg')
    expect(result.items[1]!.portada).toBe('')
  })

  it('el encabezado clásico de 4 columnas sigue vivo: portada vacía', () => {
    const text = 'fecha,texto,redes,media\n2026-09-08 19:00,Hola,threads,'
    const result = csvToBatchItems(text)
    if ('error' in result) throw new Error(result.error)
    expect(result.items[0]!.portada).toBe('')
  })

  it('con encabezado de 4 columnas, una quinta celda de más en la fila no es portada', () => {
    const text = 'fecha,texto,redes,media\n2026-09-08 19:00,Hola,threads,,https://ej.com/no-es-portada.jpg'
    const result = csvToBatchItems(text)
    if ('error' in result) throw new Error(result.error)
    expect(result.items[0]!.portada).toBe('')
  })

  it('cinco columnas con otro nombre final rechazan el lote', () => {
    const result = csvToBatchItems('fecha,texto,redes,media,cover\n')
    expect(result).toHaveProperty('error')
  })
})

describe('opciones en el CSV', () => {
  it('la sexta columna trae un JSON por red; celda vacía es sin opciones', () => {
    const text = [
      'fecha,texto,redes,media,portada,opciones',
      '2026-09-16 10:00,Directo,tiktok,https://ej.com/a.mp4,,"{""tiktok"":{""modo"":""directo"",""privacidad"":""SELF_ONLY""}}"',
      '2026-09-16 11:00,Sin opciones,threads,,,',
    ].join('\n')
    const result = csvToBatchItems(text)
    expect(result).toMatchObject({
      items: [
        { redes: ['tiktok'], opciones: { tiktok: { modo: 'directo', privacidad: 'SELF_ONLY' } } },
        { redes: ['threads'], opciones: undefined },
      ],
    })
  })

  it('un JSON roto viaja como texto para que la validación lo rechace con su frase', () => {
    const result = csvToBatchItems('fecha,texto,redes,media,portada,opciones\n2026-09-16 10:00,x,tiktok,,,{no es json')
    expect(result).toMatchObject({ items: [{ opciones: '{no es json' }] })
  })

  it('la sexta columna solo puede llamarse opciones, y solo después de portada', () => {
    expect(csvToBatchItems('fecha,texto,redes,media,portada,extra\n')).toEqual({ error: CSV_HEADER_ERROR })
    expect(csvToBatchItems('fecha,texto,redes,media,opciones\n')).toEqual({ error: CSV_HEADER_ERROR })
  })
})
