import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Términos',
  description: 'Condiciones de uso de este sitio.',
}

/** Must match the address in the privacy page — a fork changes both. */
const CONTACTO = 'TU-EMAIL@EJEMPLO.COM'

const ACTUALIZADO = '26 de agosto de 2026'

export default function TerminosPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Términos</h1>
        <p className="mt-2 text-sm text-fg-muted">Actualizado el {ACTUALIZADO}.</p>
      </header>

      <p className="leading-relaxed text-fg-muted">
        Este es un sitio personal que reúne enlaces a los perfiles, proyectos y publicaciones de
        su dueño. Es gratuito, no requiere registro y no vende nada. Usarlo implica aceptar lo
        que sigue.
      </p>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Qué ofrece</h2>
        <p className="leading-relaxed text-fg-muted">
          Una página con enlaces. El contenido —textos, imágenes y la selección de enlaces— es del
          dueño del sitio, que puede cambiarlo, reorganizarlo o retirarlo cuando quiera, sin
          aviso.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Enlaces a terceros</h2>
        <p className="leading-relaxed text-fg-muted">
          Casi todo lo que hay acá lleva a otro sitio: redes sociales, tiendas, plataformas de
          video. Esos sitios no son de este dueño y se rigen por sus propios términos y sus
          propias políticas de privacidad. Lo que hagas allí queda entre tú y ellos.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Sin garantías</h2>
        <p className="leading-relaxed text-fg-muted">
          El sitio se ofrece tal como está. Puede quedar fuera de servicio, un enlace puede
          apuntar a algo que ya no existe, y la información puede quedar desactualizada. No se
          asume responsabilidad por daños derivados de usarlo o de no poder usarlo.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">El panel privado</h2>
        <p className="leading-relaxed text-fg-muted">
          La sección de administración es de uso exclusivo del dueño y está protegida con
          contraseña. Intentar acceder a ella sin autorización no está permitido.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Datos</h2>
        <p className="leading-relaxed text-fg-muted">
          Qué se mide y qué no está descrito en la{' '}
          <Link
            href="/privacidad"
            className="text-fg underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-white/50"
          >
            política de privacidad
          </Link>
          . El resumen es que no hay cookies de seguimiento ni analítica de terceros.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Cambios y contacto</h2>
        <p className="leading-relaxed text-fg-muted">
          Estos términos pueden cambiar; la fecha de arriba indica la última versión. Para
          cualquier consulta:{' '}
          <a
            href={`mailto:${CONTACTO}`}
            className="text-fg underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-white/50"
          >
            {CONTACTO}
          </a>
          .
        </p>
      </section>
    </article>
  )
}
