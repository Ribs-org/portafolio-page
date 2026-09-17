import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env'

/**
 * The `state` that survives the round trip to instagram.com and tiktok.com.
 *
 * It is signed with the raw `AUTH_SECRET`, while the admin session cookie is signed with
 * a key HKDF derives from that same secret for the session alone — and unlike the cookie
 * this travels in a query string, through the network's servers, into browser history,
 * into their logs. So it carries a claim of its own too: neither token verifies as the
 * other, in either direction, since the keys themselves differ before the claims are
 * even compared.
 *
 * Minting and checking live together on purpose. Split across the two routes, the claim
 * is one careless edit away from being written but never read, which is exactly the
 * hole this closes.
 *
 * It ties the round trip to this user and this network.
 */
const PURPOSE = 'social-oauth-state'

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

/** Short-lived by design: it only has to outlive the owner's trip through a consent screen. */
export function signOAuthState(network: string, ownerId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, network })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .setSubject(ownerId)
    .sign(secret())
}

/** True only for a state this app minted, for this same network and this same owner. */
export async function oauthStateMatches(state: string, network: string, ownerId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, secret())
    return payload.purpose === PURPOSE && payload.network === network && payload.sub === ownerId
  } catch {
    return false
  }
}
