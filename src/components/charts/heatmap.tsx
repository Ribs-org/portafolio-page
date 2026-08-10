import type { HeatCell } from '@/lib/analytics'
import { SEQUENTIAL } from './theme'
import { Empty } from './panel'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Bucket a value onto the sequential ramp; zero always reads as the plane. */
function step(value: number, max: number): string {
  if (value === 0) return SEQUENTIAL[0]!
  const ratio = value / max
  const index = Math.min(SEQUENTIAL.length - 1, 1 + Math.floor(ratio * (SEQUENTIAL.length - 1)))
  return SEQUENTIAL[index]!
}

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(...cells.map((c) => c.visits), 0)
  if (max === 0) return <Empty>Sin visitas para dibujar el mapa.</Empty>

  const lookup = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.visits]))

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="min-w-[34rem]">
        <div className="mb-1.5 flex gap-[3px] pl-9">
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              className="flex-1 text-center font-mono text-[0.55rem] text-fg-faint"
              aria-hidden
            >
              {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>

        {DAYS.map((day, i) => (
          <div key={day} className="mb-[3px] flex items-center gap-[3px]">
            <span className="w-9 shrink-0 font-mono text-[0.6rem] text-fg-faint">{day}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = lookup.get(`${i + 1}-${hour}`) ?? 0
              return (
                <span
                  key={hour}
                  title={`${day} ${String(hour).padStart(2, '0')}:00 · ${value} visita${value === 1 ? '' : 's'}`}
                  className="h-4 flex-1 rounded-[3px] transition-transform hover:scale-125"
                  style={{ background: step(value, max) }}
                />
              )
            })}
          </div>
        ))}

        <div className="mt-3 flex items-center gap-2 pl-9">
          <span className="font-mono text-[0.6rem] text-fg-faint">0</span>
          {SEQUENTIAL.map((color) => (
            <span key={color} className="h-2.5 w-5 rounded-[2px]" style={{ background: color }} />
          ))}
          <span className="font-mono text-[0.6rem] text-fg-faint">{max}</span>
        </div>
      </div>
    </div>
  )
}
