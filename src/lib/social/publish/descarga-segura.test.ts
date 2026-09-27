import { afterEach, describe, expect, it, vi } from 'vitest'
import { descargarSeguro, hostPermitido } from './descarga-segura'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Un `fetch` que nunca debería llamarse: si se llama, el mock lanza y el `catch` de
 * `descargarSeguro` lo convierte en `null` — exactamente el mismo resultado que
 * «rechazado antes de tocar la red». Por eso el test tiene que comprobar la llamada en
 * sí (`.not.toHaveBeenCalled()`), no solo el valor devuelto: un `toBeNull()` a solas no
 * distingue las dos causas. */
function fetchQueNuncaDeberiaLlamarse() {
  const mock = vi.fn(async () => {
    throw new Error('no debía tocar la red')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('hostPermitido', () => {
  it('permite un host público normal', () => {
    expect(hostPermitido('https://ej.com/g.pdf')).toBe(true)
  })

  it('rechaza localhost, por nombre, con y sin el punto final del FQDN absoluto', () => {
    expect(hostPermitido('http://localhost:4000/')).toBe(false)
    expect(hostPermitido('http://localhost./')).toBe(false)
  })

  it('rechaza loopback IPv4 e IPv6, incluidas sus formas "sin especificar"', () => {
    expect(hostPermitido('http://127.0.0.1/')).toBe(false)
    expect(hostPermitido('http://[::1]/')).toBe(false)
    // 0.0.0.0/8 y `::` (sin especificar): en Linux, conectar ahí es conectar a loopback.
    expect(hostPermitido('http://0.0.0.0/')).toBe(false)
    expect(hostPermitido('http://0/')).toBe(false)
    expect(hostPermitido('http://[::]/')).toBe(false)
  })

  it('rechaza los tres rangos privados IPv4 y su equivalente IPv6 (fc00::/7, ULA)', () => {
    expect(hostPermitido('http://10.1.2.3/')).toBe(false)
    expect(hostPermitido('http://172.16.0.1/')).toBe(false)
    expect(hostPermitido('http://172.31.255.255/')).toBe(false)
    expect(hostPermitido('http://192.168.0.1/')).toBe(false)
    expect(hostPermitido('http://[fc00::1]/')).toBe(false)
    expect(hostPermitido('http://[fdff::1]/')).toBe(false)
    // Fuera de los rangos: no debe rechazarse por confundirlo con el privado.
    expect(hostPermitido('http://172.32.0.1/')).toBe(true)
    expect(hostPermitido('http://[fe00::1]/')).toBe(true)
  })

  it('rechaza link-local, incluida la dirección de metadata de la nube', () => {
    expect(hostPermitido('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(hostPermitido('http://[fe80::1]/')).toBe(false)
  })

  it('rechaza un IPv4 escrito en decimal, octal o hexadecimal', () => {
    // `new URL(...).hostname` ya los normaliza a la forma con puntos (estándar WHATWG);
    // este test protege ese supuesto, no una conversión propia de este archivo.
    expect(hostPermitido('http://2130706433/')).toBe(false) // 127.0.0.1 en decimal
    expect(hostPermitido('http://017700000001/')).toBe(false) // 127.0.0.1 en octal
    expect(hostPermitido('http://0x7f000001/')).toBe(false) // 127.0.0.1 en hex
    expect(hostPermitido('http://127.1/')).toBe(false) // 127.0.0.1, forma abreviada
    expect(hostPermitido('http://2852039166/')).toBe(false) // 169.254.169.254 en decimal
  })

  it('rechaza un IPv4 mapeado en IPv6', () => {
    // El bypass real: `::ffff:127.0.0.1` es loopback por otro camino, y a diferencia
    // del caso anterior, la URL lo normaliza a hex comprimido (`::ffff:7f00:1`), no a
    // la forma con puntos — hay que deshacer eso para reconocerlo.
    expect(hostPermitido('http://[::ffff:127.0.0.1]/')).toBe(false)
    expect(hostPermitido('http://[::ffff:10.0.0.5]/')).toBe(false)
    expect(hostPermitido('http://[::ffff:169.254.169.254]/')).toBe(false)
  })

  it('rechaza cualquier esquema que no sea http/https', () => {
    // El caso real: un `Location:` de redirección con `data:` no tiene host —esta
    // comprobación de host nunca lo vería—, y `fetch` sí sabe descargarlo.
    expect(hostPermitido('data:application/pdf;base64,AAAA')).toBe(false)
    expect(hostPermitido('file:///etc/passwd')).toBe(false)
    expect(hostPermitido('ftp://ej.com/g.pdf')).toBe(false)
  })

  it('no resuelve DNS: un nombre público es una decisión, no un descuido', () => {
    // Documentado en el comentario de `normalizarHost`: si ese nombre resolviera en la
    // práctica a una IP interna, esta comprobación no lo vería. Resolverlo abriría una
    // carrera entre esta comprobación y la petición real.
    expect(hostPermitido('http://un-nombre-cualquiera.example/')).toBe(true)
  })

  it('rechaza lo que no es una URL', () => {
    expect(hostPermitido('no-es-una-url')).toBe(false)
  })
})

describe('descargarSeguro', () => {
  it('sigue una redirección legítima, devuelve la respuesta final y no llama de más', async () => {
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(null, { status: 302, headers: { location: 'https://ej.com/final.pdf' } })
      }
      return new Response('ok', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = await descargarSeguro('https://ej.com/inicial.pdf', 'la prueba')
    expect(response).not.toBeNull()
    expect(await response!.text()).toBe('ok')
    // Exactamente dos: la URL inicial y el destino de su redirección, ni una de más.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('no sigue una redirección hacia la red interna: el segundo salto nunca se pide', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await descargarSeguro('https://ej.com/redirige.pdf', 'la prueba')).toBeNull()
    // La comprobación de host corre antes de cada salto: si esto fuera 2, se habría
    // llegado a pedir la dirección de metadata, que es justo lo que hay que impedir.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('no sigue una redirección hacia un esquema sin host (data:)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'data:application/pdf;base64,AAAA' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await descargarSeguro('https://ej.com/redirige.pdf', 'la prueba')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cancela el cuerpo de la redirección: no deja el socket colgando', async () => {
    const stream = new ReadableStream()
    const cancelSpy = vi.spyOn(stream, 'cancel')
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return new Response(stream, { status: 302, headers: { location: 'https://ej.com/final.pdf' } })
      }
      return new Response('ok', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await descargarSeguro('https://ej.com/redirige.pdf', 'la prueba')
    // Una sola vez: la del único 3xx de esta cadena, no una por cada salto restante.
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('rechaza un host interno antes de tocar la red', async () => {
    const fetchMock = fetchQueNuncaDeberiaLlamarse()
    expect(await descargarSeguro('http://127.0.0.1/', 'la prueba')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('devuelve null si la respuesta no es ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })))
    expect(await descargarSeguro('https://ej.com/muerto.pdf', 'la prueba')).toBeNull()
  })

  it('devuelve null si la red falla, sin lanzar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dns') }))
    expect(await descargarSeguro('https://ej.com/inalcanzable.pdf', 'la prueba')).toBeNull()
  })

  it('devuelve null si el destino de la redirección no se puede parsear, sin lanzar', async () => {
    // El origen es de un tercero: manda lo que quiera en `Location:`. `http://[` es
    // sintácticamente un IPv6 sin cerrar — `new URL()` lanza `TypeError` al intentar
    // parsearlo, y antes de este arreglo esa excepción salía por encima de esta función.
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://[' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await descargarSeguro('https://ej.com/redirige.pdf', 'la prueba')).toBeNull()
    // No hay segundo salto: el destino ni siquiera llegó a convertirse en una URL.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
