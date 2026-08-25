import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { isAuthenticated } from '@/lib/auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const SCOPES: Record<string, string> = {
  instagram: 'instagram_business_basic,instagram_business_manage_insights',
  tiktok: 'user.info.basic,video.list',
}

function secret(): Uint8Array {
  const value = env('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(value)
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
  const state = await new SignJWT({ network })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())

  if (network === 'instagram') {
    const appId = env('INSTAGRAM_APP_ID')
    if (!appId) return new NextResponse('Falta INSTAGRAM_APP_ID', { status: 400 })

    const url = new URL('https://www.instagram.com/oauth/authorize')
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
