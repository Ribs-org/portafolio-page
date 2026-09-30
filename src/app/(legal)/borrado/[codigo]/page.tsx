import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { getDb, solicitudesBorrado } from '@/db'
import { SITE_TIMEZONE } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Borrado de datos',
  description: 'El estado de una solicitud de borrado.',
  robots: { index: false, follow: false },
}

const SIN_CODIGO = 'No conocemos ese código de borrado.'

/**
 * La página que Meta recibe como `url` al pedir un borrado, y que cualquiera con el
 * código puede abrir para confirmar que ocurrió.
 *
 * La lectura va por `codigo` y **no** por dueño, igual que `meta-bajas.ts` y por la misma
 * razón: `solicitudes_borrado` no tiene `owner_id` a propósito (spec §2.4) —cuando la fila
 * se escribe, ese dueño ya no tiene cuentas de Meta— y quien consulta no trae sesión. El
 * código aleatorio de 16 caracteres es la única llave, y la página no dice nada que la
 * necesite: ni nombre, ni correo, ni handle, solo la fecha y cuántas cuentas.
 *
 * Un código desconocido responde `200` con la frase, no `404`: Meta consulta esta URL y un
 * 404 se lee como «no borraron nada».
 *
 * Por eso mismo la fecha sale en `SITE_TIMEZONE` y no en la zona de nadie: sin `owner_id`
 * no hay dueño a quien preguntarle la suya, y quien abre la página tampoco trae sesión.
 * Es uno de los pocos sitios públicos donde la constante sigue siendo la respuesta.
 */
export default async function BorradoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const [solicitud] = await getDb()
    .select({ cuentas: solicitudesBorrado.cuentas, creadoEn: solicitudesBorrado.creadoEn })
    .from(solicitudesBorrado)
    .where(eq(solicitudesBorrado.codigo, codigo))
    .limit(1)

  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-titulo text-3xl font-semibold uppercase tracking-[0.03em]">Borrado de datos</h1>
      </header>

      <p className="leading-relaxed text-fg-muted">
        {solicitud ? (
          <>
            Datos borrados el{' '}
            <span className="text-fg">
              {new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: SITE_TIMEZONE }).format(
                solicitud.creadoEn,
              )}
            </span>
            : {solicitud.cuentas} {solicitud.cuentas === 1 ? 'cuenta' : 'cuentas'} de Instagram y Facebook.
          </>
        ) : (
          SIN_CODIGO
        )}
      </p>
    </article>
  )
}
