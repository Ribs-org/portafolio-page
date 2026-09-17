import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { passwordMatches } from '@/lib/auth'
import { normalizarCorreo } from '@/lib/ingreso'
import { mintMobileToken } from '@/lib/mobile-token'
import { asegurarAdmin, canjear } from '@/lib/usuarios'

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

  let body: { password?: unknown; correo?: unknown; codigo?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 })
  }

  // Camino de transición: la app instalada manda la contraseña del panel y entra como el admin.
  if (typeof body.password === 'string') {
    if (!passwordMatches(body.password)) return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
    let admin
    try {
      admin = await asegurarAdmin()
    } catch {
      // Sin ADMIN_EMAIL no hay a quién dejar entrar; decirlo es mejor que fingir que la
      // contraseña está mal.
      return NextResponse.json({ error: 'El servidor no tiene configurado el correo del dueño.' }, { status: 503 })
    }
    return NextResponse.json({ token: await mintMobileToken({ sub: admin.id, sv: admin.sesionVersion }) })
  }

  const correo = normalizarCorreo(typeof body.correo === 'string' ? body.correo : '')
  const codigo = typeof body.codigo === 'string' ? body.codigo.replace(/\D/g, '') : ''
  if (!correo || !codigo) return NextResponse.json({ error: 'Faltan el correo o el código.' }, { status: 400 })
  const resultado = await canjear(correo, codigo)
  if ('error' in resultado) return NextResponse.json({ error: resultado.error }, { status: 401 })
  return NextResponse.json({ token: await mintMobileToken({ sub: resultado.usuario.id, sv: resultado.usuario.sesionVersion }) })
}
