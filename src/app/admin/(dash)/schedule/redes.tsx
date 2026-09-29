import { Icon } from '@/components/icon'
import { NEGATIVE, POSITIVE } from '@/components/charts/theme'
import { cn } from '@/lib/utils'
import { colorDeDestino, etiquetaDestino, nombreDestino } from './etiqueta'

type Destino = { network: string; handle: string | null; status: string; externalId: string | null; opciones: unknown }

/**
 * Los logos de un corte: un icono por destino, en el orden de los destinos, teñido solo si
 * se quemó o si ya salió. Con `detalle`, cada icono lleva al lado el handle y el estado en
 * palabras (la cola); sin él, solo los iconos (la parrilla, El Fuego). Lo que decía el chip
 * de texto sigue diciéndose: en el `title` de cada icono y en un `sr-only` de la fila, para
 * que el lector de pantalla no pierda nada por haber ganado el logo.
 */
export function Redes({ targets, detalle = false }: { targets: Destino[]; detalle?: boolean }) {
  if (targets.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {targets.map((t, i) => {
        const color = colorDeDestino(t.status)
        const texto = `${nombreDestino(t)}: ${etiquetaDestino(t)}`
        return (
          <span
            key={`${t.network}-${t.handle ?? ''}-${i}`}
            title={texto}
            className={cn('inline-flex items-center gap-1', color === 'gris' && 'text-fg-muted')}
            style={color === 'negativo' ? { color: NEGATIVE } : color === 'positivo' ? { color: POSITIVE } : undefined}
          >
            <Icon name={t.network} className="h-3.5 w-3.5 shrink-0" />
            {detalle ? (
              <span className="text-xs">
                {t.handle ?? nombreDestino(t)}
                <span className="text-fg-faint"> · {etiquetaDestino(t)}</span>
              </span>
            ) : null}
          </span>
        )
      })}
      <span className="sr-only">{targets.map((t) => `${nombreDestino(t)}: ${etiquetaDestino(t)}`).join(', ')}</span>
    </span>
  )
}
