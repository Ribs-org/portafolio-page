import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { getDb, socialAccounts } from '@/db'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'
import { encryptToken } from '@/lib/social/crypto'

export const dynamic = 'force-dynamic'

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
}

type Credential = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  externalId: string | null
  handle: string | null
}

/**
 * The only error type whose `.message` is allowed to reach the redirect: every throw
 * site below writes its own fixed, human-authored Spanish sentence, never a fragment
 * of an upstream response or a driver error. Anything else caught in the handler
 * (a non-JSON body breaking `.json()`, a DB write failure) is not an `OAuthError` and
 * falls back to a generic message instead.
 */
class OAuthError extends Error {}

async function instagramCredential(code: string, redirectUri: string): Promise<Credential> {
  const appId = env('INSTAGRAM_APP_ID')
  const appSecret = env('INSTAGRAM_APP_SECRET')
  if (!appId || !appSecret) throw new OAuthError('Faltan las credenciales de Instagram')

  const short = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!short.ok) throw new OAuthError(`Instagram rechazó el código: ${short.status}`)
  const shortData = (await short.json()) as { access_token?: string; user_id?: number }
  if (!shortData.access_token) throw new OAuthError('Instagram no devolvió token')

  // The short-lived token lasts an hour; only the long-lived one is worth storing.
  const longUrl = new URL('https://graph.instagram.com/access_token')
  longUrl.searchParams.set('grant_type', 'ig_exchange_token')
  longUrl.searchParams.set('client_secret', appSecret)
  longUrl.searchParams.set('access_token', shortData.access_token)
  const long = await fetch(longUrl)
  if (!long.ok) throw new OAuthError(`Instagram no canjeó el token largo: ${long.status}`)
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }

  const token = longData.access_token ?? shortData.access_token
  const profile = (await (
    await fetch(`https://graph.instagram.com/v23.0/me?fields=id,username&access_token=${token}`)
  ).json()) as { id?: string; username?: string }

  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
    externalId: profile.id ?? String(shortData.user_id ?? ''),
    handle: profile.username ? `@${profile.username}` : null,
  }
}

async function tiktokCredential(code: string, redirectUri: string): Promise<Credential> {
  const clientKey = env('TIKTOK_CLIENT_KEY')
  const clientSecret = env('TIKTOK_CLIENT_SECRET')
  if (!clientKey || !clientSecret) throw new OAuthError('Faltan las credenciales de TikTok')

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!response.ok) throw new OAuthError(`TikTok rechazó el código: ${response.status}`)

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    open_id?: string
  }
  if (!data.access_token) throw new OAuthError('TikTok no devolvió token')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    externalId: data.open_id ?? null,
    handle: null,
  }
}

/** Explicit rather than an implicit "not instagram, so tiktok" ternary — the network
 *  is only ever `instagram` or `tiktok` here because `connect/route.ts` refuses to mint
 *  a state for anything else, but that invariant should be legible at the call site too. */
async function fetchCredential(network: string, code: string, redirectUri: string): Promise<Credential> {
  if (network === 'instagram') return instagramCredential(code, redirectUri)
  if (network === 'tiktok') return tiktokCredential(code, redirectUri)
  throw new OAuthError('Esa red no usa OAuth.')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  if (!(await isAuthenticated())) return new NextResponse('No autorizado', { status: 401 })

  const { network } = await params
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const back = (message: string) =>
    NextResponse.redirect(`${url.origin}/admin/content?mensaje=${encodeURIComponent(message)}`)

  if (!code || !state) return back('La red no devolvió el código de autorización.')

  try {
    const { payload } = await jwtVerify(state, secret())
    if (payload.network !== network) return back('El estado no corresponde a esa red.')
  } catch {
    return back('El enlace de conexión expiró. Inténtalo de nuevo.')
  }

  const redirectUri = `${url.origin}/api/social/${network}/callback`

  try {
    const credential = await fetchCredential(network, code, redirectUri)

    await getDb()
      .insert(socialAccounts)
      .values({
        network,
        handle: credential.handle,
        externalId: credential.externalId,
        accessToken: encryptToken(credential.accessToken),
        refreshToken: credential.refreshToken ? encryptToken(credential.refreshToken) : null,
        expiresAt: credential.expiresAt,
        lastSyncError: null,
      })
      .onConflictDoUpdate({
        target: socialAccounts.network,
        set: {
          handle: credential.handle,
          externalId: credential.externalId,
          accessToken: encryptToken(credential.accessToken),
          refreshToken: credential.refreshToken ? encryptToken(credential.refreshToken) : null,
          expiresAt: credential.expiresAt,
          lastSyncError: null,
        },
      })

    return back(`${network} conectado.`)
  } catch (error) {
    // Only our own OAuthError carries a message we wrote ourselves. Everything else —
    // a non-JSON upstream body breaking `.json()`, a DB write failure — gets logged
    // server-side and a fixed fallback, never its raw message, in the redirect.
    if (error instanceof OAuthError) return back(error.message)
    console.error('Error conectando red social:', error)
    return back('No se pudo conectar. Inténtalo de nuevo.')
  }
}
