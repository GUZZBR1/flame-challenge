import { useEffect, useRef, useState } from 'react'
import { emitSimulationCommands } from '../lib/simBus'
import { gsap, navigateBack } from '../lib/scroll'
import KeyedFlame from './KeyedFlame'
import { IconArrowLeft } from './Icons'
import Button from './ui/Button'
import { DEFAULT_CREW, type MissionOutcomeStatus } from './CrewTimelinePanel'

interface MissionPreset {
  id: string
  title: string
  tag: string
  accent: string
  o2Pct: number
  flowCms: number
  gravity: 'microgravity' | 'earth' | 'lunar' | 'mars'
  investigationId: string
  materialId: string
  description: string
  prompt: string
  outcomeStatus: MissionOutcomeStatus
}

const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'artemis-airlock',
    title: 'Artemis Lunar Airlock',
    tag: '34% O₂ · 0.16g · 8.2 psia',
    accent: '#ec4899',
    o2Pct: 34,
    flowCms: 1.5,
    gravity: 'lunar',
    investigationId: 'flare',
    materialId: 'pmma',
    description: 'Enriched Exploration Atmosphere in lunar habitat conduit. Severe accelerated flashover risk.',
    prompt: 'Simulate Artemis Lunar Airlock: 34% O2 with 1.5 cm/s flow under 0.16g Moon gravity.',
    outcomeStatus: 'EMERGENCY CONTAINED',
  },
  {
    id: 'cygnus-saffire',
    title: 'Cygnus SAFFIRE Burnout',
    tag: '21% O₂ · 20 cm/s · Large-Scale',
    accent: '#f97316',
    o2Pct: 21,
    flowCms: 20.0,
    gravity: 'microgravity',
    investigationId: 'saffire',
    materialId: 'cotton',
    description: 'Full-scale fabric burn in Cygnus cargo vehicle driven by forced ventilation airflow.',
    prompt: 'Simulate Cygnus SAFFIRE uncrewed burn: 21% O2 with 20 cm/s forced ventilation.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'iss-flex-cool',
    title: 'ISS MSG Silent Cool-Flame',
    tag: '21% O₂ · 0g · Heptane Droplet',
    accent: '#38bdf8',
    o2Pct: 21,
    flowCms: 0.5,
    gravity: 'microgravity',
    investigationId: 'flex-2',
    materialId: 'heptane',
    description: 'Invisible low-temperature chemical reaction continuing after apparent flameout.',
    prompt: 'Simulate ISS FLEX-2 cool flame: heptane droplet with 0.5 cm/s flow in microgravity.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
  {
    id: 'mars-transit-stagnant',
    title: 'Mars Transit Stagnant Bay',
    tag: '21% O₂ · 0g · 0 cm/s Flow',
    accent: '#a855f7',
    o2Pct: 21,
    flowCms: 0.0,
    gravity: 'microgravity',
    investigationId: 'sofie-gel',
    materialId: 'pmma',
    description: 'Stagnant unventilated module pocket. Flammable vapor buildup without buoyant dissipation.',
    prompt: 'Simulate Mars Transit module with stagnant 0 cm/s airflow in microgravity.',
    outcomeStatus: 'EMERGENCY CONTAINED',
  },
  {
    id: 'mir-1997-crisis',
    title: 'Historical Crisis: Mir 1997',
    tag: '28% O₂ · Chemical O₂ Burn',
    accent: '#ef4444',
    o2Pct: 28,
    flowCms: 8.0,
    gravity: 'microgravity',
    investigationId: 'sofie-gel',
    materialId: 'pmma',
    description: 'Solid oxygen generator (Vika) canister breach spewing blowtorch flame in microgravity.',
    prompt: 'Analyze Mir 1997 fire: 28% O2 with 8 cm/s ventilation from chemical oxygen canister breach.',
    outcomeStatus: 'EMERGENCY CONTAINED',
  },
  {
    id: 'apollo-1-crisis',
    title: 'Historical Crisis: Apollo 1',
    tag: '100% O₂ Norm · 16.7 psia',
    accent: '#b91c1c',
    o2Pct: 40,
    flowCms: 5.0,
    gravity: 'earth',
    investigationId: 'flare',
    materialId: 'pmma',
    description: 'Pure high-pressure oxygen atmosphere resulting in catastrophic rapid flashover.',
    prompt: 'Analyze Apollo 1 pure oxygen risk conditions with high oxidizer fraction.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
]

/** Crew cards tossed loosely around the page — each member lands at a
 *  different spot and tilt instead of lining up in a grid. */
const CREW_SCATTER = [
  'sm:absolute sm:left-0 sm:top-2 sm:-rotate-2',
  'sm:absolute sm:right-0 sm:top-0 sm:rotate-[1.5deg]',
  'sm:absolute sm:left-1/2 sm:top-16 sm:-translate-x-1/2 sm:rotate-1',
]

export default function SimDeck() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeMission, setActiveMission] = useState<MissionPreset>(MISSION_PRESETS[0])

  useEffect(() => {
    const root = rootRef.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(
      () => gsap.from('[data-hero]', { opacity: 0, y: 14, duration: 0.6, ease: 'power2.out', stagger: 0.07 }),
      root,
    )
    return () => ctx.revert()
  }, [])

  const loadMissionPreset = (preset: MissionPreset) => {
    setActiveMission(preset)
    const commandSet = {
      load_preset: preset.investigationId,
      set_o2_percent: preset.o2Pct,
      set_airflow_cm_s: preset.flowCms,
      __investigation: preset.investigationId,
      __run: true,
    }
    emitSimulationCommands(commandSet, 'sim-preset', preset.investigationId)
  }

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-[var(--bg)]">
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 sm:px-10 sm:pt-28 lg:px-16">
        <KeyedFlame
          className="inset-x-0 -top-8 h-[min(54vh,460px)]"
          strength={0.3}
          src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }}
        />
        <header className="relative">
          <div data-hero className="flex items-center justify-between gap-5">
            <Button variant="glass" onClick={navigateBack}>
              <IconArrowLeft size={16} /> Back
            </Button>
            <span className="hidden text-sm opacity-65 sm:inline">
              C++ physics · NASA PSI evidence · scenario copilot
            </span>
          </div>
          <h1 data-hero className="mt-9 font-[family-name:var(--font-display)] text-5xl font-bold tracking-[-0.05em] sm:text-7xl">
            Simulations
          </h1>
          <p data-hero className="mt-5 max-w-3xl text-lg leading-8 opacity-80 sm:text-xl">
            Test real-world mission atmospheres, partial-gravity regimes, and historical fire crises. The copilot
            cross-references 30 years of NASA PSI data and streams physical combustion runs in real time.
          </p>
        </header>

        {/* GUIDED MISSION PRESETS CARDS (1-CLICK EXECUTION) */}
        <section className="relative mt-10 rounded-[32px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] p-6 shadow-xl backdrop-blur-2xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge)] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                Guided Scenarios &amp; Historical Crises
              </span>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold sm:text-2xl">
                1-Click Mission Envelopes
              </h2>
            </div>
            <span className="font-mono text-xs opacity-60">Click any card to load conditions &amp; stream</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MISSION_PRESETS.map((preset) => {
              const isActive = activeMission.id === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadMissionPreset(preset)}
                  className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    isActive
                      ? 'border-[var(--accent)] bg-white/60 shadow-md dark:bg-white/[0.08]'
                      : 'border-[var(--edge)] bg-white/30 dark:bg-white/[0.03] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold" style={{ color: preset.accent }}>
                        {preset.tag}
                      </span>
                      {isActive && (
                        <span className="rounded bg-[var(--accent)]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-bold group-hover:text-[var(--accent)] transition-colors">
                      {preset.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed opacity-75">{preset.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--edge)] pt-2.5 text-xs font-mono opacity-70">
                    <span>
                      {preset.investigationId} · {preset.o2Pct}% O₂
                    </span>
                    <span className="group-hover:translate-x-0.5 transition-transform">Run ↗</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* CREW ON STATION — scattered cards instead of a roster grid */}
        <div className="relative mt-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
            Crew on station · {activeMission.title}
          </p>
          <div className="mt-4 grid gap-4 sm:relative sm:block sm:h-64">
            {DEFAULT_CREW.map((member, i) => {
              const isInjured = member.status === 'Burn Injury' || member.status === 'Fatal Casualty'
              const isWarning = member.status === 'Smoke Inhalation'
              return (
                <div
                  key={member.id}
                  className={`relative flex w-full items-center gap-3 rounded-2xl border p-3.5 shadow-lg backdrop-blur-xl transition-all sm:w-72 ${CREW_SCATTER[i] ?? ''} ${
                    isInjured
                      ? 'border-rose-500/40 bg-rose-500/10'
                      : isWarning
                      ? 'border-amber-500/40 bg-amber-500/10'
                      : 'border-[var(--edge)] bg-white/40 dark:bg-white/[0.05]'
                  }`}
                >
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-[var(--edge)] bg-black/20">
                    <img src={member.avatar} alt={member.name} className="size-full object-cover object-top" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{member.name}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          member.status === 'Safe' || member.status === 'Nominal'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isInjured
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {member.status}
                      </span>
                    </div>
                    <div className="text-xs opacity-60">{member.role}</div>
                    <div className="mt-1 line-clamp-1 text-[11px] opacity-75">{member.statusDetail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="relative mt-8 flex justify-end">
          <Button variant="glass" onClick={navigateBack}>
            Back to overview <IconArrowLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
