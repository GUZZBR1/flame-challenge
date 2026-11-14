import { ShieldCheck, ShieldAlert, Wrench } from 'lucide-react'
import type { Engine } from '../game/engine'
import { playbookFor } from '../game/playbook'
import { useGameVersion } from '../state/store'

interface Props {
  engine: Engine
  onOpenMission: () => void
}

/**
 * Pillar 3 — tactical interpretation. Appears the moment combustion starts:
 * three lines on the physics regime driving the incident plus the NASA
 * spin-off tech that mitigates it.
 */
export default function PlaybookPanel({ engine, onOpenMission }: Props) {
  useGameVersion()
  const card = playbookFor(engine.state)
  if (!card) return null
  const danger = card.severity === 'danger'

  return (
    <div
      className={`pointer-events-auto w-80 rounded border backdrop-blur ${
        danger ? 'border-red-500/50 bg-red-950/70' : 'border-ember/50 bg-panel/90'
      }`}
    >
      <div
        className={`flex items-center gap-1.5 border-b px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
          danger ? 'border-red-500/30 text-red-300' : 'border-edge text-ember'
        }`}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        {card.title}
      </div>
      <div className="space-y-1 px-2.5 py-2">
        {card.lines.map((l, i) => (
          <p key={i} className="text-[10.5px] leading-snug text-white/85">
            {l}
          </p>
        ))}
        {card.mitigations.length > 0 && (
          <div className="pt-1">
            <div className="text-[8.5px] font-semibold uppercase tracking-widest text-mist">
              SI insights — containment tech
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {card.mitigations.map((m) => (
                <button
                  key={m.id}
                  onClick={onOpenMission}
                  title={`${m.source}${m.owned ? ' — fielded' : ' — open Mission to research'}`}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    m.owned
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'border border-edge text-mist hover:border-ice hover:text-ice'
                  }`}
                >
                  {m.owned ? <ShieldCheck className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="pt-0.5 font-mono text-[8.5px] italic text-mist/80">ref: {card.ref}</p>
      </div>
    </div>
  )
}
