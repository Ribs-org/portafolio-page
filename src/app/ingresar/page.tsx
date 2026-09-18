import { redirect } from 'next/navigation'
import { usuarioActual } from '@/lib/auth'
import { FormularioCorreo } from './formularios'

export const metadata = { title: 'Entrar', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function IngresarPage() {
  if (await usuarioActual()) redirect('/admin')
  return (
    <main className="grid min-h-dvh place-items-center bg-acero-950 px-6">
      <div className="chapa w-full max-w-sm rounded-3xl p-8">
        <p className="font-titulo text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Parrilla</p>
        <h1 className="mt-2 font-titulo text-2xl font-semibold uppercase tracking-[0.06em]">Entra con tu correo</h1>
        <FormularioCorreo />
      </div>
    </main>
  )
}
