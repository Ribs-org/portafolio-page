import { Icon } from '@/components/icon'
import { networkLabel } from '@/lib/networks'
import { cn } from '@/lib/utils'
import { colorDeDestino, etiquetaDestino, nombreDestino } from './etiqueta'

type Destino = { network: string; handle: string | null; status: string; externalId: string | null; opciones: unknown }

const CLASE_COLOR: Record<ReturnType<typeof colorDeDestino>, string> = {
  gris: 'text-fg',
  positivo: 'text-positive',
  negativo: 'text-negative',
}

/**
 * Los logos de un corte: un icono por destino, en el orden de los destinos, teñido solo si
 * se quemó o si ya salió. Con `detalle`, cada icono lleva al lado el handle y el estado en
 * palabras (la cola); sin él, solo los iconos (la parrilla, El Fuego). Lo que decía el chip
 * de texto sigue diciéndose: en el `title` de cada icono, y en un `sr-only` — de la fila sin
 * `detalle`, o delante de cada icono con `detalle`, porque ahí el texto visible ya dice el
 * handle y el estado y solo falta la red; un `sr-only` de fila repetiría los dos.
 */
export function Redes({ targets, detalle = false }: { targets: Destino[]; detalle?: boolean }) {
  // En modo detalle el texto va al color pleno y solo el icono lleva el tinte: el fondo del
  // chip ya dice el estado, y un handle de 12 px en rojo sobre ese fondo se quedaba en 4.28:1
  // (medido), bajo el 4.5:1 de texto; el «· Falló» atenuado, en 2.75:1.
  if (targets.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {targets.map((t, i) => {
        const color = colorDeDestino(t.status)
        const texto = `${nombreDestino(t)}: ${etiquetaDestino(t)}`
        return (
          <span
            key={`${t.network}-${t.handle ?? ''}-${i}`}
            title={texto}
            className={cn('inline-flex items-center gap-1', CLASE_COLOR[color])}
          >
            <Icon name={t.network} className="h-3.5 w-3.5 shrink-0" />
            {detalle ? (
              <span className="text-xs text-fg">
                <span className="sr-only">{networkLabel(t.network)} · </span>
                {t.handle ?? nombreDestino(t)}
                <span> · {etiquetaDestino(t)}</span>
              </span>
            ) : null}
          </span>
        )
      })}
      {!detalle ? (
        <span className="sr-only">{targets.map((t) => `${nombreDestino(t)}: ${etiquetaDestino(t)}`).join(', ')}</span>
      ) : null}
    </span>
  )
}
