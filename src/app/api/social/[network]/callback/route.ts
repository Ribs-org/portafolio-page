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

async function instagramCredential(code: string, redirectUri: string): Promise<Credential> {
  const appId = env('INSTAGRAM_APP_ID')
  const appSecret = env('INSTAGRAM_APP_SECRET')
  if (!appId || !appSecret) throw new Error('Faltan las credenciales de Instagram')

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
  if (!short.ok) throw new Error(`Instagram rechazó el código: ${short.status}`)
  const shortData = (await short.json()) as { access_token?: string; user_id?: number }
  if (!shortData.access_token) throw new Error('Instagram no devolvió token')

  // The short-lived token lasts an hour; only the long-lived one is worth storing.
  const long = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token` +
      `&client_secret=${appSecret}&access_token=${shortData.access_token}`,
  )
  if (!long.ok) throw new Error(`Instagram no canjeó el token largo: ${long.status}`)
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
  if (!clientKey || !clientSecret) throw new Error('Faltan las credenciales de TikTok')

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
  if (!response.ok) throw new Error(`TikTok rechazó el código: ${response.status}`)

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    open_id?: string
  }
  if (!data.access_token) throw new Error('TikTok no devolvió token')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    externalId: data.open_id ?? null,
    handle: null,
  }
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
    const credential =
      network === 'instagram'
        ? await instagramCredential(code, redirectUri)
        : await tiktokCredential(code, redirectUri)

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
    return back(error instanceof Error ? error.message : 'No se pudo conectar.')
  }
}
