import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'
import { mayConnectAccount } from '@/lib/social/connector'
import { encryptToken } from '@/lib/social/crypto'
import { FacebookPageError, pickFacebookPage, type FacebookPagesList } from '@/lib/social/facebook'
import {
  InstagramAccountError,
  instagramTokenExpiry,
  pickInstagramAccount,
  type FacebookPages,
} from '@/lib/social/instagram'
import { oauthStateMatches } from '@/lib/social/oauth-state'

export const dynamic = 'force-dynamic'

/** Instagram runs on Facebook Login, so every leg of its OAuth is on the Facebook host. */
const GRAPH = 'https://graph.facebook.com/v23.0'

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

  let igAccount
  try {
    igAccount = pickInstagramAccount(
      (await pages.json()) as FacebookPages,
      env('INSTAGRAM_IG_USER_ID'),
    )
  } catch (error) {
    if (!(error instanceof InstagramAccountError)) throw error
    // The message is one of the connector's own fixed sentences, so it is safe to show.
    // The candidates are not: they carry usernames Meta sent us, and those only go to
    // the server log, where they are what the owner needs to pick an id for the variable.
    if (error.candidates.length > 0) {
      console.error('Cuentas de Instagram disponibles:', error.candidates)
    }
    throw new OAuthError(error.message)
  }

  return {
    accessToken: token,
    refreshToken: null,
    expiresAt: instagramTokenExpiry(exchanged.expiresIn),
    externalId: igAccount.id,
    handle: igAccount.username ? `@${igAccount.username}` : null,
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

  let page
  try {
    page = pickFacebookPage((await pages.json()) as FacebookPagesList, env('FACEBOOK_PAGE_ID'))
  } catch (error) {
    if (!(error instanceof FacebookPageError)) throw error
    // The message is one of the connector's own fixed sentences, so it is safe to show.
    // The candidates also carry each page's access token, so only id and name go to the
    // server log — never the raw candidates.
    if (error.candidates.length > 0) {
      console.error(
        'Páginas de Facebook disponibles:',
        error.candidates.map(({ id, name }) => ({ id, name })),
      )
    }
    throw new OAuthError(error.message)
  }

  if (!page.accessToken) {
    throw new OAuthError('Facebook no entregó el token de la página. Inténtalo de nuevo.')
  }

  return {
    // The page token, not the user token: it is what published_posts and insights are
    // asked with, and derived from a long-lived user token it does not expire — hence
    // expiresAt null rather than an invented date.
    accessToken: page.accessToken,
    refreshToken: null,
    expiresAt: null,
    externalId: page.id,
    handle: page.name,
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
  const channel = data.items?.[0]
  if (!channel?.id) throw new OAuthError('Esta cuenta de Google no tiene canal de YouTube.')

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    externalId: channel.id,
    handle: channel.snippet?.title ?? null,
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
    externalId: profile.id,
    handle: profile.username ?? null,
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
    externalId: user.data.id,
    handle: user.data.username ?? null,
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
    NextResponse.redirect(`${url.origin}/admin/content?mensaje=${encodeURIComponent(message)}`)

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

    // Refuse to move a connected network onto a different account.
    //
    // `external_id` is what the sync fetches posts for, while `social_posts` is keyed on
    // the network alone. Overwrite the id and the next cron run compares account B's
    // media against account A's stored posts, finds none of them, and — as long as B
    // returned something and fewer than MAX_POSTS_PER_SYNC items — archives A's entire
    // catalogue in a single statement. Reconnecting to A afterwards only clears
    // `archivedAt` for posts still inside the newest window; everything older stays
    // archived permanently.
    //
    // This stops that happening by accident. It does not make a deliberate switch safe:
    // changing accounts on purpose destroys the same history in the same way, which is
    // why the panel offers no way to do it and the message below does not invent one.
    const [existing] = await getDb()
      .select({ externalId: socialAccounts.externalId })
      .from(socialAccounts)
      .where(eq(socialAccounts.network, network))

    if (!mayConnectAccount(existing?.externalId ?? null, credential.externalId)) {
      throw new OAuthError(
        'Esta red ya está conectada a otra cuenta. Cambiarla archivaría las publicaciones de la anterior, así que no se hace desde el panel.',
      )
    }

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
