import { describe, expect, it, vi } from 'vitest'
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
  resolverDestinos,
} from './mobile-api'
import { CuentaInvalida, type CuentaDestino } from './social/cuentas'

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

  it('rechaza más de 500 MB y tamaños que no son un número no negativo', () => {
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA + 1, UUID)).toEqual({
      error: ARCHIVO_MUY_GRANDE,
    })
    expect(prepararSubida('v.mp4', 'video/mp4', MAX_BYTES_SUBIDA, UUID)).toMatchObject({ mediaType: 'video' })
    expect(prepararSubida('v.mp4', 'video/mp4', '12', UUID)).toEqual({ error: CUERPO_ILEGIBLE })
    expect(prepararSubida('v.mp4', 'video/mp4', -1, UUID)).toEqual({ error: CUERPO_ILEGIBLE })
  })

  it('un tamaño 0 (galería sin dato) no bloquea: el PUT prefirmado no exige Content-Length', () => {
    expect(prepararSubida('v.mp4', 'video/mp4', 0, UUID)).toMatchObject({ mediaType: 'video' })
  })
})

describe('parseBorradorMovil', () => {
  const bueno = { texto: '  Hola  ', redes: ['instagram', 'youtube'], cuando: '2026-09-10T22:00:00.000Z', ahora: false }

  it('recorta el texto y conserva redes, cuando y ahora', () => {
    expect(parseBorradorMovil(bueno)).toEqual({
      texto: 'Hola',
      redes: ['instagram', 'youtube'],
      cuentas: [],
      cuando: '2026-09-10T22:00:00.000Z',
      ahora: false,
    })
  })

  it('texto ausente es texto vacío, y cuando ausente es null', () => {
    expect(parseBorradorMovil({ redes: ['x'], ahora: true })).toEqual({
      texto: '',
      redes: ['x'],
      cuentas: [],
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
    expect(parseBorradorMovil({ ...bueno, redes: ['linkedin'] })).toEqual({
      error: 'Red desconocida o sin publicación: linkedin.',
    })
  })

  it('tiktok es publicable en el lote pero el teléfono aún no la ofrece', () => {
    expect(parseBorradorMovil({ ...bueno, redes: ['tiktok'] })).toEqual({
      error: 'Red desconocida o sin publicación: tiktok.',
    })
    expect(parseBorradorMovil({ ...bueno, redes: ['threads'] })).toMatchObject({
      redes: ['threads'],
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

  /**
   * La Tarea 7: la app nueva manda `cuentas` en vez de `redes` — el cuerpo puede traer
   * una sin la otra. `redes` sigue aceptándose (una app vieja instalada la sigue
   * mandando) pero ya no hace falta.
   */
  it('acepta cuentas en vez de redes, sin redes en el cuerpo', () => {
    expect(parseBorradorMovil({ texto: 'Hola', cuentas: ['cuenta-1', 'cuenta-2'], ahora: true })).toEqual({
      texto: 'Hola',
      redes: [],
      cuentas: ['cuenta-1', 'cuenta-2'],
      cuando: null,
      ahora: true,
    })
  })

  it('cuentas ausente es lista vacía: el cuerpo de una app vieja sigue andando', () => {
    expect(parseBorradorMovil(bueno)).toMatchObject({ cuentas: [] })
  })

  it('quita cuentas repetidas sin quejarse, igual que con redes', () => {
    expect(parseBorradorMovil({ ...bueno, cuentas: ['a', 'a', 'b'] })).toMatchObject({
      cuentas: ['a', 'b'],
    })
  })

  it('rechaza cuentas que no es una lista de strings', () => {
    expect(parseBorradorMovil({ ...bueno, cuentas: 'cuenta-1' })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, cuentas: [1] })).toEqual({ error: CUERPO_ILEGIBLE })
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

describe('resolverDestinos', () => {
  const IG: CuentaDestino = { id: 'c-ig', network: 'instagram', handle: '@ig' }
  const FB: CuentaDestino = { id: 'c-fb', network: 'facebook', handle: '@fb' }
  const TT: CuentaDestino = { id: 'c-tt', network: 'tiktok', handle: '@tt' }

  function deps(over: Partial<{ verificarCuentas: unknown; cuentaUnicaPorRed: unknown }> = {}) {
    return {
      verificarCuentas: vi.fn(),
      cuentaUnicaPorRed: vi.fn(),
      ...over,
    } as unknown as {
      verificarCuentas: (ownerId: string, accountIds: string[]) => Promise<CuentaDestino[]>
      cuentaUnicaPorRed: (ownerId: string, networks: string[]) => Promise<Map<string, CuentaDestino>>
    }
  }

  it('con cuentas, verifica pertenencia y deriva las redes de los destinos reales', async () => {
    const d = deps({ verificarCuentas: vi.fn().mockResolvedValue([IG]) })
    const r = await resolverDestinos('owner-1', { cuentas: ['c-ig'], redes: [] }, d)
    expect(d.verificarCuentas).toHaveBeenCalledWith('owner-1', ['c-ig'])
    expect(d.cuentaUnicaPorRed).not.toHaveBeenCalled()
    expect(r).toEqual({ cuentas: [IG], networks: ['instagram'] })
  })

  it('sin cuentas, resuelve por redes con cuentaUnicaPorRed (camino de una app vieja)', async () => {
    const d = deps({ cuentaUnicaPorRed: vi.fn().mockResolvedValue(new Map([['instagram', IG]])) })
    const r = await resolverDestinos('owner-1', { cuentas: [], redes: ['instagram'] }, d)
    expect(d.cuentaUnicaPorRed).toHaveBeenCalledWith('owner-1', ['instagram'])
    expect(d.verificarCuentas).not.toHaveBeenCalled()
    expect(r).toEqual({ cuentas: [IG], networks: ['instagram'] })
  })

  it('con las dos, cuentas manda: redes se ignora por completo, ni se consulta', async () => {
    const d = deps({ verificarCuentas: vi.fn().mockResolvedValue([IG]) })
    const r = await resolverDestinos('owner-1', { cuentas: ['c-ig'], redes: ['facebook'] }, d)
    expect(d.verificarCuentas).toHaveBeenCalledWith('owner-1', ['c-ig'])
    expect(d.cuentaUnicaPorRed).not.toHaveBeenCalled()
    expect(r).toEqual({ cuentas: [IG], networks: ['instagram'] })
  })

  it('sin ninguna, no consulta nada y devuelve listas vacías sin reventar', async () => {
    const d = deps({ cuentaUnicaPorRed: vi.fn().mockResolvedValue(new Map()) })
    const r = await resolverDestinos('owner-1', { cuentas: [], redes: [] }, d)
    expect(r).toEqual({ cuentas: [], networks: [] })
  })

  it('dos cuentas de redes distintas, ambas publicables: las dos redes quedan', async () => {
    const d = deps({ verificarCuentas: vi.fn().mockResolvedValue([IG, FB]) })
    const r = await resolverDestinos('owner-1', { cuentas: ['c-ig', 'c-fb'], redes: [] }, d)
    expect(r.networks.sort()).toEqual(['facebook', 'instagram'])
  })

  it('una cuenta de una red que el teléfono no publica revienta con la frase de red desconocida', async () => {
    const d = deps({ verificarCuentas: vi.fn().mockResolvedValue([TT]) })
    await expect(resolverDestinos('owner-1', { cuentas: ['c-tt'], redes: [] }, d)).rejects.toThrow(
      'Red desconocida o sin publicación: tiktok.',
    )
  })

  it('mezclada (una publicable y una no), rechaza la fila entera en vez de descartar en silencio', async () => {
    const d = deps({ verificarCuentas: vi.fn().mockResolvedValue([IG, TT]) })
    await expect(resolverDestinos('owner-1', { cuentas: ['c-ig', 'c-tt'], redes: [] }, d)).rejects.toBeInstanceOf(
      CuentaInvalida,
    )
  })

  it('la defensa corre también por el camino de redes, aunque parseBorradorMovil ya lo bloquee antes', async () => {
    // No hay forma de que `borrador.redes` traiga «tiktok» pasando por
    // `parseBorradorMovil` (la rechaza antes), pero `resolverDestinos` no depende de
    // eso: si algo (un cambio futuro, un llamador distinto) le pasa `redes` sin pasar
    // por ese filtro, sigue protegido.
    const d = deps({ cuentaUnicaPorRed: vi.fn().mockResolvedValue(new Map([['tiktok', TT]])) })
    await expect(resolverDestinos('owner-1', { cuentas: [], redes: ['tiktok'] }, d)).rejects.toThrow(
      'Red desconocida o sin publicación: tiktok.',
    )
  })
})
