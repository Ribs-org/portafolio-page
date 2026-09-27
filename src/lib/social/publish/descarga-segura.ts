// Protección SSRF compartida por todo lo que este servidor descarga en nombre de un
// dueño con una URL que él eligió: el documento de una regla (`documento.ts`) y la
// media de un lote (`batch.ts`). Antes de esto, cada uno hacía su propio `fetch(url)`
// sin comprobar el host — el servidor podía terminar pidiéndole algo a su propia red
// interna, o a la dirección de metadata de la nube, en nombre de quien programó el post.

// Un salto de sobra por si el origen pasa por un dominio canónico (p. ej. `www` -> sin
// `www`), o por Drive o Dropbox, que redirigen siempre antes de servir el archivo. Es
// una elección nuestra, no un límite del protocolo HTTP: más saltos que esto ya huele a
// una redirección en bucle o a abuso.
const MAX_REDIRECCIONES = 5

/**
 * El IPv4 dentro de una forma IPv6 mapeada (`::ffff:a.b.c.d`), o null si el host no
 * tiene esa forma. `new URL(...).hostname` normaliza `::ffff:127.0.0.1` a su forma
 * hexadecimal comprimida (`::ffff:7f00:1`) en vez de a la forma con puntos, así que hay
 * que deshacer eso antes de que `esHostInterno` pueda reconocerlo.
 */
function ipv4DesdeIPv6Mapeada(host: string): string | null {
  const grupos = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
  if (!grupos) return null
  const alto = parseInt(grupos[1]!, 16)
  const bajo = parseInt(grupos[2]!, 16)
  return [(alto >>> 8) & 0xff, alto & 0xff, (bajo >>> 8) & 0xff, bajo & 0xff].join('.')
}

/**
 * El host normalizado a la forma que hay que comparar en `esHostInterno`.
 *
 * `new URL(...).hostname` ya hace parte del trabajo por su cuenta —es el estándar
 * WHATWG, no código de este archivo—: un IPv4 en decimal, octal o hexadecimal
 * (`2130706433`, `017700000001`, `0x7f000001`) sale con puntos, y una forma IPv6
 * expandida (`0:0:0:0:0:0:0:1`) sale comprimida (`::1`). Lo que sí hay que deshacer
 * aquí: el IPv4 mapeado en IPv6 (ver `ipv4DesdeIPv6Mapeada`) y el punto final de un
 * FQDN absoluto (`localhost.`), que nombra el mismo host que sin el punto.
 *
 * Lo que esto no hace, a propósito: no resuelve DNS. Un nombre público que en verdad
 * apunte a una IP interna sigue pasando esta comprobación. Resolverlo abriría una
 * carrera entre esta comprobación y la petición real —el nombre podría resolver a otra
 * cosa entre medio— que no vale la pena para este caso.
 */
function normalizarHost(hostnameCrudo: string): string {
  const sinCorchetes = hostnameCrudo.toLowerCase().replace(/^\[|\]$/g, '')
  const sinPuntoFinal = sinCorchetes.replace(/\.$/, '')
  return ipv4DesdeIPv6Mapeada(sinPuntoFinal) ?? sinPuntoFinal
}

/**
 * Si el host normalizado (ver `normalizarHost`) es de red interna. Lista exacta de lo
 * que cubre, no un resumen — la primera ronda de esta función decía «loopback» y se le
 * escapaban `0.0.0.0` y `[::]`, así que aquí va la lista completa en vez de una frase
 * que invite a asumir que ya está todo:
 *
 * - `localhost` y cualquier subdominio de `localhost`.
 * - Loopback: `127.0.0.0/8`, `::1`, y `0.0.0.0/8` — en Linux (donde corre esta función),
 *   conectar a una dirección `0.x.x.x` es, en la práctica, conectar a loopback.
 * - Sin especificar: `::` (`[::]`) — el equivalente IPv6 de `0.0.0.0`.
 * - Link-local: `169.254.0.0/16` (incluye la dirección de metadata de la nube,
 *   `169.254.169.254`) y `fe80::/10`.
 * - Privado: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, y `fc00::/7` (ULA, el
 *   equivalente IPv6 de un rango privado).
 */
function esHostInterno(hostnameCrudo: string): boolean {
  const host = normalizarHost(hostnameCrudo)
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::' || host === '::1') return true
  if (/^fe[89ab][0-9a-f]?:/.test(host)) return true // fe80::/10
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true // fc00::/7 (ULA)
  const octetos = host.split('.')
  if (octetos.length === 4 && octetos.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)) {
    const [a, b] = octetos.map(Number)
    if (a === 0) return true // 0.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8
    if (a === 169 && b === 254) return true // 169.254.0.0/16
    if (a === 10) return true // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
  }
  return false
}

/**
 * Falso si la URL no se puede parsear, si su esquema no es `http`/`https`, o si su host
 * es de red interna. El esquema se comprueba acá y no solo al declarar la regla
 * (`validarRegla`, que solo ve la URL original): un `Location:` de redirección puede
 * traer `data:application/pdf;base64,…`, que no tiene host —`hostname` queda vacío,
 * `esHostInterno` no lo reconoce como interno— y que `fetch` sí sabe descargar.
 */
export function hostPermitido(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !esHostInterno(parsed.hostname)
}

/**
 * `fetch` con protección SSRF. Antes de cada intento —incluido cada salto de
 * redirección— rechaza la URL si su esquema no es http(s) o su host es de red interna,
 * y nunca sigue una redirección a ciegas: usa `redirect: 'manual'` y revisa el destino
 * antes de seguirlo, porque una URL pública puede redirigir a la red interna y así
 * saltarse cualquier comprobación hecha solo sobre la URL original.
 *
 * Un solo presupuesto de tiempo para toda la cadena, no uno por salto: la señal se crea
 * una vez, antes del bucle, y se reutiliza en cada `fetch`. Con una señal por salto, una
 * redirección multiplicaría el tiempo (hasta `MAX_REDIRECCIONES` veces) contra el
 * `maxDuration` del endpoint que llama a esto.
 *
 * `etiqueta` nombra lo que se descarga en los mensajes de log ("el documento", "la
 * media del lote"), para que cada archivo que llama vea su propia frase. Nunca lanza:
 * devuelve `null` ante cualquier fallo (esquema o host prohibido, red caída, demasiadas
 * redirecciones, respuesta no-ok), con el motivo ya registrado.
 */
export async function descargarSeguro(url: string, etiqueta: string): Promise<Response | null> {
  let actual = url
  // Host que se cuelga, o cadena de redirecciones larga: cuestan estos treinta segundos
  // en total, no treinta por salto — son los mismos treinta segundos que antes de que
  // esta función existiera tenía un solo `fetch` con redirección automática.
  const signal = AbortSignal.timeout(30_000)
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    if (!hostPermitido(actual)) {
      console.error(`${etiqueta}: la URL no se puede descargar (esquema o host prohibido):`, actual.slice(0, 200))
      return null
    }
    let response: Response
    try {
      response = await fetch(actual, { signal, redirect: 'manual' })
    } catch (error) {
      console.error(`${etiqueta}: no se pudo descargar:`, String(error).slice(0, 200), actual.slice(0, 200))
      return null
    }
    if (response.status >= 300 && response.status < 400) {
      const destino = response.headers.get('location')
      // El cuerpo de un 3xx no se necesita más allá del header: sin cancelarlo, el
      // socket queda abierto en cada salto de la cadena.
      await response.body?.cancel()
      if (!destino) {
        console.error(`${etiqueta}: redirección sin destino:`, actual.slice(0, 200))
        return null
      }
      actual = new URL(destino, actual).toString()
      continue
    }
    if (!response.ok) {
      console.error(`${etiqueta}: no se pudo descargar:`, response.status, actual.slice(0, 200))
      return null
    }
    return response
  }
  console.error(`${etiqueta}: demasiadas redirecciones:`, url.slice(0, 200))
  return null
}
