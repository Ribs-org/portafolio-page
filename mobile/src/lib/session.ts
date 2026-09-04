import * as SecureStore from 'expo-secure-store'

import { API_BASE } from './config'

// El almacén seguro está respaldado por el llavero del sistema; la caché de datos
// vive en AsyncStorage, que es texto plano. El token nunca cruza esa frontera.
const KEY = 'mobile-token'

export function readToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY)
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(KEY, token)
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY)
}

/** Frases fijas: el usuario ve qué pasó, no el detalle del transporte. */
export async function login(password: string): Promise<{ token: string } | { error: string }> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/mobile/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    return { error: 'No se pudo conectar. Revisa tu señal.' }
  }
  if (response.status === 429) return { error: 'Demasiados intentos. Espera unos minutos.' }
  if (!response.ok) return { error: 'Contraseña incorrecta.' }
  const body = (await response.json()) as { token?: string }
  if (!body.token) return { error: 'Contraseña incorrecta.' }
  await saveToken(body.token)
  return { token: body.token }
}
