'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui'

/**
 * La red del panel entero: cualquier excepción de una página de `(dash)` cae acá en vez
 * de en la pantalla en inglés de Next.
 *
 * Next pasa `retry` y `reset`; la documentación instalada (16.3) pide `retry`, que vuelve
 * a pedir los datos además de re-renderizar — que es justo lo que falló.
 */
export default function PanelError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  // El mensaje puede venir de una fila de la base o de la respuesta de una red: a la
  // consola, donde lo lee quien depura, y nunca a la pantalla.
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="surface mx-auto mt-10 max-w-md rounded-2xl p-6 text-center">
      <h1 className="font-display text-lg font-semibold tracking-[-0.01em]">Algo se rompió</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        No fue nada que hicieras: una consulta no respondió. Vuelve a intentarlo; el detalle
        quedó en la consola del navegador.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="primary" onClick={() => retry()}>
          Reintentar
        </Button>
        <Link href="/admin" className="text-sm text-fg-muted transition-colors hover:text-fg">
          Ir al Resumen
        </Link>
      </div>
    </section>
  )
}
