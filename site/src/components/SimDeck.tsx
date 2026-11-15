import { useEffect, useRef, useState } from 'react'
import { gsap, navigateBack } from '../lib/scroll'
import { emitUiCommand } from '../lib/simBus'
import KeyedFlame from './KeyedFlame'
import { IconArrowLeft } from './Icons'
import Button from './ui/Button'
import type { MissionOutcomeStatus } from './CrewTimelinePanel'

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
  {
    id: 'apollo-13-crisis',
    title: 'Historical Crisis: Apollo 13',
    tag: '100% O₂ Cryo · ~900 psia',
    accent: '#c2410c',
    o2Pct: 21,
    flowCms: 5.0,
    gravity: 'microgravity',
    investigationId: 'same',
    materialId: 'teflon',
    description: 'Damaged Teflon wire insulation ignited inside a stirred liquid-oxygen tank; the rupture cascaded into the adjacent tank and crippled life support.',
    prompt: 'Analyze Apollo 13 cryo oxygen tank rupture — electrical ignition inside a pressurized oxidizer propagating to adjacent modules.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
  {
    id: 'mir-1997-crisis',
    title: 'Historical Crisis: Mir 1997',
    tag: 'Self-Oxidizing · ~14 min burn',
    accent: '#a16207',
    o2Pct: 21,
    flowCms: 5.0,
    gravity: 'microgravity',
    investigationId: 'sofie-gel',
    materialId: 'pmma',
    description: 'A lithium-perchlorate oxygen generator ruptured and burned for ~14 minutes — a self-oxidizing fire that ventilation cuts could not starve.',
    prompt: 'Analyze the Mir Vika oxygen-generator fire — self-oxidizing chemical burn that defeats ventilation-cut suppression.',
    outcomeStatus: 'EMERGENCY CONTAINED',
  },
  {
    id: 'saffire-scenario',
    title: 'Guided Scenario: SAFFIRE',
    tag: '21.8% O₂ · 10.2 psia',
    accent: '#be123c',
    o2Pct: 21.8,
    flowCms: 25.0,
    gravity: 'microgravity',
    investigationId: 'saffire',
    materialId: 'cotton',
    description: 'Largest deliberate fires ever set in an uncrewed cargo vehicle — meter-scale flame spread after Cygnus departure.',
    prompt: 'Analyze SAFFIRE meter-scale flame spread over cotton-fabric samples in a ventilated uncrewed vehicle.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'flex-2-scenario',
    title: 'Guided Scenario: FLEX-2',
    tag: '12–34% O₂ · Cool Flame',
    accent: '#0369a1',
    o2Pct: 21,
    flowCms: 0.5,
    gravity: 'microgravity',
    investigationId: 'flex-2',
    materialId: 'heptane',
    description: 'Droplet combustion that exposed sustained invisible cool-flame chemistry at ~600 K after visible hot-flame extinction.',
    prompt: 'Analyze FLEX-2 droplet cool-flame persistence and the post-extinction detection gap.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'sofie-gel-scenario',
    title: 'Guided Scenario: SoFIE-GEL',
    tag: '15–24% O₂ · Quiescent',
    accent: '#047857',
    o2Pct: 17,
    flowCms: 2.0,
    gravity: 'microgravity',
    investigationId: 'sofie-gel',
    materialId: 'pmma',
    description: 'PMMA flame spread sustained at ~15% O₂ in quiescent microgravity — below Earth extinction limits.',
    prompt: 'Analyze SoFIE-GEL low-oxygen flame persistence below Earth flammability limits.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'bass-ii-scenario',
    title: 'Guided Scenario: BASS-II',
    tag: '17–40% O₂ · Opposed Flow',
    accent: '#0f766e',
    o2Pct: 21,
    flowCms: 10.0,
    gravity: 'microgravity',
    investigationId: 'bass-ii',
    materialId: 'pmma-sphere',
    description: 'Opposed-flow flame spread and extinction over solid samples across a wide oxygen and flow envelope.',
    prompt: 'Analyze BASS-II opposed-flow flame spread and extinction boundaries over solid samples.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'acme-scenario',
    title: 'Guided Scenario: ACME',
    tag: '12–85% O₂ · Coflow Jet',
    accent: '#7c3aed',
    o2Pct: 40,
    flowCms: 20.0,
    gravity: 'microgravity',
    investigationId: 'acme',
    materialId: 'ethylene',
    description: 'Laminar coflow diffusion flames mapping soot inception and growth without buoyancy distortion.',
    prompt: 'Analyze ACME ethylene coflow soot inception under elevated oxygen and E-field control.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'same-scenario',
    title: 'Guided Scenario: SAME',
    tag: '21% O₂ · Smoke Aerosol',
    accent: '#475569',
    o2Pct: 21,
    flowCms: 5.0,
    gravity: 'microgravity',
    investigationId: 'same',
    materialId: 'teflon',
    description: 'Smoke particle sizing from overheated and ignited spacecraft materials — the detector-gap dataset.',
    prompt: 'Analyze SAME smoke-aerosol signatures from overheated wire insulation for detector design.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'confined-combustion-scenario',
    title: 'Guided Scenario: Confined Combustion',
    tag: '8.3 psia · Confined Plates',
    accent: '#4338ca',
    o2Pct: 30,
    flowCms: 8.0,
    gravity: 'microgravity',
    investigationId: 'confined-combustion',
    materialId: 'thin-sheet',
    description: 'Flame spread between close parallel plates — rack/duct geometry amplified by wall heat recirculation.',
    prompt: 'Analyze confined-geometry flame spread between parallel plates at reduced pressure.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
  {
    id: 'flare-scenario',
    title: 'Guided Scenario: FLARE',
    tag: 'Partial-G · 15–40% O₂',
    accent: '#b45309',
    o2Pct: 30,
    flowCms: 15.0,
    gravity: 'lunar',
    investigationId: 'flare',
    materialId: 'pmma',
    description: 'Material flammability limits mapped at Lunar (0.17 g) and Martian (0.38 g) gravity with an on-orbit centrifuge.',
    prompt: 'Analyze FLARE partial-gravity flammability limits for lunar and martian cabin atmospheres.',
    outcomeStatus: 'MISSION ACCOMPLISHED',
  },
]

const GRAVITY_G = { microgravity: 0, earth: 1, lunar: 0.17, mars: 0.38 } as const

/** 'Historical Crisis: Apollo 13' → { kind: 'Historical Crisis', name: 'Apollo 13' } */
function splitTitle(preset: MissionPreset) {
  const [kind, name] = preset.title.split(': ')
  return { kind, name: name ?? preset.title }
}

/** the editorial spread leads with four envelopes — the rest of the
 *  catalog stays reachable in the mission index below */
const FEATURE = MISSION_PRESETS[0] // apollo 1
const SIDE_A = MISSION_PRESETS[1] // apollo 13
const SIDE_B = MISSION_PRESETS[4] // flex-2
const TERTIARY = MISSION_PRESETS[3] // saffire
const INDEX_MISSIONS = MISSION_PRESETS.filter(
  (p) => ![FEATURE.id, SIDE_A.id, SIDE_B.id, TERTIARY.id].includes(p.id),
)

function ActiveMark() {
  return <span className="font-mono text-tiny font-semibold text-accent">● active</span>
}

/** orbital arc + diagonal tick — pure decoration behind the spread */
function OrbitDecor() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-4 hidden h-[420px] w-[420px] text-ink opacity-[0.14] lg:block"
      viewBox="0 0 420 420"
      fill="none"
    >
      <circle cx="310" cy="110" r="170" stroke="currentColor" strokeWidth="1" strokeDasharray="3 6" />
      <circle cx="310" cy="110" r="230" stroke="currentColor" strokeWidth="0.75" opacity="0.6" />
      <circle cx="428" cy="196" r="4" fill="currentColor" />
      <line x1="20" y1="330" x2="150" y2="200" stroke="currentColor" strokeWidth="0.75" />
      <line x1="150" y1="200" x2="150" y2="212" stroke="currentColor" strokeWidth="0.75" />
      <line x1="150" y1="200" x2="138" y2="200" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  )
}

export default function SimDeck() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeMission, setActiveMission] = useState<MissionPreset>(MISSION_PRESETS[0])

  useEffect(() => {
    const root = rootRef.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero]', { opacity: 0, y: 14, duration: 0.6, ease: 'power2.out', stagger: 0.07 })
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 18,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 94%', scroller: root },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  // selecting an envelope marks it active and announces the pick on the
  // chamber bus — a mounted chamber retunes to the preset (o₂/flow/grav);
  // the run/report pipeline itself intentionally lives outside this view
  const loadMissionPreset = (preset: MissionPreset) => {
    setActiveMission(preset)
    emitUiCommand({
      load_preset: preset.investigationId,
      set_o2_percent: preset.o2Pct,
      set_airflow_cm_s: preset.flowCms,
      set_gravity_g: GRAVITY_G[preset.gravity],
      trigger_containment: null,
      __investigation: preset.investigationId,
      __origin: 'sim-deck',
      __run: false,
    })
  }

  const pickProps = (preset: MissionPreset) => ({
    type: 'button' as const,
    'aria-pressed': activeMission.id === preset.id,
    onClick: () => loadMissionPreset(preset),
  })

  const feature = splitTitle(FEATURE)
  const sideA = splitTitle(SIDE_A)
  const sideB = splitTitle(SIDE_B)
  const tertiary = splitTitle(TERTIARY)

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-bg">
      <div className="shell relative pb-24 pt-28 sm:pt-32">
        <KeyedFlame
          className="inset-x-0 -top-8 h-[min(54vh,460px)]"
          strength={0.3}
          src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }}
        />

        {/* ---- editorial hero ---- */}
        <header className="relative">
          <div data-hero className="eyebrow flex items-baseline justify-between gap-6 opacity-70">
            <Button asChild variant="glass" size="sm" className="lowercase">
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault()
                  navigateBack()
                }}
              >
                <IconArrowLeft size={14} /> back
              </a>
            </Button>
            <span className="hidden cursor-default transition-colors duration-300 hover:text-accent hover:opacity-100 sm:inline">
              simulations · mission envelopes
            </span>
          </div>

          <p data-hero className="card-label mt-12 sm:mt-16">Guided Scenarios &amp; Historical Crises</p>
          <h1
            data-hero
            className="mt-4 font-display text-[clamp(2.75rem,6.5vw,4rem)] font-bold leading-display tracking-tight"
          >
            1-Click Mission Envelopes
          </h1>
          <p data-hero className="mt-8 max-w-xl text-body leading-[1.85] opacity-80">
            Explore historical fire crises and experimental combustion environments from NASA
            research — one click previews the mission.
          </p>
        </header>

        {/* ---- asymmetric mission spread — names only ---- */}
        <section className="mission-areas relative mt-16 sm:mt-24" aria-label="Mission envelopes">
          <OrbitDecor />

          {/* featured — apollo 1 */}
          <button
            {...pickProps(FEATURE)}
            data-hero
            className="group flex items-center border-t border-edge pt-7 [grid-area:feature] text-left lg:pt-0 lg:border-t-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <span className="min-w-0">
              <span
                className="block font-display text-[clamp(3.2rem,6vw,5rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
                style={activeMission.id === FEATURE.id ? { color: FEATURE.accent } : undefined}
              >
                {feature.name}
              </span>
              {activeMission.id === FEATURE.id && (
                <span className="mt-4 block"><ActiveMark /></span>
              )}
            </span>
          </button>

          {/* secondary rail — apollo 13 + flex-2 */}
          {([
            [SIDE_A, sideA],
            [SIDE_B, sideB],
          ] as const).map(([preset, t], i) => {
            const isActive = activeMission.id === preset.id
            return (
              <button
                key={preset.id}
                {...pickProps(preset)}
                data-hero
                className={`group border-t border-edge pt-7 text-left lg:border-l lg:pl-10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${
                  i === 0 ? '[grid-area:side-a]' : '[grid-area:side-b] sm:border-l sm:pl-6 lg:pl-10'
                }`}
              >
                <span
                  className="block font-display text-[clamp(1.8rem,3.2vw,2.6rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
                  style={isActive ? { color: preset.accent } : undefined}
                >
                  {t.name}
                </span>
                {isActive && <span className="mt-3 block"><ActiveMark /></span>}
              </button>
            )
          })}

          {/* tertiary band — saffire */}
          <button
            {...pickProps(TERTIARY)}
            data-reveal
            className="group flex items-baseline justify-between gap-6 border-t border-edge pt-8 text-left [grid-area:tertiary] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <span
              className="font-display text-[clamp(2rem,3.8vw,3.2rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
              style={activeMission.id === TERTIARY.id ? { color: TERTIARY.accent } : undefined}
            >
              {tertiary.name}
            </span>
            {activeMission.id === TERTIARY.id && <ActiveMark />}
          </button>
        </section>

        {/* ---- full mission index — every remaining envelope, 1-click ---- */}
        <section className="mt-20 sm:mt-28" aria-label="Full mission index" data-reveal>
          <div className="flex items-baseline justify-between gap-4 border-b border-edge pb-4">
            <span className="card-label">All Missions</span>
            <span className="font-mono text-tiny opacity-60">
              {INDEX_MISSIONS.length} more envelopes
            </span>
          </div>
          <ul>
            {INDEX_MISSIONS.map((preset) => {
              const t = splitTitle(preset)
              const isActive = activeMission.id === preset.id
              return (
                <li key={preset.id}>
                  <button
                    {...pickProps(preset)}
                    className="row-hover group flex w-full items-baseline justify-between gap-6 border-b border-edge py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span
                      className="min-w-0 truncate font-display text-lg font-bold transition-colors duration-300 group-hover:text-accent sm:text-xl"
                      style={isActive ? { color: preset.accent } : undefined}
                    >
                      {t.name}
                    </span>
                    <span className="shrink-0 font-mono text-tiny font-semibold">
                      {isActive ? (
                        <ActiveMark />
                      ) : (
                        <span className="opacity-40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100">
                          select →
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="relative mt-12 flex justify-end">
          <Button variant="glass" onClick={navigateBack}>
            Back to overview <IconArrowLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
