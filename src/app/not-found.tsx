import Link from 'next/link'

/**
 * Lo que se ve cuando una dirección no existe.
 *
 * Antes salía la pantalla de Next, genérica y en inglés. Se descartó mandar toda dirección
 * inválida a la landing: para un buscador eso es una página que no existe respondiendo que
 * sí, y además mostraría el producto en el dominio personal de alguien, que es lo contrario
 * de la regla que ordena qué sirve cada dominio.
 *
 * Así que esta responde 404 de verdad —Next lo hace solo desde este archivo— y se limita a
 * ofrecer la salida. El texto sirve igual en el dominio del producto que en el de un
 * creador, porque no nombra a ninguno de los dos.
 */
export default function NoEncontrado() {
  return (
    <main className="acerado grid min-h-dvh place-items-center bg-acero-950 px-6">
      <section className="chapa mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-titulo text-lg font-semibold uppercase tracking-[0.03em]">
          No encontramos esa página
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          La dirección no existe, o la página dejó de estar publicada.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brasa px-3.5 py-2 text-sm font-medium text-acero-950 transition-[filter] hover:brightness-110"
        >
          Ir al inicio
        </Link>
      </section>
    </main>
  )
}
