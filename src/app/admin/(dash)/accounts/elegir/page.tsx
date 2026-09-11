import Link from 'next/link'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { conectarElegidas } from '@/app/admin/actions'
import { getDb, socialAccounts } from '@/db'
import { networkLabel } from '@/lib/networks'
import { COOKIE_PENDIENTE, LOGIN_VENCIDO, leerPendiente } from '@/lib/social/pendiente'

export const dynamic = 'force-dynamic'

/**
 * «¿Cuáles conectar?»: la lista que Meta o Google devolvieron, con casillas. Vive de la
 * cookie de conexión pendiente; sin ella no hay nada que elegir y se vuelve a Cuentas.
 */
export default async function Elegir({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null
  const pendiente = leerPendiente((await cookies()).get(COOKIE_PENDIENTE)?.value)

  if (!pendiente) {
    return (
      <section className="surface rounded-2xl p-6">
        <p className="text-sm">{LOGIN_VENCIDO}</p>
        <Link href="/admin/accounts" className="mt-3 inline-block text-sm text-fg-muted hover:text-fg">
          ← Volver a Cuentas
        </Link>
      </section>
    )
  }

  // «Ya conectada» se decide acá y no en la cookie: la lista de Meta no sabe qué filas
  // tenemos. Y conectada quiere decir «con credencial», el mismo criterio que la pestaña
  // Cuentas: una fila sin token está para reconectar, no para marcarla como ya lista.
  const existentes = new Set(
    (
      await getDb()
        .select({ externalId: socialAccounts.externalId, accessToken: socialAccounts.accessToken })
        .from(socialAccounts)
        .where(eq(socialAccounts.network, pendiente.network))
    )
      .filter((r) => r.accessToken !== null)
      .map((r) => r.externalId),
  )

  return (
    <section className="surface rounded-2xl p-6">
      <h1 className="font-display text-lg font-semibold">
        ¿Qué cuentas de {networkLabel(pendiente.network)} conectar?
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        Marca las que quieres ver en el panel. Las ya conectadas solo renuevan su acceso.
      </p>
      {mensaje ? <p className="mt-3 text-sm text-red-400">{mensaje}</p> : null}

      <form action={conectarElegidas} className="mt-4 space-y-2">
        {pendiente.candidatas.map((c) => (
          <label key={c.externalId} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
            <input type="checkbox" name="ids" value={c.externalId} defaultChecked={existentes.has(c.externalId)} />
            <span className="flex-1 truncate">{c.handle ?? c.externalId}</span>
            {existentes.has(c.externalId) ? (
              <span className="font-mono text-[0.68rem] text-fg-faint">ya conectada</span>
            ) : null}
          </label>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="rounded-lg bg-white/[0.1] px-4 py-2 text-sm hover:bg-white/[0.15]">
            Conectar
          </button>
          <Link href="/admin/accounts" className="text-sm text-fg-faint hover:text-fg">
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  )
}
