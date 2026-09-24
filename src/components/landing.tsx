import Link from 'next/link'

/**
 * La cara pública del producto, en el dominio del producto.
 *
 * La dirección visual no se inventa acá: es la que ya usan el panel y la puerta —acero
 * frío, y la brasa solo donde hay calor o algo que hacer—. Lo único que esta página decide
 * es dónde gastar el énfasis, y lo gasta en un lugar: la semana de parrillas del hero, que
 * son las mismas `.grilla` del calendario y no un dibujo que se parece. El resto se queda
 * callado a propósito.
 *
 * No hace nada: no hay registro ni formulario. Los únicos enlaces son entrar y lo legal.
 */

/** La semana del hero. Estática a propósito: es una ilustración, no datos de nadie. */
const SEMANA = [
  { dia: 'lun', calor: 'prendida', cortes: 2 },
  { dia: 'mar', calor: 'apagada', cortes: 0 },
  { dia: 'mié', calor: 'llena', cortes: 4 },
  { dia: 'jue', calor: 'prendida', cortes: 1 },
  { dia: 'vie', calor: 'llena', cortes: 3 },
  { dia: 'sáb', calor: 'apagada', cortes: 0 },
  { dia: 'dom', calor: 'prendida', cortes: 1 },
] as const

const CLASE_CALOR = {
  apagada: 'grilla-apagada',
  prendida: 'grilla-prendida',
  llena: 'grilla-llena',
} as const

function Semana() {
  return (
    <div
      className="grid grid-cols-7 gap-1 sm:gap-2"
      role="img"
      aria-label="Una semana de parrillas: dos días apagados, tres prendidos y dos llenos."
    >
      {SEMANA.map(({ dia, calor, cortes }) => (
        <div key={dia} className="min-w-0">
          <p className="mb-1.5 truncate font-titulo text-[0.58rem] uppercase tracking-[0.08em] text-fg-faint sm:text-[0.62rem] sm:tracking-[0.16em]">{dia}</p>
          <div className={['grilla flex h-16 flex-col justify-end gap-1 p-1 sm:h-28 sm:p-1.5', CLASE_CALOR[calor]].join(' ')}>
            {Array.from({ length: cortes }, (_, i) => (
              <span key={i} className="h-1.5 rounded-[1px] bg-acero-950/70" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Un rasgo del producto. El texto manda; la pieza de al lado lo muestra. */
function Rasgo({ titulo, children, muestra }: { titulo: string; children: React.ReactNode; muestra: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-acero-700 py-10 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:gap-12">
      <div>
        <h2 className="font-titulo text-xl font-semibold uppercase tracking-[0.06em]">{titulo}</h2>
        <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-fg-muted">{children}</p>
      </div>
      <div className="flex items-center">{muestra}</div>
    </section>
  )
}

export function Landing() {
  return (
    <main className="acerado min-h-dvh bg-acero-950 px-6 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-4xl">
        <p className="font-titulo text-[0.7rem] uppercase tracking-[0.3em] text-fg-faint">Tu Parrilla</p>

        <h1 className="mt-8 max-w-[15ch] text-balance font-titulo text-[2rem] font-semibold uppercase leading-[1.05] tracking-[0.02em] sm:max-w-[20ch] sm:text-6xl">
          {/* Dos frases, dos líneas en pantalla ancha; en angosto fluyen y rompen solas. */}
          <span className="sm:block">Programa la semana.</span>{' '}
          <span className="sm:block">Mira qué trajo cada corte.</span>
        </h1>

        <p className="mt-6 max-w-[54ch] text-base leading-relaxed text-fg-muted">
          Publica en tus redes a la hora que elegiste, y te dice cuánta gente llegó a tu página
          por cada publicación. No solo cuántos la vieron.
        </p>

        <div className="mt-12">
          <Semana />
        </div>

        <div className="mt-16">
          <Rasgo
            titulo="Cada día es una parrilla"
            muestra={
              <p className="font-titulo text-sm uppercase tracking-[0.14em] text-fg-faint">
                Apagada · Prendida · <span className="text-brasa">Parrilla llena</span>
              </p>
            }
          >
            Se calienta con lo que le pongas encima. De un vistazo ves dónde te falta fuego y
            dónde ya no cabe nada, mientras eliges la hora y todavía puedes moverlo.
          </Rasgo>

          <Rasgo
            titulo="Los fierros avisan"
            muestra={
              <div className="w-full max-w-xs space-y-3">
                <span className="fierro fierro-al-rojo block" />
                <span className="fierro fierro-enfriandose block" />
                <span className="fierro fierro-frio block" />
              </div>
            }
          >
            Conectas cada cuenta una vez. Cuando un permiso está por vencer, el fierro se
            enfría y te avisa antes de que una publicación falle, no después.
          </Rasgo>

          <Rasgo
            titulo="Qué trajo cada corte"
            muestra={
              <p className="font-mono text-sm text-fg-muted">
                1.092 vistas <span className="text-fg-faint">→</span>{' '}
                <span className="text-brasa">41 visitas</span>
              </p>
            }
          >
            Un programador de posts te dice cuántos vieron. Este cruza esas vistas con las
            visitas que llegaron a tu página, y ahí se ve cuál de tus cortes trabajó.
          </Rasgo>

          <Rasgo
            titulo="Tu página"
            muestra={
              <p className="font-mono text-sm text-fg-muted">
                tu-parrilla.cl/<span className="text-fg">tu-nombre</span>
              </p>
            }
          >
            Todos tus enlaces en una dirección, con tu cara y tus colores. Es la página que
            mides, y la que pones en cada perfil. Si tienes dominio propio, va ahí.
          </Rasgo>
        </div>

        <footer className="mt-4 border-t border-acero-700 pt-8 text-sm text-fg-muted">
          <p>
            Tu Parrilla es por invitación: no hay registro abierto. Si ya te invitaron,{' '}
            <Link href="/ingresar" className="text-brasa underline-offset-4 hover:underline">
              entra con tu correo
            </Link>
            .
          </p>
          <p className="mt-6 flex gap-5 text-fg-faint">
            <Link href="/terminos" className="hover:text-fg">Términos</Link>
            <Link href="/privacidad" className="hover:text-fg">Privacidad</Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
