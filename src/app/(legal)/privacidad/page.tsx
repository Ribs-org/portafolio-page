import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacidad',
  description: 'Qué datos guarda este sitio y qué no.',
}

/** The one value a fork has to change before deploying these pages. */
const CONTACTO = 'vicente.pareja.jones@gmail.com'

const ACTUALIZADO = '28 de agosto de 2026'

export default function PrivacidadPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">Privacidad</h1>
        <p className="mt-2 text-sm text-fg-muted">Actualizado el {ACTUALIZADO}.</p>
      </header>

      <p className="leading-relaxed text-fg-muted">
        Este es un sitio personal. Mide su propio tráfico para saber qué contenido funciona, y
        nada más. No usa cookies de seguimiento, no hay analítica de terceros, y no se vende ni
        se comparte ningún dato con nadie.
      </p>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          Qué se guarda de cada visita
        </h2>
        <ul className="space-y-2 leading-relaxed text-fg-muted">
          <li>
            <span className="text-fg">Un identificador derivado</span>, no tu dirección IP. Se
            calcula un hash SHA-256 sobre la IP, el user agent, una clave secreta del servidor y
            la fecha del día. La IP nunca se guarda, y como la fecha entra en el cálculo, mañana
            el mismo visitante produce un identificador distinto.
          </li>
          <li>
            <span className="text-fg">Ubicación aproximada</span>: país, región, ciudad, zona
            horaria y coordenadas a nivel de ciudad, tal como las entrega el proveedor de
            hosting a partir de la IP.
          </li>
          <li>
            <span className="text-fg">Tipo de dispositivo, sistema operativo y navegador</span>,
            derivados del user agent.
          </li>
          <li>
            <span className="text-fg">De dónde vienes</span>: la página de origen (referrer) y la
            red social deducida de ella.
          </li>
          <li>
            <span className="text-fg">Las etiquetas del enlace</span>: el parámetro{' '}
            <code className="font-mono text-[0.85em] text-fg-muted">?s=</code> y los{' '}
            <code className="font-mono text-[0.85em] text-fg-muted">utm_*</code>, si el enlace que
            seguiste los traía.
          </li>
          <li>
            <span className="text-fg">El idioma preferido</span> de tu navegador.
          </li>
          <li>
            <span className="text-fg">Qué enlaces se hacen clic</span>: cuál, en qué posición de la
            página, y cuántos milisegundos pasaron desde que cargó.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Sin cookies</h2>
        <p className="leading-relaxed text-fg-muted">
          No se instala ninguna cookie para medir tráfico. La única cookie que este sitio puede
          poner es la sesión del panel de administración, y solo aparece si el dueño inicia
          sesión.
        </p>
        <p className="leading-relaxed text-fg-muted">
          Esto tiene una consecuencia que conviene decir en voz alta: como el identificador
          cambia cada día, no es posible seguir a nadie a lo largo del tiempo. «Visitantes
          únicos» es siempre una cifra diaria. Es el precio deliberado de no usar cookies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
          Cuentas de redes sociales conectadas
        </h2>
        <p className="leading-relaxed text-fg-muted">
          El panel privado puede conectarse a las cuentas de Instagram, TikTok y YouTube{' '}
          <span className="text-fg">del propio dueño del sitio</span> para leer las métricas de
          sus publicaciones. Si eso está activo:
        </p>
        <ul className="space-y-2 leading-relaxed text-fg-muted">
          <li>
            Los tokens de acceso se guardan <span className="text-fg">cifrados</span> (AES-256-GCM).
            Hoy se usan únicamente para pedir esas métricas. La conexión con Instagram pide
            además permiso para publicar, pensando en una función futura del panel:{' '}
            <span className="text-fg">por ahora no se publica nada</span>, ni desde el panel ni
            de forma automática.
          </li>
          <li>
            Se guardan los datos públicos de esas publicaciones: identificador, enlace,
            descripción, miniatura y fecha, junto con sus contadores públicos de
            reproducciones, «me gusta», comentarios, veces compartido, guardados y alcance.
          </li>
          <li>
            <span className="text-fg">Solo de las cuentas del dueño.</span> No se leen datos de
            otras personas, ni el contenido de los comentarios, ni información de seguidores.
          </li>
        </ul>
        <p className="leading-relaxed text-fg-muted">
          Desconectar una cuenta desde el panel borra sus credenciales. El historial de métricas
          ya recogido se conserva.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Dónde vive todo</h2>
        <p className="leading-relaxed text-fg-muted">
          El sitio está alojado en Vercel y los datos en una base de datos Postgres gestionada por
          Neon. Las imágenes que el dueño sube se almacenan en Vercel Blob. Ninguno de esos
          proveedores recibe los datos para usarlos por su cuenta: los alojan.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Contacto</h2>
        <p className="leading-relaxed text-fg-muted">
          Si quieres saber qué hay asociado a ti, o pedir que se borre, escribe a{' '}
          <a
            href={`mailto:${CONTACTO}`}
            className="text-fg underline decoration-white/20 underline-offset-4 transition-colors hover:decoration-white/50"
          >
            {CONTACTO}
          </a>
          . Ten en cuenta que, por el diseño descrito arriba, lo más probable es que no exista
          forma de vincular ningún registro contigo: no se guardan identificadores estables.
        </p>
      </section>
    </article>
  )
}
