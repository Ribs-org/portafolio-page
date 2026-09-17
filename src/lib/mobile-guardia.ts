import 'server-only'
import type { Usuario } from '@/db'
import { leerTokenMovil } from './mobile-token'
import { buscarPorId } from './usuarios'

/**
 * El molde del resto del repo: sin cabecera válida, nadie pasa. Devuelve al usuario del
 * token y lo relee de la base: si subió su versión de sesión o fue quitado, el token muere.
 * Vive aparte de mobile-api.ts porque aquel lo importan tests y este trae `server-only`.
 */
export async function requireMobileUser(request: Request): Promise<Usuario | null> {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  const claims = await leerTokenMovil(header.slice('Bearer '.length))
  if (!claims) return null
  const usuario = await buscarPorId(claims.sub)
  if (!usuario || usuario.sesionVersion !== claims.sv) return null
  return usuario
}
