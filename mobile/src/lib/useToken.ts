import { useEffect, useState } from 'react'
import { readToken } from './session'

/** El token del llavero, leído una vez por pantalla montada. */
export function useToken(): string | null {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    // El `setState` ocurre dentro del `.then`, no de forma síncrona en el cuerpo
    // del efecto, así que la regla `react-hooks/set-state-in-effect` no aplica:
    // es un arranque asíncrono legítimo (leer el llavero no tiene versión síncrona).
    void readToken().then(setToken)
  }, [])
  return token
}
