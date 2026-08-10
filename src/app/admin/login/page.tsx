import { redirect } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/admin')

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="aurora" aria-hidden>
        <span />
      </div>
      <div className="surface w-full max-w-sm rounded-3xl p-8">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-fg-faint">Panel</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">
          Entra a tu panel
        </h1>
        <LoginForm />
      </div>
    </main>
  )
}
