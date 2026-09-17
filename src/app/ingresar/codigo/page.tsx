import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { normalizarCorreo } from '@/lib/ingreso'
import { FormularioCodigo } from '../formularios'

export const metadata = { title: 'Código', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function CodigoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await usuarioActual()) redirect('/admin')
  const correo = normalizarCorreo(String((await searchParams).correo ?? ''))
  if (!correo) redirect('/ingresar')
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="aurora" aria-hidden><span /></div>
      <div className="surface w-full max-w-sm rounded-3xl p-8">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Parrilla</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">Tu código</h1>
        <FormularioCodigo correo={correo} />
      </div>
    </main>
  )
}
