import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subirArchivos } from './subida-directa'

/**
 * Lo que este archivo cuida es el contrato entre la ruta que firma y el PUT: R2 rechaza la
 * firma si el `Content-Type` del PUT no es exactamente el que se firmó. Con un .mov que
 * llega sin `type` desde el navegador, usar `file.type` manda vacío y la subida falla —
 * pasó al escribir esto.
 */
type Llamada = { url: string; init: RequestInit }
let llamadas: Llamada[] = []

function responder(firma: unknown, okPut = true) {
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    llamadas.push({ url, init })
    if (url.startsWith('/api/admin/upload-url')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(firma) } as Response)
    }
    return Promise.resolve({ ok: okPut, status: okPut ? 200 : 403 } as Response)
  })
}

const archivo = (nombre: string, tipo: string) =>
  new File([new Uint8Array([1, 2, 3])], nombre, { type: tipo })

beforeEach(() => {
  llamadas = []
  vi.unstubAllGlobals()
})

describe('subirArchivos', () => {
  it('manda al PUT el content-type que devolvió la ruta, no el del File', async () => {
    responder({ subir: 'https://r2/firmada', publica: 'https://cdn/x.mov', mediaType: 'video', tipo: 'video/quicktime' })

    // El caso real: el navegador no supo qué tipo es, y la ruta lo resolvió por extensión.
    const subidos = await subirArchivos([archivo('x.mov', '')])

    const put = llamadas.find((l) => l.url === 'https://r2/firmada')!
    expect((put.init.headers as Record<string, string>)['Content-Type']).toBe('video/quicktime')
    expect(subidos).toEqual([{ url: 'https://cdn/x.mov', mediaType: 'video', nombre: 'x.mov' }])
  })

  it('le pasa a la ruta el nombre, el tipo y el tamaño', async () => {
    responder({ subir: 'https://r2/f', publica: 'https://cdn/a.jpg', mediaType: 'image', tipo: 'image/jpeg' })

    await subirArchivos([archivo('a.jpg', 'image/jpeg')])

    const firma = llamadas.find((l) => l.url.includes('upload-url'))!
    expect(JSON.parse(String(firma.init.body))).toEqual({ nombre: 'a.jpg', tipo: 'image/jpeg', bytes: 3 })
  })

  it('usa la frase de la ruta cuando la firma falla, que explica el motivo', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'El archivo supera los 500 MB.' }) } as Response),
    )
    await expect(subirArchivos([archivo('grande.mp4', 'video/mp4')])).rejects.toThrow('El archivo supera los 500 MB.')
  })

  it('avisa si el PUT a R2 falla, con su código', async () => {
    responder({ subir: 'https://r2/f', publica: 'https://cdn/a.jpg', mediaType: 'image', tipo: 'image/jpeg' }, false)
    await expect(subirArchivos([archivo('a.jpg', 'image/jpeg')])).rejects.toThrow('403')
  })

  it('sube en orden: el carrusel depende de eso', async () => {
    let n = 0
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('upload-url')) {
        n += 1
        const i = n
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ subir: `https://r2/${i}`, publica: `https://cdn/${i}.jpg`, mediaType: 'image', tipo: 'image/jpeg' }) } as Response)
      }
      return Promise.resolve({ ok: true, status: 200 } as Response)
    })

    const subidos = await subirArchivos([archivo('1.jpg', 'image/jpeg'), archivo('2.jpg', 'image/jpeg'), archivo('3.jpg', 'image/jpeg')])
    expect(subidos.map((s) => s.url)).toEqual(['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'])
  })

  it('informa el avance para que una subida larga no parezca colgada', async () => {
    responder({ subir: 'https://r2/f', publica: 'https://cdn/a.jpg', mediaType: 'image', tipo: 'image/jpeg' })
    const avances: Array<[number, number]> = []
    await subirArchivos([archivo('a.jpg', 'image/jpeg'), archivo('b.jpg', 'image/jpeg')], (h, t) => avances.push([h, t]))
    expect(avances).toEqual([[1, 2], [2, 2]])
  })
})
