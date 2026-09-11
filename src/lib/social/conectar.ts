// Guardar una cuenta conectada, compartido por el callback (una candidata) y la
// selección (varias). Sin `server-only`: lo importa una server action.
import { getDb, socialAccounts } from '@/db'
import { encryptToken } from './crypto'

export type CuentaAConectar = {
  externalId: string
  handle: string | null
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

/** Upsert por (red, id externo): la misma cuenta renueva su token; un id nuevo es una fila nueva. */
export async function guardarCuenta(network: string, cuenta: CuentaAConectar): Promise<void> {
  const valores = {
    handle: cuenta.handle,
    accessToken: encryptToken(cuenta.accessToken),
    refreshToken: cuenta.refreshToken ? encryptToken(cuenta.refreshToken) : null,
    expiresAt: cuenta.expiresAt,
    lastSyncError: null,
  }
  await getDb()
    .insert(socialAccounts)
    .values({ network, externalId: cuenta.externalId, ...valores })
    .onConflictDoUpdate({ target: [socialAccounts.network, socialAccounts.externalId], set: valores })
}

const GRAPH = 'https://graph.facebook.com/v23.0'

/**
 * Página → token de página, pedido con el token de usuario. La cookie de conexión
 * pendiente no lleva estos tokens (no cabrían con diez páginas), así que la selección
 * los vuelve a pedir; Meta los entrega en cada llamada.
 */
export async function tokensDePaginas(userToken: string): Promise<Map<string, string>> {
  const response = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&access_token=${userToken}`)
  if (!response.ok) throw new Error(`me/accounts ${response.status}`)
  const body = (await response.json()) as { data?: Array<{ id?: string; access_token?: string }> }
  const tokens = new Map<string, string>()
  for (const page of body.data ?? []) {
    if (page.id && page.access_token) tokens.set(page.id, page.access_token)
  }
  return tokens
}
