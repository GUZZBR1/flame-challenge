import { useState, useMemo } from 'react'
import { emitSimulationCommands } from '../lib/simBus'
import { navigate } from '../lib/scroll'
import { IconArrowUpRight } from './Icons'
import { cn } from '../lib/cn'

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

const CATEGORIES = [
  { key: 'contained', label: 'Contained', cell: 'bg-emerald-500/80 border-emerald-700 dark:bg-emerald-500/45 dark:border-emerald-500/60', dot: 'bg-emerald-500' },
  { key: 'cool-flame', label: 'Cool-flame stealth', cell: 'bg-amber-500/80 border-amber-700 dark:bg-amber-500/55 dark:border-amber-500/70', dot: 'bg-amber-500' },
  { key: 'crew-endangered', label: 'Crew endangered', cell: 'bg-orange-500/80 border-orange-700 dark:bg-orange-500/60 dark:border-orange-500/75', dot: 'bg-orange-500' },
  { key: 'mission-aborted', label: 'Mission aborted', cell: 'bg-rose-600/80 border-rose-800 dark:bg-rose-600/65 dark:border-rose-600/80', dot: 'bg-rose-600' },
] as const

const INVESTIGATION_ROWS = ['FLEX-2', 'SAFFIRE-IV', 'SAME-R', 'BASS-II', 'ACME', 'SoFIE'] as const

const INV_PRESET: Record<string, string> = {
  'FLEX-2': 'flex-2',
  'SAFFIRE-IV': 'saffire',
  'SAME-R': 'same',
  'BASS-II': 'bass-ii',
  ACME: 'acme',
  SoFIE: 'sofie-gel',
}

export interface MatrixFocus {
  label: string
  test: (run: WaffleRun) => boolean
}

const ROWS = INVESTIGATION_ROWS.map((inv) => ({ inv, runs: ALL_RUNS.filter((r) => r.investigation === inv) }))
const COLS = Math.max(...ROWS.map((r) => r.runs.length))

/** The run matrix, drawn like a contribution graph: one row per
 *  investigation, one square per run, colour = outcome. Filters dim
 *  rather than remove cells so the distribution stays legible. */
export default function MissionWaffleMatrix({
  focus,
  onClearFocus,
}: {
  focus?: MatrixFocus | null
  onClearFocus?: () => void
}) {
  const [filter, setFilter] = useState<string[]>([])
  const [inv, setInv] = useState<string[]>([])
  const [selectedRun, setSelectedRun] = useState<WaffleRun | null>(ALL_RUNS[4])
  const [hover, setHover] = useState<WaffleRun | null>(null)

  const matches = (r: WaffleRun) =>
    (!filter.length || filter.includes(r.category)) &&
    (!inv.length || inv.includes(r.investigation)) &&
    (!focus || focus.test(r))
  const shown = useMemo(() => ALL_RUNS.filter(matches).length, [filter, inv, focus])

  const handleSimulate = (run: WaffleRun) => {
    const presetId = INV_PRESET[run.investigation] ?? 'flex-2'
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

  const counts = useMemo(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.key, ALL_RUNS.filter((r) => r.category === c.key).length])) as Record<string, number>,
    [],
  )
  const probe = hover ?? selectedRun
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k])
  const toggleCat = (k: string) => setFilter((f) => toggle(f, k))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter.includes(c.key)}
            onClick={() => toggleCat(c.key)}
            className={cn(
              'flex items-center gap-2 border-b-2 border-transparent pb-1 font-mono text-tiny uppercase tracking-label transition',
              filter.includes(c.key) ? 'border-[#1e3fae] text-[color-mix(in_srgb,var(--accent)_55%,var(--ink))] dark:text-accent' : 'opacity-85 dark:opacity-65 hover:opacity-100',
            )}
          >
            <span className={cn('size-3 rounded-[3px]', c.dot)} />
            {c.label}
            <span className="tabular-nums opacity-75 dark:opacity-60">{counts[c.key]}</span>
          </button>
        ))}
        <span className="ml-auto font-mono text-micro lowercase tracking-card opacity-75 dark:opacity-60">
          {shown} of {ALL_RUNS.length} runs lit
        </span>
      </div>

      {focus && (
        <div className="mt-5 flex flex-wrap items-center gap-4 border-l-2 border-[#e5202e] pl-4 font-mono text-tiny">
          <span className="font-semibold">Tracing finding: {focus.label}</span>
          <button type="button" onClick={onClearFocus} className="underline underline-offset-4 opacity-85 dark:opacity-70 hover:text-accent hover:opacity-100">
            clear
          </button>
        </div>
      )}

      <div className="mt-10 grid gap-x-[clamp(3rem,6vw,8rem)] gap-y-14 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="-m-2 overflow-x-auto p-2">
            <div className="w-max" onMouseLeave={() => setHover(null)}>
              {ROWS.map(({ inv: name, runs }) => (
                <div key={name} className="mb-1 grid grid-cols-[5.5rem_auto] items-center gap-3">
                  <button
                    type="button"
                    aria-pressed={inv.includes(name)}
                    onClick={() => setInv((v) => toggle(v, name))}
                    className={cn(
                      'text-left font-mono text-tiny uppercase tracking-label transition',
                      inv.includes(name) ? 'text-[color-mix(in_srgb,var(--accent)_55%,var(--ink))] dark:text-accent' : 'opacity-75 dark:opacity-60 hover:opacity-100',
                    )}
                  >
                    {name}
                  </button>
                  <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1.375rem)` }}>
                    {runs.map((run) => {
                      const cat = CATEGORIES.find((c) => c.key === run.category)!
                      const on = matches(run)
                      const isSelected = selectedRun?.id === run.id
                      return (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => setSelectedRun(run)}
                          onMouseEnter={() => setHover(run)}
                          onFocus={() => setHover(run)}
                          onBlur={() => setHover(null)}
                          aria-label={`${run.code}, ${cat.label}`}
                          aria-pressed={isSelected}
                          className={cn(
                            'size-[1.375rem] rounded-[3px] border transition-all duration-200',
                            cat.cell,
                            on ? 'hover:z-10 hover:scale-110' : 'opacity-[0.1]',
                            isSelected && 'z-10 scale-110 ring-2 ring-accent ring-offset-1 ring-offset-bg',
                          )}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-ink/30 dark:border-edge pt-4 font-mono text-micro lowercase tracking-label">
            <span className="opacity-85 dark:opacity-70">{probe ? `${probe.code} · ${probe.fuel}` : 'hover a square'}</span>
            <span className="tabular-nums opacity-85 dark:opacity-70">
              {probe ? `${probe.o2Pct}% o₂ · ${probe.flowCms} cm/s · risk ${probe.riskIndex}%` : ''}
            </span>
          </div>
          <p className="mt-3 text-micro opacity-70 dark:opacity-55">Illustrative 100-run sample.</p>
        </div>

        <aside className="min-w-0">
          {selectedRun ? (
            <div className="lg:sticky lg:top-8">
              <span className="font-mono text-tiny uppercase tracking-label text-[#e5202e]">{selectedRun.code}</span>
              <h4 className="m-0 mt-2 font-display text-[clamp(1.3rem,1.8vw,1.6rem)] font-bold leading-display tracking-tight">
                {selectedRun.investigation}
                <span className="opacity-50"> · {selectedRun.fuel}</span>
              </h4>
              <span
                className={cn(
                  'mt-3 inline-block font-mono text-micro font-bold uppercase tracking-card',
                  selectedRun.missionStatus === 'COMPLETED'
                    ? 'text-emerald-700 dark:text-emerald-500'
                    : selectedRun.missionStatus === 'EMERGENCY CONTAINED'
                      ? 'text-amber-700 dark:text-amber-500'
                      : 'text-rose-700 dark:text-rose-500',
                )}
              >
                {selectedRun.missionStatus}
              </span>
              <dl className="m-0 mt-6 divide-y divide-ink/25 dark:divide-edge border-y border-ink/30 dark:border-edge font-mono text-tiny">
                {[
                  ['Atmosphere', `${selectedRun.o2Pct}% O₂ · ${selectedRun.flowCms} cm/s · ${selectedRun.gravity}`],
                  ['Composite risk', `${selectedRun.riskIndex}%`],
                  ['Crew state', selectedRun.crewState],
                  ['Primary actor', selectedRun.crewRole],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 py-2.5">
                    <dt className="opacity-70 dark:opacity-55">{k}</dt>
                    <dd className="m-0 text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="m-0 mt-6 text-caption italic leading-[1.7] opacity-90 dark:opacity-80">&ldquo;{selectedRun.humanError}&rdquo;</p>
              <button
                type="button"
                onClick={() => handleSimulate(selectedRun)}
                className="mt-8 inline-flex origin-center items-center gap-3 rounded-[6px] bg-[#1e3fae] px-6 py-3.5 font-mono text-caption font-semibold text-white transition-[transform,background-color] duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)] will-change-transform hover:scale-[1.03] hover:bg-[#2a52d4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transform-none"
              >
                Simulate in Live Chamber <IconArrowUpRight size={14} />
              </button>
            </div>
          ) : (
            <p className="text-tiny opacity-75 dark:opacity-60">Select any square to inspect the mission and human error details.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
