import { NextResponse } from 'next/server'
import {
  CUERPO_ILEGIBLE,
  parseBorradorMovil,
  parseConteos,
  requireMobile,
  resolverCuando,
} from '@/lib/mobile-api'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { exigirCuentas, SinCuenta } from '@/lib/social/cuentas'

export const dynamic = 'force-dynamic'

/**
 * Las mismas reglas que la creación, antes de subir un solo byte: rechazar «X no
 * recibe video» después de un video de 200 MB por datos móviles es tirar el tráfico
 * del dueño. Solo cuenta archivos; las URLs todavía no existen.
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const borrador = parseBorradorMovil(body)
  if ('error' in borrador) return NextResponse.json({ error: borrador.error }, { status: 400 })
  const conteos = parseConteos(body)
  if ('error' in conteos) return NextResponse.json({ error: conteos.error }, { status: 400 })

  const now = new Date()
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: conteos.fotos,
      videoCount: conteos.videos,
      networks: borrador.redes,
      scheduledAt: resolverCuando(borrador.ahora, borrador.cuando, now),
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  // Este chequeo existe para fallar antes de la subida, así que también tiene que saberlo.
  try {
    await exigirCuentas(borrador.redes)
  } catch (fallo) {
    if (fallo instanceof SinCuenta) return NextResponse.json({ error: fallo.message }, { status: 400 })
    throw fallo
  }

  return NextResponse.json({ ok: true })
}
