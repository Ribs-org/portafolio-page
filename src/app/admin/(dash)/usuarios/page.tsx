import { Panel } from '@/components/charts/panel'
import { requireAdmin } from '@/lib/auth'
import { listarUsuarios } from '@/lib/usuarios'
import { FormularioInvitar, BotonQuitar } from './formularios'

export const dynamic = 'force-dynamic'

const FECHA = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })

export default async function UsuariosPage() {
  await requireAdmin()
  const usuarios = await listarUsuarios()
  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Usuarios</h1>
        <p className="mt-1 text-sm text-fg-muted">Quién puede entrar a Parrilla. Invitar manda el primer código al correo.</p>
      </header>
      <Panel title="Invitar" className="mb-6">
        <FormularioInvitar />
      </Panel>
      <Panel title="Invitados">
        <ul className="divide-y divide-white/[0.06]">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.nombre ? `${u.nombre} · ` : ''}{u.correo}</span>
              <span className="text-xs text-fg-faint">{u.rol === 'admin' ? 'admin' : u.primerIngresoEn ? `entró ${FECHA.format(u.primerIngresoEn)}` : `invitado ${FECHA.format(u.invitadoEn)}`}</span>
              {u.rol !== 'admin' && !u.primerIngresoEn ? <BotonQuitar id={u.id} /> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
