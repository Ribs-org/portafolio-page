import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_DOCUMENTO_BYTES } from '../comentarios/reglas'

const guardarMock = vi.fn(async (...args: [key: string, body: Blob, contentType: string]) => `https://media.ej.cl/${args[0]}`)

// No hay precedente en el repositorio para simular `@/lib/storage`; lo importante no es
// que `guardar` devuelva algo, sino comprobar con qué clave y qué content-type se llamó.
vi.mock('@/lib/storage', () => ({
  guardar: (key: string, body: Blob, contentType: string) => guardarMock(key, body, contentType),
}))

const { documentoToBlob } = await import('./documento')

afterEach(() => {
  vi.unstubAllGlobals()
  guardarMock.mockClear()
})

/** Los cinco bytes con los que empieza cualquier PDF real, sea cual sea su versión. */
const CABECERA_PDF = new TextEncoder().encode('%PDF-')

function stubPdf(
  declarado: number,
  opts: { bytesReales?: number; contentType?: string; conCabecera?: boolean } = {},
) {
  const cuerpo = new Uint8Array(opts.bytesReales ?? declarado)
  // Por defecto el cuerpo sí empieza con la cabecera de un PDF: la mayoría de estos
  // tests prueba otra cosa (tamaño, content-type, red) y no quiere fallar por el
  // chequeo de cabecera del arreglo #4. `conCabecera: false` es lo que usan los tests
  // que sí prueban ese chequeo.
  if (opts.conCabecera !== false) cuerpo.set(CABECERA_PDF.subarray(0, Math.min(CABECERA_PDF.length, cuerpo.length)))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(cuerpo, {
        status: 200,
        headers: {
          'content-type': opts.contentType ?? 'application/pdf',
          'content-length': String(declarado),
        },
      }),
    ),
  )
}

function stubError(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })))
}

/** Devuelve el mock para que el test pueda comprobar que nunca se llamó: un `fetch` que
 * lanza también produce `null` por el `catch` de `descargarSeguro`, el mismo resultado
 * que «rechazado antes de tocar la red» — sin comprobar la llamada en sí, el test no
 * distingue las dos causas. */
function nuncaLlamaFetch() {
  const mock = vi.fn(async () => {
    throw new Error('no debía tocar la red')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('documentoToBlob', () => {
  it('guarda un PDF y devuelve la URL de R2', async () => {
    stubPdf(1024)
    const url = await documentoToBlob('https://ej.com/g.pdf')
    expect(url).toBe(`https://media.ej.cl/${guardarMock.mock.calls[0]![0]}`)
    expect(guardarMock).toHaveBeenCalledTimes(1)
    const [key, , contentType] = guardarMock.mock.calls[0]!
    expect(key).toMatch(/^reglas\/[0-9a-f-]{36}\.pdf$/)
    expect(contentType).toBe('application/pdf')
  })

  it('rechaza lo que no es un PDF, aunque la URL diga .pdf', async () => {
    // El content-type manda: es lo que atrapa la página HTML intermedia de Drive, que es
    // el fallo real y silencioso de esta ruta.
    stubPdf(1024, { contentType: 'text/html; charset=utf-8' })
    expect(await documentoToBlob('https://drive.google.com/file/d/x')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('rechaza un PDF más grande que el tope, por content-length', async () => {
    stubPdf(MAX_DOCUMENTO_BYTES + 1, { bytesReales: 10 })
    expect(await documentoToBlob('https://ej.com/enorme.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('rechaza un PDF cuyo content-length mintió y el cuerpo era más grande', async () => {
    // Un servidor puede declarar 1 MB y mandar 40: la comprobación después de descargar
    // es la que de verdad protege el almacenamiento.
    stubPdf(1024, { bytesReales: MAX_DOCUMENTO_BYTES + 1024 })
    expect(await documentoToBlob('https://ej.com/miente.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('rechaza un cuerpo de sobra aunque el content-length esté ausente, sea -1, o no sea número', async () => {
    // Los tres dejan pasar el pre-chequeo (`Number(null)` = 0, `-1` no supera el tope,
    // `Number('abc')` = NaN y `NaN > tope` es falso): la comprobación que de verdad
    // protege es el streaming con tope de `leerConTope`, no el header.
    for (const contentLength of [undefined, '-1', 'abc']) {
      const headers: Record<string, string> = { 'content-type': 'application/pdf' }
      if (contentLength !== undefined) headers['content-length'] = contentLength
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(new Uint8Array(MAX_DOCUMENTO_BYTES + 1024), { status: 200, headers })),
      )
      expect(await documentoToBlob('https://ej.com/miente-header.pdf')).toBeNull()
      expect(guardarMock).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })

  it('devuelve null si la descarga falla, sin lanzar', async () => {
    stubError(500)
    expect(await documentoToBlob('https://ej.com/muerto.pdf')).toBeNull()
  })

  it('devuelve null si la red rechaza la conexión, sin lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    expect(await documentoToBlob('https://ej.com/inalcanzable.pdf')).toBeNull()
  })

  // Segunda resolución del controlador: el servidor no puede pedir cualquier URL en
  // nombre de quien programó el post. Sin esto, `documentoToBlob` es un SSRF hecho
  // función. La cobertura a fondo de qué host se rechaza y por qué vive en
  // `descarga-segura.test.ts`; acá solo se confirma que `documentoToBlob` de verdad usa
  // esa comprobación — por eso cada caso comprueba que `fetch` nunca se llamó, no solo
  // que el resultado fue `null` (que también pasaría si la red hubiera fallado sola).
  it('rechaza un host de loopback antes de tocar la red', async () => {
    const fetchMock = nuncaLlamaFetch()
    expect(await documentoToBlob('https://127.0.0.1/g.pdf')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza localhost por nombre antes de tocar la red', async () => {
    const fetchMock = nuncaLlamaFetch()
    expect(await documentoToBlob('http://localhost:4000/g.pdf')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza un rango privado antes de tocar la red', async () => {
    const fetchMock = nuncaLlamaFetch()
    expect(await documentoToBlob('https://10.0.0.5/g.pdf')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza la dirección de metadata de la nube antes de tocar la red', async () => {
    const fetchMock = nuncaLlamaFetch()
    expect(await documentoToBlob('http://169.254.169.254/latest/meta-data')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no sigue una redirección hacia la red interna: el segundo salto nunca se pide', async () => {
    // Una URL pública que redirige a la dirección de metadata saltaría cualquier
    // comprobación previa si se siguiera la redirección a ciegas.
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await documentoToBlob('https://ej.com/redirige.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
    // Si esto fuera 2, se habría llegado a pedir la dirección de metadata.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('devuelve null si el cuerpo se corta a mitad de la descarga, sin lanzar', async () => {
    // Un stream que entrega un chunk y luego falla: mismo efecto que un `TimeoutError`
    // a mitad del cuerpo o una conexión que se cae, sin servidor real ni temporizadores.
    let llamadasAPull = 0
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(controller) {
        llamadasAPull++
        if (llamadasAPull === 1) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
        } else {
          controller.error(new Error('la conexión se cortó'))
        }
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/pdf' } })),
    )
    expect(await documentoToBlob('https://ej.com/se-corta.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('devuelve null si guardar (R2) falla, sin lanzar', async () => {
    stubPdf(1024)
    guardarMock.mockRejectedValueOnce(new Error('credencial vencida'))
    expect(await documentoToBlob('https://ej.com/g.pdf')).toBeNull()
    expect(guardarMock).toHaveBeenCalledTimes(1)
  })

  it('rechaza un 2xx sin cuerpo aunque el content-type diga PDF (arreglo #3)', async () => {
    // Un 204, o cualquier 2xx que no escriba nada: antes de este arreglo `!cuerpo`
    // devolvía un `Blob([])` que pasaba de largo, y el comentarista recibía el enlace a
    // un PDF de 0 bytes.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204, headers: { 'content-type': 'application/pdf' } })),
    )
    expect(await documentoToBlob('https://ej.com/vacio.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('rechaza un cuerpo que termina en cero bytes sin ser un `!body` (arreglo #3)', async () => {
    const cuerpo = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/pdf' } })),
    )
    expect(await documentoToBlob('https://ej.com/vacio-streaming.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('no lanza si el cuerpo ya está "errored" cuando se cancela por pasarse del tope (arreglo #2)', async () => {
    // El caso real: la señal compartida de tiempo puede vencer justo entre el `read()`
    // que trae el chunk que pasa del tope y el `lector.cancel()` que sigue. WHATWG
    // Streams: cancelar un stream ya "errored" devuelve la promesa RECHAZADA con ese
    // mismo error. Antes de este arreglo ese rechazo salía por encima de
    // `documentoToBlob`, que promete no lanzar nunca.
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(MAX_DOCUMENTO_BYTES + 1024))
        controller.error(new Error('la señal de tiempo venció justo ahí'))
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/pdf' } })),
    )
    await expect(documentoToBlob('https://ej.com/se-pasa-y-se-rompe.pdf')).resolves.toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })

  it('rechaza un cuerpo que no empieza con "%PDF-" aunque el content-type diga PDF (arreglo #4)', async () => {
    // El hueco que deja mirar solo el header: HTML servido con `content-type:
    // application/pdf` (la página intermedia de Drive, marcada a mano o no) entraría
    // igual y se re-serviría como PDF desde nuestro propio dominio.
    stubPdf(1024, { conCabecera: false })
    expect(await documentoToBlob('https://ej.com/no-es-pdf.pdf')).toBeNull()
    expect(guardarMock).not.toHaveBeenCalled()
  })
})
