import { BedDouble, FlaskConical, Grid3x3, Hammer, Microscope, MousePointer2 } from 'lucide-react'
import { ROOM_SPECS } from '../game/config'
import type { RoomType } from '../game/types'

const ICONS: Record<RoomType | 'inspect', typeof MousePointer2> = {
  inspect: MousePointer2,
  deck: Grid3x3,
  quarters: BedDouble,
  lab: Microscope,
  combustion: FlaskConical,
  fab: Hammer,
  dock: Grid3x3,
}

const ORDER: (RoomType | 'inspect')[] = ['inspect', 'deck', 'quarters', 'lab', 'combustion', 'fab']

interface Props {
  mode: 'inspect' | RoomType
  onMode: (m: 'inspect' | RoomType) => void
}

export default function BuildPalette({ mode, onMode }: Props) {
  return (
    <div className="pointer-events-auto absolute left-2 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
      {ORDER.map((key) => {
        const Icon = ICONS[key]
        const active = mode === key
        const spec = key === 'inspect' ? null : ROOM_SPECS[key as RoomType]
        return (
          <button
            key={key}
            onClick={() => onMode(key)}
            title={
              spec
                ? `${spec.label} — ${spec.costPerTile}cr/tile · min ${spec.minW}×${spec.minH}\n${spec.desc}`
                : 'Inspect / select'
            }
            className={`group relative flex h-10 w-10 items-center justify-center rounded border backdrop-blur transition-colors ${
              active
                ? 'border-flame bg-flame/20 text-flame'
                : 'border-edge bg-panel/85 text-mist hover:border-mist hover:text-white'
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
            {spec && (
              <span className="pointer-events-none absolute left-12 z-10 hidden w-44 rounded border border-edge bg-panel p-2 text-left text-[10px] leading-snug text-mist group-hover:block">
                <span className="block text-[11px] font-semibold text-white">{spec.label}</span>
                {spec.costPerTile} cr/tile · min {spec.minW}×{spec.minH}
                <span className="mt-0.5 block">{spec.desc}</span>
              </span>
            )}
          </button>
        )
      })}
      {mode !== 'inspect' && (
        <div className="mt-1 w-10 text-center font-mono text-[9px] leading-tight text-mist">
          drag · esc/right-click cancels
        </div>
      )}
    </div>
  )
}
