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
  token: string,
  onSesionCaducada: () => void,
) {
  const [data, setData] = useState<T | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async () => {
    setCargando(true)
    try {
      const fresco = await apiGet<T>(path, token)
      setData(fresco)
      setSavedAt(Date.now())
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

  useEffect(() => {
    let vivo = true
    readCache<T>(key).then((guardado) => {
      if (vivo && guardado) {
        setData(guardado.data)
        setSavedAt(guardado.savedAt)
        setCargando(false)
      }
      void refrescar()
    })
    return () => {
      vivo = false
    }
  }, [key, refrescar])

  return { data, cargando, error, sello: freshness(savedAt, Date.now()).etiqueta, refrescar }
}
