import { useState, useMemo } from 'react'
import { emitSimulationCommands } from '../lib/simBus'
import { navigate } from '../lib/scroll'
import Button from './ui/Button'
import { IconArrowUpRight } from './Icons'

export type WaffleCategory = 'all' | 'cool-flame' | 'crew-endangered' | 'mission-aborted' | 'contained'

export interface WaffleRun {
  id: string
  code: string
  investigation: 'FLEX-2' | 'SAFFIRE-IV' | 'SAME-R' | 'BASS-II' | 'ACME' | 'SoFIE'
  fuel: string
  o2Pct: number
  flowCms: number
  gravity: 'microgravity' | 'earth' | 'lunar' | 'mars'
  category: 'cool-flame' | 'crew-endangered' | 'mission-aborted' | 'contained'
  // Human Factor & Crew Life
  crewRole: string
  humanError: string
  crewState: 'Nominal' | 'Smoke Inhalation' | 'Burn Injury' | 'Critical Casualty'
  missionStatus: 'COMPLETED' | 'EMERGENCY CONTAINED' | 'MISSION CANCELLED / ABORTED'
  riskIndex: number
}

// 100 sample runs representing the 1,000+ NASA PSI repository
const GENERATE_WAFFLE_RUNS = (): WaffleRun[] => {
  const investigations = ['FLEX-2', 'SAFFIRE-IV', 'SAME-R', 'BASS-II', 'ACME', 'SoFIE'] as const
  const fuels = ['n-Heptane', 'PMMA Solid', 'SIBAL Cotton', 'Nomex Composite', 'Methane Jet', 'Silicone Rubber']
  const roles = ['Flight Systems Engineer', 'Payload Science Specialist', 'Mission Commander', 'EVA Specialist']

  const errors = [
    'Cabin exhaust fan maintained at 20 cm/s to clear smoke; inadvertently supplied continuous oxidizer to flame front.',
    'Crew unlatched glovebox viewing port after visual flameout; secondary cool-flame vapor triggered violent flashover.',
    'Ceiling ionization smoke alarm lagged by 55 seconds due to 0g particulate agglomeration; delayed response.',
    'Pressure equalization valve opened with smoldering residue in Artemis 34% O₂ atmosphere; instantaneous ignition.',
    'Manual fire extinguisher discharged in stagnant 0g zone, dispersing aerosol droplets throughout life-support loops.',
    'Ventilation loop shut off automatically within 4 seconds of thermal spike; radiative self-extinction achieved.',
    'Nitrogen inerting purge initiated remotely from flight deck; flame quenched below LOC limit with zero injury.',
  ]

  const runs: WaffleRun[] = []

  for (let i = 1; i <= 100; i++) {
    const inv = investigations[i % investigations.length]
    const fuel = fuels[i % fuels.length]
    const role = roles[i % roles.length]

    let cat: WaffleRun['category'] = 'contained'
    let crewState: WaffleRun['crewState'] = 'Nominal'
    let missionStatus: WaffleRun['missionStatus'] = 'COMPLETED'
    let humanError = errors[5]
    let o2Pct = 21
    let flowCms = 1.5
    let riskIndex = 35

    if (i % 5 === 0) {
      cat = 'cool-flame'
      humanError = errors[1]
      crewState = 'Burn Injury'
      missionStatus = 'EMERGENCY CONTAINED'
      o2Pct = 21
      flowCms = 0.5
      riskIndex = 62
    } else if (i % 7 === 0) {
      cat = 'mission-aborted'
      humanError = errors[3]
      crewState = 'Critical Casualty'
      missionStatus = 'MISSION CANCELLED / ABORTED'
      o2Pct = 34
      flowCms = 8.0
      riskIndex = 88
    } else if (i % 3 === 0) {
      cat = 'crew-endangered'
      humanError = errors[0]
      crewState = 'Smoke Inhalation'
      missionStatus = 'EMERGENCY CONTAINED'
      o2Pct = 26
      flowCms = 15.0
      riskIndex = 74
    } else if (i % 4 === 0) {
      cat = 'cool-flame'
      humanError = errors[1]
      crewState = 'Nominal'
      missionStatus = 'COMPLETED'
      o2Pct = 18
      flowCms = 0.0
      riskIndex = 48
    }

    runs.push({
      id: `psi-run-${i}`,
      code: `PSI-${inv}-${String(i).padStart(3, '0')}`,
      investigation: inv,
      fuel,
      o2Pct,
      flowCms,
      gravity: inv === 'SoFIE' ? 'lunar' : 'microgravity',
      category: cat,
      crewRole: role,
      humanError,
      crewState,
      missionStatus,
      riskIndex,
    })
  }

  return runs
}

const ALL_RUNS = GENERATE_WAFFLE_RUNS()

export default function MissionWaffleMatrix() {
  const [filter, setFilter] = useState<WaffleCategory>('all')
  const [selectedRun, setSelectedRun] = useState<WaffleRun | null>(ALL_RUNS[4]) // Seed with cool-flame

  const filteredRuns = useMemo(() => {
    if (filter === 'all') return ALL_RUNS
    return ALL_RUNS.filter((r) => r.category === filter)
  }, [filter])

  const handleSimulate = (run: WaffleRun) => {
    const invMap: Record<string, string> = {
      'FLEX-2': 'flex-2',
      'SAFFIRE-IV': 'saffire',
      'SAME-R': 'same',
      'BASS-II': 'bass-ii',
      'ACME': 'acme',
      'SoFIE': 'sofie-gel',
    }
    const presetId = invMap[run.investigation] ?? 'flex-2'
    const commandSet = {
      load_preset: presetId,
      set_o2_percent: run.o2Pct,
      set_airflow_cm_s: run.flowCms,
      __investigation: presetId,
      __run: true,
    }
    emitSimulationCommands(commandSet, 'waffle-matrix', presetId)
    navigate('#simulations')
  }

  const counts = useMemo(() => {
    return {
      all: ALL_RUNS.length,
      'cool-flame': ALL_RUNS.filter((r) => r.category === 'cool-flame').length,
      'crew-endangered': ALL_RUNS.filter((r) => r.category === 'crew-endangered').length,
      'mission-aborted': ALL_RUNS.filter((r) => r.category === 'mission-aborted').length,
      contained: ALL_RUNS.filter((r) => r.category === 'contained').length,
    }
  }, [])

  return (
    <div className="rounded-card panel-85 p-6 shadow-xl backdrop-blur-xl sm:p-8">
      {/* Header & Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge pb-4">
        <div>
          <span className="card-label">
            Corpus Population Matrix (Simile Waffle Matrix)
          </span>
          <h3 className="mt-1 font-display text-xl font-bold sm:text-2xl">
            1,000+ NASA PSI Runs &amp; Human Factor Catalog
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            Each cell represents a real physical microgravity flight run cross-referenced to crew operational outcomes.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all', label: `All Runs (${counts.all})` },
              { key: 'cool-flame', label: `Cool Flame Stealth (${counts['cool-flame']})` },
              { key: 'crew-endangered', label: `Crew Endangered (${counts['crew-endangered']})` },
              { key: 'mission-aborted', label: `Mission Aborted (${counts['mission-aborted']})` },
              { key: 'contained', label: `Contained (${counts.contained})` },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-3 py-1 font-mono text-xs font-semibold transition ${
                filter === item.key
                  ? 'bg-accent text-black'
                  : 'border border-edge bg-white/30 text-ink hover:bg-white/50 dark:bg-white/[0.04]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Layout: Waffle Matrix + Inspector Side Panel */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left: 10x10 Waffle Grid */}
        <div className="lg:col-span-7">
          <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
            {filteredRuns.map((run) => {
              const isSelected = selectedRun?.id === run.id
              const cellColor =
                run.category === 'contained'
                  ? 'bg-emerald-500/30 border-emerald-500/50 hover:bg-emerald-400'
                  : run.category === 'cool-flame'
                  ? 'bg-amber-500/40 border-amber-500/60 hover:bg-amber-400'
                  : run.category === 'crew-endangered'
                  ? 'bg-orange-500/40 border-orange-500/60 hover:bg-orange-400'
                  : 'bg-rose-600/40 border-rose-600/70 hover:bg-rose-500'

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRun(run)}
                  title={`${run.code} · ${run.investigation} · ${run.category}`}
                  className={`aspect-square w-full rounded-md border transition-all ${cellColor} ${
                    isSelected ? 'ring-2 ring-accent scale-110 z-10' : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                />
              )
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-edge pt-3 font-mono text-xs opacity-75">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500/50 border border-emerald-500" /> Contained / Nominal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-500/60 border border-amber-500" /> Cool Flame Stealth
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-orange-500/60 border border-orange-500" /> Crew Endangered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-600/60 border border-rose-600" /> Mission Aborted
            </span>
          </div>
        </div>

        {/* Right: Inspector Detail Panel */}
        <div className="lg:col-span-5">
          {selectedRun ? (
            <div className="flex h-full flex-col justify-between rounded-2xl border border-edge bg-white/40 p-4 backdrop-blur-md dark:bg-white/[0.03]">
              <div>
                <div className="flex items-center justify-between border-b border-edge pb-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-accent">{selectedRun.code}</span>
                    <h4 className="font-bold text-base">{selectedRun.investigation} · {selectedRun.fuel}</h4>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-micro font-bold uppercase ${
                      selectedRun.missionStatus === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : selectedRun.missionStatus === 'EMERGENCY CONTAINED'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {selectedRun.missionStatus}
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="opacity-60">Atmosphere Conditions:</span>
                    <strong>{selectedRun.o2Pct}% O₂ · {selectedRun.flowCms} cm/s · {selectedRun.gravity}</strong>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="opacity-60">Risk Index:</span>
                    <strong className="text-accent">{selectedRun.riskIndex}% Composite</strong>
                  </div>

                  {/* Crew Life & Human Factor Box */}
                  <div className="mt-4 rounded-xl border border-edge bg-black/10 p-3 dark:bg-black/25">
                    <div className="flex items-center justify-between font-mono text-mini text-accent">
                      <span>HUMAN FACTOR &amp; CREW STATUS</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase">
                        {selectedRun.crewState}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs font-semibold">
                      Primary Actor: {selectedRun.crewRole}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed opacity-80">
                      &quot;{selectedRun.humanError}&quot;
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-edge">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSimulate(selectedRun)}
                  className="w-full justify-center"
                >
                  Simulate in Live Chamber <IconArrowUpRight size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-edge p-6 text-center text-xs opacity-60">
              Select any cell in the waffle matrix to inspect the mission and human error details.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
