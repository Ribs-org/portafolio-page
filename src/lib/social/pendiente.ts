// Lo puro de una conexión a medias: el login ya pasó, el dueño todavía no eligió qué
// cuentas conectar. Viaja en una cookie cifrada de diez minutos y muere sola.
import { decryptToken, encryptToken } from './crypto'

export type Candidata = { externalId: string; handle: string | null }

export type ConexionPendiente = {
  network: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  candidatas: Candidata[]
}

export const COOKIE_PENDIENTE = 'conexion-pendiente'
/** Lo que dura un login a medias: el tiempo de leer una lista y marcar casillas. */
export const PENDIENTE_MAX_AGE = 600
export const LOGIN_VENCIDO = 'El login venció. Vuelve a conectar.'

export function serializarPendiente(pendiente: ConexionPendiente): string {
  return encryptToken(JSON.stringify(pendiente))
}

function esCandidata(value: unknown): value is Candidata {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return typeof c.externalId === 'string' && c.externalId !== '' && (c.handle === null || typeof c.handle === 'string')
}

/** Null ante cualquier duda: cookie ausente, vencida, manipulada o con otra forma. */
export function leerPendiente(raw: string | undefined): ConexionPendiente | null {
  if (!raw) return null
  try {
    const p = JSON.parse(decryptToken(raw)) as Record<string, unknown>
    if (typeof p.network !== 'string' || typeof p.accessToken !== 'string') return null
    if (p.refreshToken !== null && typeof p.refreshToken !== 'string') return null
    if (p.expiresAt !== null && typeof p.expiresAt !== 'string') return null
    if (!Array.isArray(p.candidatas) || !p.candidatas.every(esCandidata)) return null
    return {
      network: p.network,
      accessToken: p.accessToken,
      refreshToken: p.refreshToken,
      expiresAt: p.expiresAt,
      candidatas: p.candidatas,
    }
  } catch {
    return null
  }
}

/** Las candidatas marcadas, en el orden de la lista y sin repetir: nada que Meta no listó. */
export function elegidas(candidatas: Candidata[], ids: string[]): Candidata[] {
  const marcadas = new Set(ids)
  return candidatas.filter((c) => marcadas.has(c.externalId))
}
