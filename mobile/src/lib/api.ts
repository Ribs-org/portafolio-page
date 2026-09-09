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

/** Un 400 con `{ error }`: la frase fija del servidor, lista para mostrarse tal cual. */
export class RechazoApi extends Error {}

export async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 401) throw new SesionCaducada()
  if (response.status === 400) {
    const cuerpo = (await response.json().catch(() => ({}))) as { error?: string }
    throw new RechazoApi(cuerpo.error ?? 'No se pudo guardar. Intenta de nuevo.')
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}
