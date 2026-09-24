import type { Metadata } from 'next'
import { Landing } from '@/components/landing'

/**
 * La landing, siempre alcanzable por su ruta.
 *
 * La raíz solo la muestra en el dominio del producto, y los previews corren en
 * `*.vercel.app`, donde ese chequeo nunca da verdadero. Sin esta ruta no habría forma de
 * revisar la landing antes de mergear, que es justo cuando conviene mirarla.
 */
export const metadata: Metadata = {
  title: 'Tu Parrilla',
  description:
    'Programa la semana en tus redes y mira cuánta gente llegó a tu página por cada publicación.',
}

export default function LandingPage() {
  return <Landing />
}
