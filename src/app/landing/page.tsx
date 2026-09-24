import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Landing, metadataLanding } from '@/components/landing'

/**
 * La landing, siempre alcanzable por su ruta.
 *
 * La raíz solo la muestra en el dominio del producto, y los previews corren en
 * `*.vercel.app`, donde ese chequeo nunca da verdadero. Sin esta ruta no habría forma de
 * revisar la landing antes de mergear, que es justo cuando conviene mirarla.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...metadataLanding((await headers()).get('host')),
    // El mismo contenido vive en la raíz del dominio del producto. Sin esto un buscador
    // indexaría las dos direcciones y repartiría las señales entre ellas. Esta existe para
    // poder mirarla en un preview, no para que la encuentre nadie.
    robots: { index: false, follow: true },
  }
}

export default function LandingPage() {
  return <Landing />
}
