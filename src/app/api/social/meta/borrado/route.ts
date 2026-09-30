import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { borrarDatosDe } from '@/lib/social/meta-bajas'
import { leerSignedRequest } from '@/lib/social/meta-firma'

export const dynamic = 'force-dynamic'

/**
 * La *Data deletion request* de Meta: el mismo `POST` firmado que la baja, pero acá se
 * borra lo que vino de Instagram y Facebook y se responde el JSON que Meta exige, con un
 * código y la URL pública donde ese código se puede consultar (`/borrado/<código>`).
 *
 * La puerta es igual a la de la baja —sin secreto o sin firma válida, `400` sin cuerpo—.
 * La duplicación es a propósito: son dos funciones de ruta y un archivo de ruta no puede
 * exportar nada más que sus verbos, así que compartir el trozo costaría un módulo entero
 * para ahorrar seis líneas.
 */
export async function POST(request: Request) {
  const secret = env('INSTAGRAM_APP_SECRET')
  // Sin secreto configurado la ruta queda cerrada, no abierta: no hay con qué distinguir a
  // Meta de cualquier otro, y aceptar sería borrar datos a pedido de quien sea.
  if (!secret) return new NextResponse(null, { status: 400 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    // Un cuerpo que no es un formulario no llega de Meta.
    return new NextResponse(null, { status: 400 })
  }
  const raw = form.get('signed_request')
  const firmado = typeof raw === 'string' ? leerSignedRequest(raw, secret) : null
  if (!firmado) return new NextResponse(null, { status: 400 })

  let codigo: string
  try {
    ;({ codigo } = await borrarDatosDe(firmado.userId))
  } catch (error) {
    // Sin el id de usuario en el registro: es de Meta, y el 500 basta para que reintente.
    console.error('meta/borrado: no se pudo borrar', error)
    return new NextResponse(null, { status: 500 })
  }

  const { origin } = new URL(request.url)
  return NextResponse.json({ url: `${origin}/borrado/${codigo}`, confirmation_code: codigo })
}
