import { NextResponse } from 'next/server'
import { requireMobileUser } from '@/lib/mobile-guardia'
import {
  CUERPO_ILEGIBLE,
  parseBorradorMovil,
  parseConteos,
  resolverCuando,
} from '@/lib/mobile-api'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { CuentaInvalida, cuentaUnicaPorRed } from '@/lib/social/cuentas'

export const dynamic = 'force-dynamic'

/**
 * Las mismas reglas que la creación, antes de subir un solo byte: rechazar «X no
 * recibe video» después de un video de 200 MB por datos móviles es tirar el tráfico
 * del dueño. Solo cuenta archivos; las URLs todavía no existen.
 */
export async function POST(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) {
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

  // Este chequeo existe para fallar antes de la subida, así que también tiene que
  // prometer lo mismo que el `POST` va a cumplir: con dos cuentas en una red, ninguno
  // adivina. `cuentaUnicaPorRed`, no `exigirCuentas` — si aquí dijera que sí con la más
  // antigua y el `POST` fuera el único que se da cuenta de la ambigüedad, la app subiría
  // el archivo por datos móviles para que el envío se rechace recién al final.
  try {
    await cuentaUnicaPorRed(usuario.id, borrador.redes)
  } catch (fallo) {
    if (fallo instanceof CuentaInvalida) return NextResponse.json({ error: fallo.message }, { status: 400 })
    throw fallo
  }

  return NextResponse.json({ ok: true })
}
