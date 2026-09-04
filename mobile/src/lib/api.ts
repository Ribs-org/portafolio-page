import { API_BASE } from './config'

export class SesionCaducada extends Error {}

/**
 * Un 401 no es un error de pantalla: es la sesión que dejó de valer (token revocado
 * o contraseña cambiada). Sube distinto para que la app vuelva a pedir la contraseña
 * en vez de mostrar un mensaje rojo sin salida.
 */
export async function apiGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) throw new SesionCaducada()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}
