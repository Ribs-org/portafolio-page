import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { darDeBaja } from '@/lib/social/meta-bajas'
import { leerSignedRequest } from '@/lib/social/meta-firma'

export const dynamic = 'force-dynamic'

/**
 * El *Deauthorize callback* de Meta: cuando alguien quita la app desde su cuenta de
 * Facebook, Meta manda acá un `POST` con un `signed_request` firmado con el app secret.
 *
 * Es público y sin sesión —quien quita la app no está en nuestro panel—, así que la única
 * llave es la firma. Todo lo que no calza es `400` sin cuerpo, sin decir qué falló.
 */
export async function POST(request: Request) {
  const secret = env('INSTAGRAM_APP_SECRET')
  // Sin secreto configurado la ruta queda cerrada, no abierta: no hay con qué distinguir a
  // Meta de cualquier otro, y aceptar sería borrar credenciales a pedido de quien sea.
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

  try {
    await darDeBaja(firmado.userId)
  } catch (error) {
    // Solo el mensaje, acotado: el error crudo del driver arrastra los parámetros de la
    // consulta, y ahí iría el id de usuario de Meta. El 500 basta para que Meta reintente.
    console.error('meta/baja: no se pudo dar de baja', String(error).slice(0, 300))
    return new NextResponse(null, { status: 500 })
  }
  return new NextResponse(null, { status: 200 })
}
