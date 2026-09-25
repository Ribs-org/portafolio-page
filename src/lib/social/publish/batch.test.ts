import { describe, expect, it } from 'vitest'
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
  PORTADA_NEEDS_VIDEO,
  PORTADA_NOT_IMAGE,
  PORTADA_FORMAT,
  type BatchItem,
} from './batch'
import { ATRIBUTOS_ERROR } from './atributos'
import { TIKTOK_SIN_PRIVACIDAD, OPCIONES_ERROR } from './opciones'
import { TIKTOK_MEDIA } from './validate'
import { REGLA_PALABRA, REGLA_MENSAJE } from '../comentarios/reglas'
import type { CuentaDestino } from '../cuentas'

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
})
