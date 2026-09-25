import { NextResponse } from 'next/server'
import { requireMobileUser } from '@/lib/mobile-guardia'
import {
  CUERPO_ILEGIBLE,
  parseBorradorMovil,
  parseConteos,
  resolverCuando,
  resolverDestinos,
} from '@/lib/mobile-api'
import { validateScheduleDraft } from '@/lib/social/publish/validate'
import { CuentaInvalida } from '@/lib/social/cuentas'

export const dynamic = 'force-dynamic'

/**
 * Las mismas reglas que la creación, antes de subir un solo byte: rechazar «X no
 * recibe video» después de un video de 200 MB por datos móviles es tirar el tráfico
 * del dueño. Solo cuenta archivos; las URLs todavía no existen.
 *
 * `resolverDestinos` (compartida con el `POST` de `schedule/route.ts` — ver su
 * comentario) resuelve el destino ANTES de validar por red: las reglas de
 * `validateScheduleDraft` son de la red, pero la red que cuenta es la de la cuenta
 * real, no una que el cuerpo declare aparte.
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

  let networks: string[]
  try {
    ;({ networks } = await resolverDestinos(usuario.id, borrador))
  } catch (fallo) {
    if (fallo instanceof CuentaInvalida) return NextResponse.json({ error: fallo.message }, { status: 400 })
    throw fallo
  }

  const now = new Date()
  const error = validateScheduleDraft(
    {
      caption: borrador.texto,
      imageCount: conteos.fotos,
      videoCount: conteos.videos,
      networks,
      scheduledAt: resolverCuando(borrador.ahora, borrador.cuando, now),
    },
    now,
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ ok: true })
}
