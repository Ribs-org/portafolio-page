'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui'

/** La red de la puerta de entrada: si falta AUTH_SECRET o ADMIN_EMAIL, o la base no responde, el usuario ve una frase en español y no la pantalla en inglés de Next. */
export default function IngresarError({
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
    <main className="acerado grid min-h-dvh place-items-center bg-acero-950 px-6">
      <section className="chapa mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-titulo text-lg font-semibold uppercase tracking-[0.03em]">Algo se rompió</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          No fue nada que hicieras: no pudimos preparar tu ingreso. Vuelve a intentarlo; el detalle
          quedó en la consola del navegador.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="primary" onClick={() => retry()}>
            Reintentar
          </Button>
        </div>
      </section>
    </main>
  )
}
