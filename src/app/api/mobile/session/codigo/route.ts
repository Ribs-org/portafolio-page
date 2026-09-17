import { NextResponse } from 'next/server'
import { normalizarCorreo } from '@/lib/ingreso'
import { demasiadosIntentos } from '@/lib/limite-ip'
import { pedir } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

/** Siempre { ok: true }: la lista de invitados no se revela por la respuesta. */
export async function POST(request: Request) {
  let correo: string | null = null
  try {
    const body = await request.json()
    correo = normalizarCorreo(typeof body.correo === 'string' ? body.correo : '')
  } catch {
    // Cuerpo ilegible: misma respuesta neutra.
  }
  if (correo) {
    if (await demasiadosIntentos('pedir-movil', 10, 10 * 60_000)) return NextResponse.json({ ok: true })
    await pedir(correo)
  }
  return NextResponse.json({ ok: true })
}
