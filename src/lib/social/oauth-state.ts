import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env'

/**
 * The `state` that survives the round trip to instagram.com and tiktok.com.
 *
 * It is signed with `AUTH_SECRET`, the same key behind the admin session cookie, and
 * unlike the cookie it travels in a query string — through the network's servers, into
 * browser history, into their logs. So it carries a claim of its own, and the session
 * check in `lib/auth.ts` demands `role: 'admin'`: neither token verifies as the other,
 * in either direction, even though one key signs both.
 *
 * Minting and checking live together on purpose. Split across the two routes, the claim
 * is one careless edit away from being written but never read, which is exactly the
 * hole this closes.
 */
const PURPOSE = 'social-oauth-state'

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

/** Short-lived by design: it only has to outlive the owner's trip through a consent screen. */
export function signOAuthState(network: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, network })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())
}

/** True only for a state this app minted, for this same network. */
export async function oauthStateMatches(state: string, network: string): Promise<boolean> {
  const { payload } = await jwtVerify(state, secret())
  return payload.purpose === PURPOSE && payload.network === network
}
