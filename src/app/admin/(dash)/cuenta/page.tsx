import { Panel } from '@/components/charts/panel'
import { Encabezado } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { horaEn, zonasDisponibles } from '@/lib/zona'
import { FormularioCuenta } from './formulario'

export const dynamic = 'force-dynamic'

export default async function CuentaPage() {
  const usuario = await requireUser()
  return (
    <>
      <header className="mb-6">
        <Encabezado ruta="/admin/cuenta" />
        <p className="mt-1 text-sm text-fg-muted">
          Con qué nombre apareces y en qué zona horaria vives. El correo con el que entras no se
          cambia acá.
        </p>
      </header>
      <Panel title="Tus datos">
        <FormularioCuenta
          nombre={usuario.nombre}
          zona={usuario.zona}
          zonas={zonasDisponibles()}
          // La hora se calcula acá, en el servidor, y no en el navegador: el reloj del
          // computador puede estar en otra zona (o mal), y lo que hay que mostrar es lo que
          // el servidor entiende por «ahora» en la zona guardada. Tras guardar, el
          // `revalidatePath` de la acción vuelve a pintar esta página y la trae nueva.
          ahora={horaEn(usuario.zona, new Date())}
        />
      </Panel>
    </>
  )
}
