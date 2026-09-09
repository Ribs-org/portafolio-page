import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { CUERPO_ILEGIBLE, prepararSubida, requireMobile } from '@/lib/mobile-api'
import { SIN_ALMACEN, urlParaSubir } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Un PUT firmado por archivo. El teléfono sube directo a R2 con él: un video del
 * teléfono pasa los 100 MB que Vercel acepta de cuerpo, y así ningún byte cruza la
 * función. Lo que se suba y nunca llegue a un post lo borra el barrido diario.
 */
export async function POST(request: Request) {
  if (!(await requireMobile(request))) {
    return new NextResponse('No autorizado', { status: 401 })
  }

  let body: { nombre?: unknown; tipo?: unknown; bytes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }
  const nombre = typeof body.nombre === 'string' ? body.nombre : ''
  const tipo = typeof body.tipo === 'string' ? body.tipo : ''
  const subida = prepararSubida(nombre, tipo, body.bytes, randomUUID())
  if ('error' in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

  try {
    const { subir, publica } = await urlParaSubir(subida.key, subida.tipo)
    return NextResponse.json({ subir, publica, mediaType: subida.mediaType })
  } catch (error) {
    console.error('upload-url:', String(error).slice(0, 300))
    return NextResponse.json({ error: SIN_ALMACEN }, { status: 500 })
  }
}
