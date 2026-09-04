import { useCallback, useEffect, useState } from 'react'
import { SesionCaducada, apiGet } from './api'
import { freshness, readCache, writeCache } from './cache'

/**
 * El patrón de las cuatro pantallas: muestra lo último que se supo apenas abre y
 * refresca por detrás. Es lo que hace que «el vistazo» sea instantáneo y que la app
 * sirva en el metro; una pantalla en blanco esperando la red sería lo contrario.
 */
export function useScreenData<T>(
  key: string,
  path: string,
  token: string | null,
  onSesionCaducada: () => void,
) {
  const [data, setData] = useState<T | null>(null)
  // El sello se calcula al guardar, no al dibujar: `Date.now()` durante el render es
  // impuro y el compilador de React puede rehacerlo cuando se le antoje, dando una
  // antigüedad que salta sola. Acá se fija una vez por lectura, que es cuando cambia.
  const [sello, setSello] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    // Sin token no hay con qué pedir: `useToken()` devuelve `null` en el primer
    // render, y pedir con esa credencial vacía es un 401 garantizado que esta
    // misma función traduce en «sesión caducada», expulsando al usuario a login
    // apenas abre la app. El efecto de abajo tampoco llama a esto sin token,
    // pero el guard queda acá también por si algo (pull-to-refresh, reintentar)
    // invoca `refrescar` directamente mientras el llavero todavía no resuelve.
    if (!token) return
    setCargando(true)
    try {
      const fresco = await apiGet<T>(path, token)
      const cuando = Date.now()
      setData(fresco)
      setSello(freshness(cuando, cuando).etiqueta)
      setError(null)
      await writeCache(key, fresco)
    } catch (e) {
      if (e instanceof SesionCaducada) {
        onSesionCaducada()
        return
      }
      // Con datos viejos en pantalla el error es una nota al pie; sin ellos, la
      // pantalla entera.
      setError('No se pudo actualizar.')
    } finally {
      setCargando(false)
    }
  }, [key, path, token, onSesionCaducada])

  // El vistazo instantáneo no depende del token: la caché ya está en disco
  // apenas se monta la pantalla, así que se pinta aunque el llavero tarde en
  // resolver (o nunca lo haga). Separado del refresco de red para no acoplar
  // «mostrar lo que ya sabemos» a «tener credencial para pedir más».
  useEffect(() => {
    let vivo = true
    readCache<T>(key).then((guardado) => {
      // Sin este guard, una pantalla desmontada (cambio de pestaña, navegación)
      // igual terminaría llamando `setData`/`setCargando` sobre un componente
      // que ya no existe cuando la lectura de caché resuelve tarde.
      if (!vivo) return
      if (guardado) {
        setData(guardado.data)
        setSello(freshness(guardado.savedAt, Date.now()).etiqueta)
        setCargando(false)
      }
    })
    return () => {
      vivo = false
    }
  }, [key])

  // El refresco de red espera a que el token exista. Antes este efecto vivía
  // pegado al de la caché y llamaba a `refrescar()` sin condición: con el
  // token en `null` del primer render, eso disparaba un pedido con credencial
  // vacía, el backend respondía 401 y la app se autoexpulsaba a login en
  // bucle. Ahora no hay pedido hasta que `useToken()` entregue un token real.
  useEffect(() => {
    if (!token) return
    // La regla ve `setCargando(true)` antes del primer `await` dentro de
    // `refrescar` y no puede saber que es el arranque legítimo del pedido de
    // red, no un `setState` gratuito disparado a ciegas desde el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescar()
  }, [token, refrescar])

  return { data, cargando, error, sello, refrescar }
}
