import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { BORRADO_YA_PUBLICADO } from '@/lib/schedule-api'
import { borrarPostProgramado } from '@/lib/social/publish/borrar'
import { adminId } from '@/lib/usuarios'

export const dynamic = 'force-dynamic'

/**
 * Saca un post programado por API: el que `POST /api/schedule/batch` devolvió como
 * `postId`, o el que lista `GET /api/schedule/posts`. La regla es la misma que la del
 * panel, y se comparte con él en `borrarPostProgramado` para que no puedan divergir:
 * borrar la fila no despublica nada en la red, así que un post con algún destino ya
 * publicado o publicando se rechaza con la frase de siempre.
 *
 * `404` no distingue «no existe» de «no es del dueño» a propósito: la llave es del
 * despliegue y lo que entra por ella es del admin; nombrar la diferencia solo le diría a
 * quien no tiene la llave qué ids existen.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = env('SCHEDULE_API_KEY')
  // Sin llave configurada el endpoint queda cerrado — molde del batch.
  if (!key || request.headers.get('authorization') !== `Bearer ${key}`) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  const { id } = await params
  // La llave de API es del despliegue, no de una persona: lo que entra por ahí es del admin.
  const ownerId = await adminId()

  const resultado = await borrarPostProgramado(ownerId, id)
  if (resultado === 'no-existe') return NextResponse.json({ error: 'Ese post no existe.' }, { status: 404 })
  if (resultado === 'publicado') return NextResponse.json({ error: BORRADO_YA_PUBLICADO }, { status: 409 })
  return NextResponse.json({ ok: true, id })
}
