import { AlertTriangle, FlaskConical, ShieldCheck, Siren, X } from 'lucide-react'
import type { Engine } from '../game/engine'
import { SCENARIOS } from '../game/scenarios'
import { TECH } from '../game/tech'
import { useGameVersion } from '../state/store'

interface Props {
  engine: Engine
  onClose: () => void
  onTriggerScenario: (id: string) => boolean
}

/**
 * Mission Control — replay documented NASA fire incidents (Apollo 1,
 * Apollo 13, Mir 1997) and spend science on NASA spin-off upgrades.
 */
export default function MissionModal({ engine, onClose, onTriggerScenario }: Props) {
  useGameVersion()
  const st = engine.state

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Siren className="h-4 w-4 text-ember" />
            <span className="text-sm font-bold tracking-wide text-white">MISSION CONTROL</span>
            <span className="font-mono text-[10px] text-mist">NASA incident replays & spin-off tech</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-mist hover:bg-edge hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* historical scenarios */}
          <div className="overflow-y-auto border-r border-edge p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mist">
              Incident replays — documented cases
            </p>
            <div className="space-y-2">
              {SCENARIOS.map((s) => (
                <div key={s.id} className="rounded border border-edge bg-panel2 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-white">{s.name}</span>
                    <span className="font-mono text-[10px] text-ember">{s.year}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-mist">{s.moduleHint}</p>
                  <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-mist">{s.description}</p>
                  <div className="mt-1.5 flex items-start gap-1 text-[9px] text-ice">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="leading-snug">{s.lesson}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (onTriggerScenario(s.id)) onClose()
                    }}
                    className="mt-2 w-full rounded bg-ember/90 py-1 text-[11px] font-bold text-white hover:bg-ember"
                  >
                    Trigger in yard
                  </button>
                  <p className="mt-1 font-mono text-[8px] text-mist/70">{s.citation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* spin-off tech tree */}
          <div className="overflow-y-auto p-3">
            <p className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-mist">
              Spin-off containment tech
              <span className="font-mono normal-case text-ice">
                <FlaskConical className="mr-0.5 inline h-3 w-3" />
                {st.science} sci
              </span>
            </p>
            <div className="space-y-2">
              {TECH.map((t) => {
                const owned = st.tech.includes(t.id)
                const afford = st.science >= t.cost
                return (
                  <div key={t.id} className={`rounded border p-2.5 ${owned ? 'border-ice/40 bg-panel2' : 'border-edge bg-panel2'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-white">{t.name}</span>
                      {owned ? (
                        <ShieldCheck className="h-4 w-4 text-ice" />
                      ) : (
                        <span className="font-mono text-[10px] text-ice">{t.cost} sci</span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-mist">{t.source}</p>
                    <p className="mt-1 text-[10px] leading-snug text-mist">{t.blurb}</p>
                    {!owned && (
                      <button
                        disabled={!afford}
                        onClick={() => engine.buyTech(t.id)}
                        className="mt-2 w-full rounded bg-ice/90 py-1 text-[11px] font-bold text-void hover:bg-ice disabled:opacity-40"
                      >
                        Research — {t.cost} science
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[9px] leading-snug text-mist/70">
              Effects stack into the same deterministic sim: detectors lower the hidden-flame
              reveal threshold, air tanks multiply extinguishing rate, fire attire cuts crew
              burn damage.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
