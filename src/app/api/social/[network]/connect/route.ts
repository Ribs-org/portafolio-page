import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'
import { signOAuthState } from '@/lib/social/oauth-state'

export const dynamic = 'force-dynamic'

// Instagram goes through Facebook Login, so the Pages scopes are not optional extras:
// the Instagram user id only exists as a field on the Page that owns it, and without
// `pages_show_list` and `pages_read_engagement` the callback has nothing to read it from.
// `instagram_content_publish` buys nothing today — it is requested now because scopes are
// granted once, at authorization, and a publishing feature added later would otherwise
// mean sending the owner back through the consent screen.
const SCOPES: Record<string, string> = {
  instagram:
    // `business_management` is what lets `me/accounts` enumerate Pages owned by a business
    // portfolio rather than by the person. Without it the call returns an empty list and the
    // Instagram account is undiscoverable, even when Page and account are correctly linked.
    'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,instagram_content_publish,business_management',
  tiktok: 'user.info.basic,video.list',
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ network: string }> },
) {
  if (!(await isAuthenticated())) return new NextResponse('No autorizado', { status: 401 })

  const { network } = await params
  const scope = SCOPES[network]
  if (!scope) return new NextResponse('Esa red no usa OAuth', { status: 400 })

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/social/${network}/callback`

  // A signed, short-lived state is what stops a stranger's callback from writing
  // their tokens into this dashboard.
  const state = await signOAuthState(network)

  if (network === 'instagram') {
    const appId = env('INSTAGRAM_APP_ID')
    if (!appId) return new NextResponse('Falta INSTAGRAM_APP_ID', { status: 400 })

    const url = new URL('https://www.facebook.com/v23.0/dialog/oauth')
    url.searchParams.set('client_id', appId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scope)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', state)
    return NextResponse.redirect(url)
  }

  const clientKey = env('TIKTOK_CLIENT_KEY')
  if (!clientKey) return new NextResponse('Falta TIKTOK_CLIENT_KEY', { status: 400 })

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.searchParams.set('client_key', clientKey)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return NextResponse.redirect(url)
}
