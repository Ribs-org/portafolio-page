import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { normalizarCorreo } from '@/lib/ingreso'
import { FormularioCodigo } from '../formularios'

export const metadata = { title: 'Código', robots: { index: false, follow: false } }
// Calza la barra del navegador del teléfono con el acero de la puerta de entrada.
export const viewport = { themeColor: '#16181a' }
export const dynamic = 'force-dynamic'

export default async function CodigoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await usuarioActual()) redirect('/admin')
  const correo = normalizarCorreo(String((await searchParams).correo ?? ''))
  if (!correo) redirect('/ingresar')
  return (
    <main className="acerado grid min-h-dvh place-items-center bg-acero-950 px-6">
      <div className="chapa w-full max-w-sm rounded-3xl p-8">
        <p className="font-titulo text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Parrilla</p>
        <h1 className="mt-2 font-titulo text-2xl font-semibold uppercase tracking-[0.06em]">Tu código</h1>
        <FormularioCodigo correo={correo} />
      </div>
    </main>
  )
}
