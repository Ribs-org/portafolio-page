import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'
import { guardarCuenta } from '@/lib/social/conectar'
import { NO_FACEBOOK_PAGE, listFacebookPages, type FacebookPagesList } from '@/lib/social/facebook'
import {
  NO_INSTAGRAM_ACCOUNT,
  instagramTokenExpiry,
  listInstagramAccounts,
  type FacebookPages,
} from '@/lib/social/instagram'
import { oauthStateMatches } from '@/lib/social/oauth-state'
import { COOKIE_PENDIENTE, PENDIENTE_MAX_AGE, serializarPendiente } from '@/lib/social/pendiente'

export const dynamic = 'force-dynamic'

/** Instagram runs on Facebook Login, so every leg of its OAuth is on the Facebook host. */
const GRAPH = 'https://graph.facebook.com/v23.0'

type Candidata = { externalId: string; handle: string | null; accessToken?: string }

type Credential = {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  /** Lo que el login dejó elegir: una para la mayoría de redes, varias en Meta y Google. */
  candidatas: Candidata[]
}

/**
 * The only error type whose `.message` is allowed to reach the redirect: every throw
 * site below writes its own fixed, human-authored Spanish sentence, never a fragment
 * of an upstream response or a driver error. Anything else caught in the handler
 * (a non-JSON body breaking `.json()`, a DB write failure) is not an `OAuthError` and
 * falls back to a generic message instead.
 */
class OAuthError extends Error {}

/**
 * The code → short token → long-lived token dance both Meta networks share. `label`
 * only flavors the fixed error sentences; the credentials are the same Meta app.
 */
async function exchangeMetaCode(
  code: string,
  redirectUri: string,
  label: 'Instagram' | 'Facebook',
): Promise<{ accessToken: string; expiresIn?: number }> {
  const appId = env('INSTAGRAM_APP_ID')
  const appSecret = env('INSTAGRAM_APP_SECRET')
  if (!appId || !appSecret) {
    throw new OAuthError('Faltan las credenciales de la app de Meta (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).')
  }

  const shortUrl = new URL(`${GRAPH}/oauth/access_token`)
  shortUrl.searchParams.set('client_id', appId)
  shortUrl.searchParams.set('client_secret', appSecret)
  shortUrl.searchParams.set('redirect_uri', redirectUri)
  shortUrl.searchParams.set('code', code)
  const short = await fetch(shortUrl)
  if (!short.ok) throw new OAuthError(`${label} rechazó el código: ${short.status}`)
  const shortData = (await short.json()) as { access_token?: string }
  if (!shortData.access_token) throw new OAuthError(`${label} no devolvió token`)

  // The code exchange returns a token good for a couple of hours; handing it straight
  // back through fb_exchange_token is what turns it into the ~60-day one worth keeping.
  const longUrl = new URL(`${GRAPH}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', appId)
  longUrl.searchParams.set('client_secret', appSecret)
  longUrl.searchParams.set('fb_exchange_token', shortData.access_token)
  const long = await fetch(longUrl)
  if (!long.ok) throw new OAuthError(`${label} no canjeó el token largo: ${long.status}`)
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }
  // A 200 without a token would store a credential good for about an hour stamped as
  // good for sixty days (see instagramCredential's history) — fail loudly instead.
  if (!longData.access_token) throw new OAuthError(`${label} no devolvió el token largo`)

  return { accessToken: longData.access_token, expiresIn: longData.expires_in }
}

async function instagramCredential(code: string, redirectUri: string): Promise<Credential> {
  const exchanged = await exchangeMetaCode(code, redirectUri, 'Instagram')
  const token = exchanged.accessToken

  // Facebook Login authorizes a person, not one Instagram account, so the id the sync
  // is keyed on has to be discovered through the Pages this person administers. Failing
  // loudly here beats storing a credential the connector could never use.
  const pages = await fetch(
    `${GRAPH}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${token}`,
  )
  if (!pages.ok) throw new OAuthError(`No se pudieron leer las páginas de Facebook: ${pages.status}`)

  const cuentas = listInstagramAccounts((await pages.json()) as FacebookPages)
  if (cuentas.length === 0) throw new OAuthError(NO_INSTAGRAM_ACCOUNT)
  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: instagramTokenExpiry(exchanged.expiresIn),
    candidatas: cuentas.map((c) => ({ externalId: c.id, handle: c.username ? `@${c.username}` : null })),
  }
}

async function facebookCredential(code: string, redirectUri: string): Promise<Credential> {
  const exchanged = await exchangeMetaCode(code, redirectUri, 'Facebook')

  const pages = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${exchanged.accessToken}`,
  )
  if (!pages.ok) {
    throw new OAuthError(`No se pudieron leer las páginas de Facebook: ${pages.status}`)
  }

  const paginas = listFacebookPages((await pages.json()) as FacebookPagesList)
  if (paginas.length === 0) throw new OAuthError(NO_FACEBOOK_PAGE)
  return {
    // El token de usuario queda como base; el de cada página viaja en su candidata (una
    // sola) o se vuelve a pedir en la selección (varias). Derivados de un token largo,
    // los de página no expiran: por eso expiresAt null y no una fecha inventada.
    accessToken: exchanged.accessToken,
    refreshToken: null,
    expiresAt: null,
    candidatas: paginas.map((p) => ({ externalId: p.id, handle: p.name, accessToken: p.accessToken ?? undefined })),
  }
}

async function youtubeCredential(code: string, redirectUri: string): Promise<Credential> {
  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new OAuthError('Faltan las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const exchange = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!exchange.ok) {
    console.error('Google rechazó el código:', exchange.status, (await exchange.text()).slice(0, 300))
    throw new OAuthError('Google rechazó el código. Inténtalo de nuevo.')
  }
  const tokens = (await exchange.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
  if (!tokens.access_token) throw new OAuthError('Google no devolvió token.')
  // Scope names are not secrets, and Google silently trims sensitive scopes it decides
  // not to grant — this line is what tells that apart from every other 403.
  console.error('Scopes otorgados por Google:', tokens.scope ?? '(sin campo scope)')
  // Without a refresh token the hourly access token is a dead end: better to fail the
  // connect now than to strand the cron in an hour. prompt=consent should prevent this.
  if (!tokens.refresh_token) {
    throw new OAuthError('Google no entregó el token de refresco. Reintenta la conexión.')
  }

  const channels = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  )
  if (!channels.ok) {
    console.error('No se pudo leer el canal:', channels.status, (await channels.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer el canal de YouTube.')
  }
  const data = (await channels.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>
  }
  const canales = (data.items ?? []).filter((c): c is { id: string; snippet?: { title?: string } } => Boolean(c.id))
  if (canales.length === 0) throw new OAuthError('Esta cuenta de Google no tiene canal de YouTube.')

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    candidatas: canales.map((c) => ({ externalId: c.id, handle: c.snippet?.title ?? null })),
  }
}

async function threadsCredential(code: string, redirectUri: string): Promise<Credential> {
  const appId = env('THREADS_APP_ID')
  const appSecret = env('THREADS_APP_SECRET')
  if (!appId || !appSecret) {
    throw new OAuthError('Faltan las credenciales de Threads (THREADS_APP_ID / THREADS_APP_SECRET).')
  }

  const short = await fetch('https://graph.threads.net/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })
  if (!short.ok) {
    console.error('Threads rechazó el código:', short.status, (await short.text()).slice(0, 300))
    throw new OAuthError('Threads rechazó el código. Inténtalo de nuevo.')
  }
  const shortData = (await short.json()) as { access_token?: string }
  if (!shortData.access_token) throw new OAuthError('Threads no devolvió token.')

  // Same two-step dance as Instagram: the code buys an hour, th_exchange_token buys
  // the ~60 days worth storing.
  const long = await fetch(
    `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortData.access_token}`,
  )
  if (!long.ok) {
    console.error('Threads no canjeó el token largo:', long.status, (await long.text()).slice(0, 300))
    throw new OAuthError('Threads no canjeó el token largo. Inténtalo de nuevo.')
  }
  const longData = (await long.json()) as { access_token?: string; expires_in?: number }
  if (!longData.access_token) throw new OAuthError('Threads no devolvió el token largo.')

  const me = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${longData.access_token}`,
  )
  if (!me.ok) {
    console.error('No se pudo leer el perfil de Threads:', me.status, (await me.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer el perfil de Threads.')
  }
  const profile = (await me.json()) as { id?: string; username?: string }
  if (!profile.id) throw new OAuthError('Threads no devolvió el perfil.')

  return {
    accessToken: longData.access_token,
    refreshToken: null,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
    candidatas: [{ externalId: profile.id, handle: profile.username ?? null }],
  }
}

async function xCredential(
  code: string,
  redirectUri: string,
  pkceVerifier: string | undefined,
): Promise<Credential> {
  const clientId = env('X_CLIENT_ID')
  const clientSecret = env('X_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new OAuthError('Faltan las credenciales de X (X_CLIENT_ID / X_CLIENT_SECRET).')
  }
  if (!pkceVerifier) {
    throw new OAuthError('La conexión con X expiró. Inténtalo de nuevo.')
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const exchange = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: pkceVerifier,
    }),
  })
  if (!exchange.ok) {
    console.error('X rechazó el código:', exchange.status, (await exchange.text()).slice(0, 300))
    throw new OAuthError('X rechazó el código. Inténtalo de nuevo.')
  }
  const tokens = (await exchange.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!tokens.access_token) throw new OAuthError('X no devolvió token.')
  // The two-hour token is useless without its refresh companion.
  if (!tokens.refresh_token) throw new OAuthError('X no entregó el token de refresco. Inténtalo de nuevo.')

  const me = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!me.ok) {
    console.error('No se pudo leer la cuenta de X:', me.status, (await me.text()).slice(0, 300))
    throw new OAuthError('No se pudo leer la cuenta de X.')
  }
  const user = (await me.json()) as { data?: { id?: string; username?: string } }
  if (!user.data?.id) throw new OAuthError('X no devolvió la cuenta.')

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000),
    candidatas: [{ externalId: user.data.id, handle: user.data.username ?? null }],
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
  // La identidad de una cuenta es (red, id externo): sin open_id la fila no tendría
  // identidad y un reconectar crearía otra en vez de renovar el token de la que ya está.
  if (!data.open_id) throw new OAuthError('TikTok no devolvió el id de la cuenta. Vuelve a conectar.')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
    candidatas: [{ externalId: data.open_id, handle: null }],
  }
}

async function fetchCredential(
  network: string,
  code: string,
  redirectUri: string,
  pkceVerifier?: string,
): Promise<Credential> {
  if (network === 'instagram') return instagramCredential(code, redirectUri)
  if (network === 'facebook') return facebookCredential(code, redirectUri)
  if (network === 'youtube') return youtubeCredential(code, redirectUri)
  if (network === 'threads') return threadsCredential(code, redirectUri)
  if (network === 'x') return xCredential(code, redirectUri, pkceVerifier)
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
    NextResponse.redirect(`${url.origin}/admin/accounts?mensaje=${encodeURIComponent(message)}`)

  if (!code || !state) return back('La red no devolvió el código de autorización.')

  try {
    // Verifies, but as something other than a state we minted for this network — a
    // session cookie replayed here would land exactly there.
    if (!(await oauthStateMatches(state, network))) {
      return back('El estado no corresponde a esa red.')
    }
  } catch {
    return back('El enlace de conexión expiró. Inténtalo de nuevo.')
  }

  const redirectUri = `${url.origin}/api/social/${network}/callback`

  try {
    const pkceVerifier = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)x_pkce_verifier=([^;]+)/)?.[1]
    const credential = await fetchCredential(network, code, redirectUri, pkceVerifier)

    if (credential.candidatas.length === 1) {
      const [unica] = credential.candidatas
      await guardarCuenta(network, {
        externalId: unica!.externalId,
        handle: unica!.handle,
        // Facebook publica y lee con el token de la página, no con el del usuario.
        accessToken: unica!.accessToken ?? credential.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: credential.expiresAt,
      })
      return back(`${network} conectado.`)
    }

    // Varias candidatas: el dueño elige en el panel. El token de usuario y la lista
    // viajan cifrados en una cookie corta; los tokens de página no (no cabrían).
    const response = NextResponse.redirect(`${url.origin}/admin/accounts/elegir?red=${network}`)
    response.cookies.set(
      COOKIE_PENDIENTE,
      serializarPendiente({
        network,
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: credential.expiresAt?.toISOString() ?? null,
        candidatas: credential.candidatas.map(({ externalId, handle }) => ({ externalId, handle })),
      }),
      { httpOnly: true, secure: true, sameSite: 'lax', maxAge: PENDIENTE_MAX_AGE, path: '/admin/accounts' },
    )
    return response
  } catch (error) {
    // Only our own OAuthError carries a message we wrote ourselves. Everything else —
    // a non-JSON upstream body breaking `.json()`, a DB write failure — gets logged
    // server-side and a fixed fallback, never its raw message, in the redirect.
    if (error instanceof OAuthError) return back(error.message)
    console.error('Error conectando red social:', error)
    return back('No se pudo conectar. Inténtalo de nuevo.')
  }
}
