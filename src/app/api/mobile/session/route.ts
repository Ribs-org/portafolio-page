import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { passwordMatches } from '@/lib/auth'
import { mintMobileToken } from '@/lib/mobile-token'

export const dynamic = 'force-dynamic'

/**
 * Mejor esfuerzo, igual que el login del panel: las instancias son efímeras y hay
 * varias, así que esto frena un intento a mano, no una botnet. La defensa real es
 * una contraseña larga.
 */
const attempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60 * 1000

async function rateLimited(): Promise<boolean> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.until) {
    attempts.set(ip, { count: 1, until: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

export async function POST(request: Request) {
  if (await rateLimited()) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos.' }, { status: 429 })
  }

  let password = ''
  try {
    const body = await request.json()
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Falta la contraseña.' }, { status: 400 })
  }

  if (!passwordMatches(password)) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
  }

  return NextResponse.json({ token: await mintMobileToken() })
}
