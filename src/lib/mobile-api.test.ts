import { describe, expect, it } from 'vitest'
import {
  AHORA_MS,
  ARCHIVO_MUY_GRANDE,
  CUERPO_ILEGIBLE,
  MAX_BYTES_SUBIDA,
  TIPO_NO_PUBLICABLE,
  parseBorradorMovil,
  parseConteos,
  parseMediaMovil,
  parseRango,
  prepararSubida,
  resolverCuando,
} from './mobile-api'

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

const UUID = '3f2a1b0c-0000-4000-8000-000000000000'

describe('prepararSubida', () => {
  it('arma la key con el prefijo del compositor, el uuid y el nombre base', () => {
    expect(prepararSubida('VID_001.mp4', 'video/mp4', 1000, UUID)).toEqual({
      key: `scheduled/${UUID}-VID_001.mp4`,
      mediaType: 'video',
      tipo: 'video/mp4',
    })
  })

  it('se queda solo con el nombre base: nada de rutas dentro de la key', () => {
    const r = prepararSubida('/storage/emulated/0/DCIM/foto.jpg', 'image/jpeg', 10, UUID)
    expect(r).toMatchObject({ key: `scheduled/${UUID}-foto.jpg` })
    const w = prepararSubida('C:\\Fotos\\foto.jpg', 'image/jpeg', 10, UUID)
    expect(w).toMatchObject({ key: `scheduled/${UUID}-foto.jpg` })
  })

  it('pone la extensión que dicta el tipo cuando el nombre no trae una', () => {
    expect(prepararSubida('clip', 'video/quicktime', 10, UUID)).toMatchObject({
      key: `scheduled/${UUID}-clip.mov`,
    })
    expect(prepararSubida('', 'image/png', 10, UUID)).toMatchObject({
      key: `scheduled/${UUID}-archivo.png`,
    })
  })

  it('recorta nombres largos por el frente, conservando la extensión', () => {
    const largo = `${'a'.repeat(200)}.mp4`
    const r = prepararSubida(largo, 'video/mp4', 10, UUID)
    if ('error' in r) throw new Error(r.error)
    const nombre = r.key.slice(`scheduled/${UUID}-`.length)
    expect(nombre).toHaveLength(100)
    expect(nombre.endsWith('.mp4')).toBe(true)
  })

  it('limpia el content-type de parámetros', () => {
    expect(prepararSubida('a.jpg', 'image/jpeg; charset=binary', 10, UUID)).toMatchObject({
      tipo: 'image/jpeg',
    })
  })

  it('rechaza lo que no es imagen ni video', () => {
    expect(prepararSubida('doc.pdf', 'application/pdf', 10, UUID)).toEqual({ error: TIPO_NO_PUBLICABLE })
    expect(prepararSubida('x', '', 10, UUID)).toEqual({ error: TIPO_NO_PUBLICABLE })
  })

  it('rechaza más de 500 MB y tamaños que no son un número positivo', () => {
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA + 1, UUID)).toEqual({
      error: ARCHIVO_MUY_GRANDE,
    })
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA, UUID)).toMatchObject({ mediaType: 'video' })
    expect(prepararSubida('v.mp4', 'video/mp4', 0, UUID)).toEqual({ error: CUERPO_ILEGIBLE })
    expect(prepararSubida('v.mp4', 'video/mp4', '12', UUID)).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseBorradorMovil', () => {
  const bueno = { texto: '  Hola  ', redes: ['instagram', 'youtube'], cuando: '2026-09-10T22:00:00.000Z', ahora: false }

  it('recorta el texto y conserva redes, cuando y ahora', () => {
    expect(parseBorradorMovil(bueno)).toEqual({
      texto: 'Hola',
      redes: ['instagram', 'youtube'],
      cuando: '2026-09-10T22:00:00.000Z',
      ahora: false,
    })
  })

  it('texto ausente es texto vacío, y cuando ausente es null', () => {
    expect(parseBorradorMovil({ redes: ['x'], ahora: true })).toEqual({
      texto: '',
      redes: ['x'],
      cuando: null,
      ahora: true,
    })
  })

  it('quita redes repetidas sin quejarse: el índice único las rechazaría después', () => {
    expect(parseBorradorMovil({ ...bueno, redes: ['x', 'x', 'threads'] })).toMatchObject({
      redes: ['x', 'threads'],
    })
  })

  it('rechaza una red desconocida o sin publicación con la frase del lote', () => {
    expect(parseBorradorMovil({ ...bueno, redes: ['tiktok'] })).toEqual({
      error: 'Red desconocida o sin publicación: tiktok.',
    })
  })

  it('rechaza cuerpos que no tienen la forma', () => {
    expect(parseBorradorMovil(null)).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil('hola')).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, redes: 'instagram' })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, redes: [1] })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, texto: 5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, cuando: 5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, ahora: 'sí' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseConteos', () => {
  it('lee fotos y videos como enteros no negativos, ausentes = 0', () => {
    expect(parseConteos({ fotos: 2, videos: 1 })).toEqual({ fotos: 2, videos: 1 })
    expect(parseConteos({})).toEqual({ fotos: 0, videos: 0 })
  })

  it('rechaza negativos, decimales y strings', () => {
    expect(parseConteos({ fotos: -1 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseConteos({ videos: 1.5 })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseConteos({ fotos: '2' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('parseMediaMovil', () => {
  it('lee la lista en su orden, que es el del carrusel', () => {
    expect(
      parseMediaMovil({
        media: [
          { url: 'https://m.x/scheduled/a.jpg', mediaType: 'image' },
          { url: 'https://m.x/scheduled/b.mp4', mediaType: 'video' },
        ],
      }),
    ).toEqual([
      { url: 'https://m.x/scheduled/a.jpg', mediaType: 'image' },
      { url: 'https://m.x/scheduled/b.mp4', mediaType: 'video' },
    ])
  })

  it('media ausente es lista vacía', () => {
    expect(parseMediaMovil({})).toEqual([])
  })

  it('rechaza entradas sin url o con un mediaType que no es image ni video', () => {
    expect(parseMediaMovil({ media: [{ mediaType: 'image' }] })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseMediaMovil({ media: [{ url: 'https://m.x/a', mediaType: 'audio' }] })).toEqual({
      error: CUERPO_ILEGIBLE,
    })
    expect(parseMediaMovil({ media: 'https://m.x/a' })).toEqual({ error: CUERPO_ILEGIBLE })
  })
})

describe('resolverCuando', () => {
  const now = new Date('2026-09-09T15:00:00Z')

  it('«ahora» es un minuto adelante: lo que el pinger recoge en su próxima pasada', () => {
    expect(resolverCuando(true, null, now)).toEqual(new Date(now.getTime() + AHORA_MS))
    // Con «ahora», la fecha que venga se ignora.
    expect(resolverCuando(true, '2030-01-01T00:00:00Z', now)).toEqual(new Date(now.getTime() + AHORA_MS))
  })

  it('sin «ahora», el instante ISO tal cual', () => {
    expect(resolverCuando(false, '2026-09-10T22:00:00.000Z', now)).toEqual(new Date('2026-09-10T22:00:00.000Z'))
  })

  it('sin fecha o con una ilegible devuelve null y validateScheduleDraft dice la frase', () => {
    expect(resolverCuando(false, null, now)).toBeNull()
    expect(resolverCuando(false, 'mañana', now)).toBeNull()
    expect(resolverCuando(false, '', now)).toBeNull()
  })
})
