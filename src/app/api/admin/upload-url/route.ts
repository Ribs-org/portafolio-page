import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { usuarioActual } from '@/lib/auth'
import { CUERPO_ILEGIBLE, prepararSubida } from '@/lib/mobile-api'
import { tipoDesdeNombre } from '@/lib/social/publish/batch'
import { SIN_ALMACEN, urlParaSubir } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Un PUT firmado por archivo, para el panel web. Gemela de `api/mobile/upload-url`, con la
 * única diferencia de la guarda: allá un token Bearer, acá la cookie de sesión.
 *
 * Existe porque Vercel corta los cuerpos de petición en ~4,5 MB —medido contra producción
 * el 2026-09-23, no supuesto— y el compositor mandaba el video dentro del formulario de la
 * acción de servidor, así que cualquier video de tamaño real devolvía `413`. Con esto el
 * archivo viaja del navegador a R2 sin pasar por la función, y el tope desaparece.
 *
 * `prepararSubida` vive en `lib/mobile-api` por dónde nació, pero no tiene nada de móvil:
 * valida nombre, tipo y tamaño, y arma la clave bajo `scheduled/`.
 *
 * Lo que se suba y nunca llegue a un post lo borra el barrido diario.
 */
export async function POST(request: Request) {
  if (!(await usuarioActual())) {
    // 401 y no un redirect: esto lo llama `fetch`, que no tiene adónde navegar.
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { nombre?: unknown; tipo?: unknown; bytes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: CUERPO_ILEGIBLE }, { status: 400 })
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre : ''
  // Algunos .mov llegan con `type` vacío desde el navegador: se resuelve por extensión,
  // igual que hacía `tipoArchivo` cuando el archivo cruzaba la función.
  const tipo = (typeof body.tipo === 'string' && body.tipo) || tipoDesdeNombre(nombre)

  const subida = prepararSubida(nombre, tipo, body.bytes, randomUUID())
  if ('error' in subida) return NextResponse.json({ error: subida.error }, { status: 400 })

  try {
    const { subir, publica } = await urlParaSubir(subida.key, subida.tipo)
    // `tipo` viaja de vuelta porque el PUT tiene que mandar exactamente el content-type
    // que se firmó: con un .mov sin tipo, el navegador no sabría cuál fue.
    return NextResponse.json({ subir, publica, mediaType: subida.mediaType, tipo: subida.tipo })
  } catch (error) {
    console.error('admin/upload-url:', String(error).slice(0, 300))
    return NextResponse.json({ error: SIN_ALMACEN }, { status: 500 })
  }
}
