import { FlaskConical, Flame, Hammer, Rocket, Satellite } from 'lucide-react'
import type { Engine } from '../game/engine'
import { useGameVersion } from '../state/store'

export function IntroOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-void/80 backdrop-blur-sm">
      <div className="w-[620px] max-w-[92vw] rounded-lg border border-edge bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <Rocket className="h-6 w-6 text-flame" />
          <h1 className="text-xl font-bold tracking-widest text-white">FREEFALL FOUNDRY</h1>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-white/85">
          You run an orbital shipyard. Scientists and engineers build modules, run microgravity
          combustion experiments, and fabricate sections of the SSV — while every ignition risk is
          computed from real NASA Physical Sciences Informatics investigations.
        </p>
        <ul className="mt-4 space-y-2 text-[12px] text-mist">
          <li className="flex gap-2">
            <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
            <span>
              <b className="text-white">Build</b> — drag modules adjacent to existing structure.
              Engineers construct and repair them.
            </span>
          </li>
          <li className="flex gap-2">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-ice" />
            <span>
              <b className="text-white">Experiment</b> — click a Combustion Chamber, pick a real PSI
              investigation and dial the O₂ level. Higher O₂ → more science, more ignition risk.
            </span>
          </li>
          <li className="flex gap-2">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>
              <b className="text-white">Incidents</b> — failed runs ignite fires that spread at the
              investigation&apos;s real flame-spread rate. Cool flames burn invisibly; smolder
              re-ignites. Engineers fight them automatically.
            </span>
          </li>
          <li className="flex gap-2">
            <Satellite className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              <b className="text-white">Win</b> — reach 100% hull completion. Lose — safety hits 0%
              or the crew dies.
            </span>
          </li>
        </ul>
        <p className="mt-4 font-mono text-[10px] text-mist">
          drag to pan · wheel to zoom · space = pause · 1/2/3 = speed · esc/right-click cancels build
        </p>
        <button
          onClick={onStart}
          className="mt-5 w-full rounded bg-flame py-2.5 text-sm font-bold tracking-wide text-white hover:bg-flame/85"
        >
          INITIALIZE YARD
        </button>
        <p className="mt-2 text-center text-[9px] text-mist">
          NASA Space Apps Challenge 2026 · Flame in Freefall · data: psi.nasa.gov/physci/repo
        </p>
      </div>
    </div>
  )
}

export function GameOverOverlay({ engine }: { engine: Engine }) {
  useGameVersion()
  const st = engine.state
  if (!st.gameOver) return null
  const won = st.gameOver === 'won'
  const alive = st.crew.filter((c) => c.state !== 'dead').length
  const dead = st.crew.length - alive
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-void/80 backdrop-blur-sm">
      <div className="w-[460px] max-w-[92vw] rounded-lg border border-edge bg-panel p-6 text-center shadow-2xl">
        <h2 className={`text-2xl font-bold tracking-widest ${won ? 'text-emerald-400' : 'text-red-400'}`}>
          {won ? 'SSV LAUNCHED' : 'PROGRAM TERMINATED'}
        </h2>
        <p className="mt-2 text-[12px] text-mist">
          {won
            ? 'The yard delivered. Every experiment that built her is a real NASA PSI record.'
            : st.safety <= 0
              ? 'The safety review board pulled the plug after too many incidents.'
              : 'All hands lost. The foundry drifts silent.'}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div className="rounded border border-edge bg-panel2 p-2">
            <div className="text-[9px] uppercase text-mist">science</div>
            <div className="text-lg text-ice">{Math.floor(st.science)}</div>
          </div>
          <div className="rounded border border-edge bg-panel2 p-2">
            <div className="text-[9px] uppercase text-mist">safety</div>
            <div className="text-lg text-ember">{Math.round(st.safety)}%</div>
          </div>
          <div className="rounded border border-edge bg-panel2 p-2">
            <div className="text-[9px] uppercase text-mist">crew lost</div>
            <div className="text-lg text-red-400">{dead}</div>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 w-full rounded bg-flame py-2.5 text-sm font-bold text-white hover:bg-flame/85"
        >
          RESTART YARD
        </button>
      </div>
    </div>
  )
}
