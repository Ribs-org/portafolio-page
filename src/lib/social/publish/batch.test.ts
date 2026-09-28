import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaTypeFromUrl,
  tipoArchivo,
  typeFromContentType,
  validateBatchItem,
  destinoPedido,
  clavesDeOpciones,
  opcionesClaveAmbigua,
  opcionesClaveDuplicada,
  opcionesDeFila,
  mediaToBlob,
  scheduleBatch,
  PORTADA_NEEDS_VIDEO,
  PORTADA_NOT_IMAGE,
  PORTADA_FORMAT,
  type BatchItem,
} from './batch'
import { ATRIBUTOS_ERROR } from './atributos'
import { TIKTOK_SIN_PRIVACIDAD, OPCIONES_ERROR, TRIAL_REEL_MEDIA } from './opciones'
import { TIKTOK_MEDIA } from './validate'
import { REGLA_PALABRA, REGLA_MENSAJE, REGLA_DOCUMENTO } from '../comentarios/reglas'
import { verificarCuentas, type CuentaDestino } from '../cuentas'
import { reglasClave } from '@/db'

// `mediaToBlob` sube con `guardar`; sin precedente en el repo para simularlo, resuelto
// igual que en `documento.test.ts` — lo que importa es la clave y el content-type con la
// que se llama, no solo que devuelva algo.
const guardarMock = vi.fn(async (...args: [key: string, body: Blob, contentType: string]) => `https://media.ej.cl/${args[0]}`)
vi.mock('@/lib/storage', () => ({
  guardar: (key: string, body: Blob, contentType: string) => guardarMock(key, body, contentType),
}))

// scheduleBatch es la única función de este archivo que toca la base: se mockea `@/db`
// (patrón de `automatico.test.ts` y `storage-gc.test.ts`, con `importOriginal` para
// conservar las tablas reales) anotando cada `insert` — tabla y valores — en `inserts`,
// para poder afirmar tanto que una fila rechazada no escribe nada como qué URL llegó al
// insert de `reglasClave`.
const { inserts } = vi.hoisted(() => ({ inserts: [] as Array<{ tabla: unknown; valores: unknown }> }))
vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  return {
    ...real,
    getDb: () => ({
      insert: (tabla: unknown) => ({
        values: (valores: unknown) => {
          inserts.push({ tabla, valores })
          return { returning: async () => [{ id: 'post-1' }] }
        },
      }),
    }),
  }
})

// `verificarCuentas`/`cuentaUnicaPorRed` van a la base por su cuenta (`cuentas.ts`); se
// mockean para que `scheduleBatch` reciba un destino fijo sin pasar por `getDb()`, que
// arriba solo sabe responder a `insert`.
vi.mock('../cuentas', async (importOriginal) => {
  const real = await importOriginal<typeof import('../cuentas')>()
  return {
    ...real,
    verificarCuentas: vi.fn(async () => []),
    cuentaUnicaPorRed: vi.fn(
      async () => new Map([['threads', { id: 'threads-1', network: 'threads', handle: 'demo' }]]),
    ),
  }
})

// `documentoToBlob` es la puerta de esta tarea: se mockea para decidir, por test, si el
// documento se pudo traer o no, sin tocar la red de verdad (esa protección la prueba
// `documento.test.ts`).
const documentoToBlobMock = vi.fn()
vi.mock('./documento', () => ({
  documentoToBlob: (url: string): Promise<string | null> => documentoToBlobMock(url),
}))

const now = new Date('2026-09-02T12:00:00Z')
const base: BatchItem = {
  fecha: '2026-09-03 10:00',
  texto: 'Hola lote',
  cuentas: [],
  redes: ['threads', 'x'],
  media: [],
}

describe('mediaTypeFromUrl', () => {
  it('infiere por extensión, ignorando mayúsculas y querystrings', () => {
    expect(mediaTypeFromUrl('https://ej.com/a.JPG')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/b.png?token=x')).toBe('image')
    expect(mediaTypeFromUrl('https://ej.com/c.mp4')).toBe('video')
    expect(mediaTypeFromUrl('https://ej.com/d.webm')).toBe('video')
  })

  it('extensión desconocida es null: no se adivina', () => {
    expect(mediaTypeFromUrl('https://ej.com/archivo.pdf')).toBeNull()
    expect(mediaTypeFromUrl('https://ej.com/sin-extension')).toBeNull()
  })
})

describe('destinoPedido', () => {
  it('nombrar cuentas manda sobre nombrar redes', () => {
    expect(destinoPedido({ ...base, cuentas: ['ig-2'], redes: ['tiktok'] })).toEqual({
      cuentas: ['ig-2'],
    })
  })

  it('sin cuentas, se piden las redes', () => {
    expect(destinoPedido({ ...base, cuentas: [], redes: ['instagram'] })).toEqual({
      redes: ['instagram'],
    })
  })
})

describe('validateBatchItem, destinos', () => {
  it('una fila sin cuentas ni redes se rechaza con una frase útil', () => {
    const item = { ...base, redes: [], cuentas: [] }
    expect(validateBatchItem(item, now)).toMatch(/cuenta/i)
  })

  it('una fila con cuentas y sin redes es válida', () => {
    expect(validateBatchItem({ ...base, redes: [], cuentas: ['ig-1'] }, now)).toBeNull()
  })
})

describe('clavesDeOpciones', () => {
  const ig1: CuentaDestino = { id: 'ig-1', network: 'instagram', handle: '@uno' }
  const tiktokA: CuentaDestino = { id: 'tt-a', network: 'tiktok', handle: '@tta' }
  const tiktokB: CuentaDestino = { id: 'tt-b', network: 'tiktok', handle: '@ttb' }

  it('una clave que es un identificador de cuenta se usa tal cual', () => {
    expect(clavesDeOpciones([ig1, tiktokA], { 'tt-a': { modo: 'borrador' } })).toEqual({
      raw: { 'tt-a': { modo: 'borrador' } },
    })
  })

  it('una clave que nombra una red se resuelve a su única cuenta', () => {
    expect(clavesDeOpciones([ig1, tiktokA], { tiktok: { modo: 'borrador' } })).toEqual({
      raw: { 'tt-a': { modo: 'borrador' } },
    })
  })

  it('con dos destinos de esa red, la clave de red es ambigua y nombra las candidatas', () => {
    expect(clavesDeOpciones([tiktokA, tiktokB], { tiktok: { modo: 'borrador' } })).toEqual({
      error: opcionesClaveAmbigua('tiktok', ['@tta', '@ttb']),
    })
  })

  it('una clave que no es ni un id de la fila ni una de sus redes se ignora', () => {
    expect(clavesDeOpciones([ig1], { facebook: { modo: 'directo' } })).toEqual({ raw: {} })
  })

  it('dos claves que resuelven al mismo destino se pisarían: la fila falla nombrando las dos', () => {
    // 'tt-a' (el id) y 'tiktok' (su única red) resuelven al mismo destino; sin esta
    // regla, la segunda clave en el objeto pisaría en silencio a la primera.
    expect(
      clavesDeOpciones([ig1, tiktokA], {
        'tt-a': { modo: 'borrador' },
        tiktok: { modo: 'directo', privacidad: 'SELF_ONLY' },
      }),
    ).toEqual({ error: opcionesClaveDuplicada('tt-a', 'tiktok') })
  })
})

describe('opcionesDeFila', () => {
  const ig1: CuentaDestino = { id: 'ig-1', network: 'instagram', handle: '@uno' }
  const tiktokA: CuentaDestino = { id: 'tt-a', network: 'tiktok', handle: '@tta' }

  it('con destinos reales, una clave de red se resuelve al id de la cuenta antes de validar', () => {
    // ig1.id / tiktokA.id no son nombres de red: si `opcionesDeFila` no pasara por la
    // normalización de claves, `tiktok` nunca llegaría a mirarse contra `tt-a`.
    const item: BatchItem = { ...base, cuentas: [ig1.id, tiktokA.id], opciones: { tiktok: { modo: 'borrador' } } }
    expect(opcionesDeFila(item, [ig1, tiktokA])).toEqual({ opciones: { 'tt-a': { modo: 'borrador' } } })
  })

  it('con destinos null (comprobación previa a la base), no valida contenido: solo la forma', () => {
    const item: BatchItem = { ...base, cuentas: ['tt-a'], opciones: { tiktok: { modo: 'borrador' } } }
    expect(opcionesDeFila(item, null)).toEqual({ opciones: {} })
    expect(opcionesDeFila({ ...item, opciones: 'no es objeto' }, null)).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('validateBatchItem', () => {
  it('acepta un item de texto puro válido', () => {
    expect(validateBatchItem(base, now)).toBeNull()
  })

  it('rechaza la fecha ilegible con la pista del formato', () => {
    expect(validateBatchItem({ ...base, fecha: 'mañana a las diez' }, now)).toMatch(/YYYY-MM-DD/)
  })

  it('rechaza redes desconocidas o sin publisher', () => {
    expect(validateBatchItem({ ...base, redes: ['linkedin'] }, now)).toMatch(/linkedin/)
    expect(validateBatchItem({ ...base, redes: ['myspace'] }, now)).toMatch(/myspace/)
  })

  it('difiere la extensión desconocida: la URL de Drive pasa y el content-type decide', () => {
    const drive = 'https://drive.usercontent.google.com/download?id=abc&export=download'
    expect(validateBatchItem({ ...base, media: [drive] }, now)).toBeNull()
  })

  it('la media de tipo diferido igual cuenta como archivo en las reglas por cantidad', () => {
    const url = 'https://ej.com/sin-extension'
    expect(validateBatchItem({ ...base, redes: ['instagram'], media: [url] }, now)).toBeNull()
    expect(validateBatchItem({ ...base, redes: ['threads'], media: [url, url] }, now)).toMatch(
      /un solo archivo/,
    )
    expect(validateBatchItem({ ...base, redes: ['x'], media: Array(5).fill(url) }, now)).toMatch(
      /cuatro/,
    )
  })

  it('delega en las reglas del compositor: límites y formas por red', () => {
    expect(validateBatchItem({ ...base, texto: 'x'.repeat(281) }, now)).toMatch(/280/)
    expect(
      validateBatchItem(
        { ...base, redes: ['instagram'], media: [] },
        now,
      ),
    ).toMatch(/archivo/)
    expect(
      validateBatchItem(
        { ...base, redes: ['x'], media: ['https://ej.com/v.mp4'] },
        now,
      ),
    ).toMatch(/video/)
  })

  it('rechaza redes repetidas: el destino es único por post', () => {
    expect(validateBatchItem({ ...base, redes: ['x', 'x'] }, now)).toMatch(/repetidas/)
  })

  it('rechaza fechas ISO con zona o segundos: solo YYYY-MM-DD HH:MM', () => {
    expect(validateBatchItem({ ...base, fecha: '2026-09-03T10:00:00Z' }, now)).toMatch(/YYYY-MM-DD/)
  })
})

describe('typeFromContentType', () => {
  it('mapea image/* y video/* a tipo y extensión, tolerando parámetros', () => {
    expect(typeFromContentType('image/jpeg')).toEqual({
      mediaType: 'image',
      extension: 'jpg',
      tipo: 'image/jpeg',
    })
    expect(typeFromContentType('image/png')).toEqual({
      mediaType: 'image',
      extension: 'png',
      tipo: 'image/png',
    })
    expect(typeFromContentType('video/mp4; codecs=avc1')).toEqual({
      mediaType: 'video',
      extension: 'mp4',
      tipo: 'video/mp4',
    })
    expect(typeFromContentType('video/quicktime')).toEqual({
      mediaType: 'video',
      extension: 'mov',
      tipo: 'video/quicktime',
    })
  })

  it('el tipo canónico descarta los parámetros (charset, codecs)', () => {
    // Es lo que llega a guardar() como ContentType: sin esto Meta y YouTube recibían
    // "video/mp4; charset=binary" en vez de "video/mp4".
    expect(typeFromContentType('video/mp4; charset=binary')?.tipo).toBe('video/mp4')
  })

  it('cualquier otro content-type es null: la fila se rechaza al descargar', () => {
    expect(typeFromContentType('application/pdf')).toBeNull()
    expect(typeFromContentType('text/html; charset=utf-8')).toBeNull()
    expect(typeFromContentType('')).toBeNull()
  })
})

describe('mediaToBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    guardarMock.mockClear()
  })

  it('descarga, sube a R2 y devuelve su URL y tipo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })),
    )
    const stored = await mediaToBlob('https://ej.com/foto.jpg', 'image')
    expect(stored?.mediaType).toBe('image')
    expect(guardarMock).toHaveBeenCalledTimes(1)
    const [key, , contentType] = guardarMock.mock.calls[0]!
    expect(key).toMatch(/^scheduled\/[0-9a-f-]{36}\.jpg$/)
    expect(contentType).toBe('image/jpeg')
    expect(stored?.url).toBe(`https://media.ej.cl/${key}`)
  })

  it('rechaza un host de red interna antes de tocar la red', async () => {
    // Mismo hueco que documentoToBlob (documento.ts): esta media de terceros también la
    // pide el servidor con una URL que trae el CSV. Comparten `descargarSeguro`
    // (descarga-segura.ts), cuya propia suite prueba a fondo qué host se rechaza y por
    // qué. La comprobación de `fetchMock` (no solo el `toBeNull()`) es la que de verdad
    // demuestra que este archivo usa esa protección: un `fetch` que lanza también
    // produce `null` por el `catch`, así que sin ella el test pasaría igual con la
    // comprobación de host borrada.
    const fetchMock = vi.fn(async () => {
      throw new Error('no debía tocar la red')
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await mediaToBlob('http://169.254.169.254/latest/meta-data', null)).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('tipoArchivo', () => {
  it('usa file.type cuando el navegador lo dio', () => {
    const file = new File(['x'], 'video.mov', { type: 'video/quicktime' })
    expect(tipoArchivo(file)).toBe('video/quicktime')
  })

  it('sin file.type, lo infiere de la extensión', () => {
    expect(tipoArchivo(new File(['x'], 'foto.jpg', { type: '' }))).toBe('image/jpeg')
    expect(tipoArchivo(new File(['x'], 'foto.png', { type: '' }))).toBe('image/png')
    expect(tipoArchivo(new File(['x'], 'clip.mp4', { type: '' }))).toBe('video/mp4')
    expect(tipoArchivo(new File(['x'], 'clip.mov', { type: '' }))).toBe('video/quicktime')
  })

  it('sin file.type y con extensión desconocida, devuelve vacío', () => {
    expect(tipoArchivo(new File(['x'], 'archivo.raro', { type: '' }))).toBe('')
  })
})

describe('portada en validateBatchItem', () => {
  const conVideo = { ...base, redes: ['facebook'], media: ['https://ej.com/v.mp4'] }

  it('portada con video en media pasa', () => {
    expect(
      validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.jpg' }, now),
    ).toBeNull()
  })

  it('portada sin ningún video posible es la frase fija', () => {
    expect(
      validateBatchItem({ ...base, media: ['https://ej.com/a.jpg'], redes: ['facebook'], portada: 'https://ej.com/p.jpg' }, now),
    ).toBe(PORTADA_NEEDS_VIDEO)
    expect(validateBatchItem({ ...base, portada: 'https://ej.com/p.jpg' }, now)).toBe(
      PORTADA_NEEDS_VIDEO,
    )
  })

  it('media de tipo diferido mantiene viva la portada: el content-type decidirá', () => {
    const drive = 'https://drive.usercontent.google.com/download?id=x&export=download'
    expect(
      validateBatchItem({ ...base, redes: ['facebook'], media: [drive], portada: 'https://ej.com/p.jpg' }, now),
    ).toBeNull()
  })

  it('portada con extensión de video es la otra frase fija', () => {
    expect(
      validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.mp4' }, now),
    ).toBe(PORTADA_NOT_IMAGE)
  })

  it('portada vacía o ausente no exige nada', () => {
    expect(validateBatchItem({ ...conVideo, portada: '' }, now)).toBeNull()
    expect(validateBatchItem(conVideo, now)).toBeNull()
  })

  it('portada gif o webp: formato no aceptado por Graph', () => {
    expect(validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.gif' }, now)).toBe(
      PORTADA_FORMAT,
    )
    expect(validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.webp' }, now)).toBe(
      PORTADA_FORMAT,
    )
  })

  it('portada png pasa igual que jpg', () => {
    expect(validateBatchItem({ ...conVideo, portada: 'https://ej.com/p.png' }, now)).toBeNull()
  })
})

describe('atributos en validateBatchItem', () => {
  it('un objeto plano pasa; uno inválido es la frase fija', () => {
    expect(validateBatchItem({ ...base, atributos: { hook: 'dato-duro' } }, now)).toBeNull()
    expect(validateBatchItem({ ...base, atributos: ['hook'] }, now)).toBe(ATRIBUTOS_ERROR)
    expect(validateBatchItem({ ...base, atributos: { a: { b: 1 } } }, now)).toBe(ATRIBUTOS_ERROR)
  })

  it('sin atributos no exige nada', () => {
    expect(validateBatchItem(base, now)).toBeNull()
  })
})

describe('opciones por red en el lote', () => {
  const directo = { modo: 'directo', privacidad: 'SELF_ONLY' }

  it('tiktok es publicable, pero exige sus opciones', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem(fila, now)).toBe(TIKTOK_SIN_PRIVACIDAD)
    expect(validateBatchItem({ ...fila, opciones: { tiktok: directo } }, now)).toBeNull()
    expect(validateBatchItem({ ...fila, opciones: { tiktok: { modo: 'borrador' } } }, now)).toBeNull()
  })

  it('las opciones malformadas caen con la frase de forma', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: 'directo' }, now)).toBe(OPCIONES_ERROR)
    expect(validateBatchItem({ ...fila, opciones: { tiktok: { modo: 'ya' } } }, now)).toBe(OPCIONES_ERROR)
  })

  it('una red que no pide opciones no las acepta', () => {
    expect(validateBatchItem({ ...base, opciones: { threads: { modo: 'directo' } } }, now)).toBe(OPCIONES_ERROR)
  })

  it('la media de tiktok se valida por extensión antes de descargar', () => {
    const fila: BatchItem = { ...base, redes: ['tiktok'], opciones: { tiktok: directo }, media: [] }
    expect(validateBatchItem({ ...fila, media: ['https://ej.com/a.png'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateBatchItem({ ...fila, media: ['https://ej.com/a.mp4', 'https://ej.com/b.jpg'] }, now)).toBe(
      TIKTOK_MEDIA,
    )
    expect(validateBatchItem({ ...fila, media: ['https://drive.google.com/uc?id=x'] }, now)).toBeNull()
  })

  it('instagram acepta trialReel con un solo video', () => {
    const fila: BatchItem = { ...base, redes: ['instagram'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialReel: true } } }, now)).toBeNull()
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialReel: false } } }, now)).toBeNull()
  })

  it('un trial reel con fotos, con dos videos o sin video se rechaza por su frase', () => {
    const trial = { ...base, redes: ['instagram'], opciones: { instagram: { trialReel: true } } }
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.jpg'] }, now)).toBe(TRIAL_REEL_MEDIA)
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.mp4', 'https://ej.com/b.jpg'] }, now)).toBe(
      TRIAL_REEL_MEDIA,
    )
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.mp4', 'https://ej.com/b.mp4'] }, now)).toBe(
      TRIAL_REEL_MEDIA,
    )
    expect(validateBatchItem({ ...trial, media: [] }, now)).toBe(TRIAL_REEL_MEDIA)
  })

  it('un link de Drive puede ser el video del trial reel: no se rechaza antes de descargar', () => {
    const trial = { ...base, redes: ['instagram'], opciones: { instagram: { trialReel: true } } }
    expect(validateBatchItem({ ...trial, media: ['https://drive.google.com/uc?id=x'] }, now)).toBeNull()
  })

  it('la forma de instagram se comprueba igual que la de tiktok', () => {
    const fila: BatchItem = { ...base, redes: ['instagram'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialreel: true } } }, now)).toBe(OPCIONES_ERROR)
  })
})

describe('regla de palabra clave en el lote', () => {
  it('acepta una regla completa y una fila sin regla', () => {
    expect(validateBatchItem({ ...base, regla: { palabra: 'GUÍA', mensaje: 'Toma: https://x.cl' } }, now)).toBeNull()
    expect(validateBatchItem({ ...base, regla: undefined }, now)).toBeNull()
  })

  it('rechaza la regla malformada con la frase del campo', () => {
    expect(validateBatchItem({ ...base, regla: { palabra: 'dos palabras', mensaje: 'm' } }, now)).toBe(REGLA_PALABRA)
    expect(validateBatchItem({ ...base, regla: { palabra: 'guia' } }, now)).toBe(REGLA_MENSAJE)
    expect(validateBatchItem({ ...base, regla: 'guia' }, now)).toBe(REGLA_PALABRA)
  })

  it('una regla con documentoUrl que no es URL absoluta rechaza la fila', () => {
    const item = { ...base, regla: { palabra: 'GUIA', mensaje: 'x', documentoUrl: '/g.pdf' } }
    expect(validateBatchItem(item, now)).toBe(REGLA_DOCUMENTO)
  })

  it('una regla sin documentoUrl sigue siendo válida', () => {
    expect(validateBatchItem({ ...base, regla: { palabra: 'GUIA', mensaje: 'x' } }, now)).toBeNull()
  })
})

// scheduleBatch: la integración de esta tarea, no las funciones puras de arriba. Fecha
// bien en el futuro porque `scheduleBatch` calcula `now` con `new Date()` real, no con el
// `now` fijo del resto del archivo.
describe('scheduleBatch — el documento antes de escribir la regla, y antes de subir nada', () => {
  const itemConMedia: BatchItem = {
    fecha: '2030-01-01 10:00',
    texto: 'Hola',
    cuentas: [],
    redes: ['threads'],
    media: ['https://ej.com/a.mp4'],
    regla: { palabra: 'GUIA', mensaje: 'Toma', documentoUrl: 'https://origen.ej.com/g.pdf' },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    inserts.length = 0
    guardarMock.mockClear()
    documentoToBlobMock.mockReset()
  })

  it('un documento que no se puede traer rechaza la fila con REGLA_DOCUMENTO y no escribe nada', async () => {
    documentoToBlobMock.mockResolvedValue(null)
    // Si el orden se rompiera y la media se subiera antes del documento, esto lanzaría:
    // la prueba de que no se llegó a tocar la red por la media, no solo que el resultado
    // final sea null.
    const fetchMock = vi.fn(async () => {
      throw new Error('no debía tocar la red para la media de esta fila')
    })
    vi.stubGlobal('fetch', fetchMock)

    const resultados = await scheduleBatch('owner-1', [itemConMedia])

    expect(resultados).toEqual([{ index: 0, ok: false, error: REGLA_DOCUMENTO }])
    expect(inserts).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('un documento que sí se trae guarda en reglasClave la URL de R2, no la del que llamó', async () => {
    documentoToBlobMock.mockResolvedValue('https://media.ej.cl/reglas/xyz.pdf')
    const item: BatchItem = { ...itemConMedia, media: [] }

    const resultados = await scheduleBatch('owner-1', [item])

    expect(resultados).toEqual([{ index: 0, ok: true, postId: 'post-1' }])
    const reglaInsert = inserts.find((i) => i.tabla === reglasClave)
    const valores = reglaInsert?.valores as { documentoUrl: string | null } | undefined
    expect(valores?.documentoUrl).toBe('https://media.ej.cl/reglas/xyz.pdf')
    expect(valores?.documentoUrl).not.toBe('https://origen.ej.com/g.pdf')
  })
})

// La comprobación post-descarga de la regla de media del trial reel (errorDeMediaPorOpciones
// con los tipos reales, ~463 de batch.ts): un Drive sin extensión pasa la comprobación
// declarada (sinTipo no rechaza) pero al descargar resulta imagen, y ahí sí se rechaza.
describe('scheduleBatch — trial reel, la comprobación de media después de descargar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    inserts.length = 0
    guardarMock.mockClear()
  })

  it('un Drive que resulta imagen tras descargar rechaza el trial reel y no inserta nada', async () => {
    vi.mocked(verificarCuentas).mockResolvedValueOnce([{ id: 'ig-1', network: 'instagram', handle: '@uno' }])
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
      ),
    )
    const item: BatchItem = {
      fecha: '2030-01-01 10:00',
      texto: 'Hola',
      cuentas: ['ig-1'],
      redes: [],
      media: ['https://drive.google.com/uc?id=x'],
      opciones: { instagram: { trialReel: true } },
    }

    const resultados = await scheduleBatch('owner-1', [item])

    expect(resultados).toEqual([{ index: 0, ok: false, error: TRIAL_REEL_MEDIA }])
    expect(inserts).toEqual([])
  })
})
