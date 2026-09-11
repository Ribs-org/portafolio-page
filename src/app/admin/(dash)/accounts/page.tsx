import { getCuentas } from '@/lib/posts'
import { Cuentas } from './cuentas'

export const dynamic = 'force-dynamic'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  // El resultado del último login: una frase, una vez.
  const mensaje = typeof params.mensaje === 'string' ? params.mensaje.slice(0, 200) : null
  const cuentas = await getCuentas()
  return (
    <>
      {mensaje ? (
        <p className="mb-4 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-muted">{mensaje}</p>
      ) : null}
      <Cuentas rows={cuentas} />
    </>
  )
}
