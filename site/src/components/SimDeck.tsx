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
    id: 'challenger-1986-crisis',
    title: 'Historical Crisis: Challenger 51-L',
    tag: 'SRB Burn-Through · T+73 s',
    accent: '#9f1239',
    o2Pct: 21,
    flowCms: 5.0,
    gravity: 'earth',
    investigationId: 'bass-ii',
    materialId: 'pmma',
    description: 'A cold-degraded O-ring failed to seal the right SRB field joint — a hot-gas plume burned through to the external tank 73 s after liftoff.',
    prompt: 'Analyze Challenger 51-L SRB field-joint burn-through — hot-gas impingement escaping a failed seal into the external tank.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
  {
    id: 'columbia-2003-crisis',
    title: 'Historical Crisis: Columbia STS-107',
    tag: 'RCC Breach · Plasma Ingress',
    accent: '#ea580c',
    o2Pct: 21,
    flowCms: 5.0,
    gravity: 'earth',
    investigationId: 'confined-combustion',
    materialId: 'thin-sheet',
    description: 'A bipod-foam strike breached the left wing leading edge at launch — superheated plasma entered the RCC cavity on reentry and the orbiter broke up over Texas.',
    prompt: 'Analyze Columbia STS-107 leading-edge breach — plasma ingress into a confined RCC wing cavity during hypersonic reentry.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
]

const GRAVITY_G = { microgravity: 0, earth: 1, lunar: 0.17, mars: 0.38 } as const

/** 'Historical Crisis: Apollo 13' → { kind: 'Historical Crisis', name: 'Apollo 13' } */
function splitTitle(preset: MissionPreset) {
  const [kind, name] = preset.title.split(': ')
  return { kind, name: name ?? preset.title }
}

/** only the historical crises stay on the deck — the featured mission
 *  leads left, two stack in the rail, and the shuttle losses close the
 *  spread as a bottom band */
const FEATURE = MISSION_PRESETS[0] // apollo 1
const SIDE_A = MISSION_PRESETS[1] // apollo 13
const SIDE_B = MISSION_PRESETS[2] // mir 1997
const BAND_A = MISSION_PRESETS[3] // challenger 51-l
const BAND_B = MISSION_PRESETS[4] // columbia sts-107

/** official NASA media — images-api.nasa.gov. Apollo 1 flew no mission
 *  (the crew died in a pad test), so the archival CSM photo leads; the
 *  Apollo 13 loop is cut from the real 1970 launch footage; Mir has no
 *  video in the library, so the STS-63 flyaround photo stands in */
const MISSION_MEDIA = {
  feature: {
    type: 'image',
    src: '/assets/nasa/apollo1_csm.jpg',
    alt: 'Apollo 1 (AS-204) Command/Service Module — NASA S67-15704',
  },
  sideA: {
    type: 'video',
    src: '/assets/nasa/apollo13_launch_loop.mp4',
    poster: '/assets/nasa/apollo13_poster.jpg',
    alt: 'Apollo 13 Saturn V ignition and liftoff — NASA KSC-19700411',
  },
  sideB: {
    type: 'image',
    src: '/assets/nasa/mir_sts63.jpg',
    alt: 'Mir space station as seen from STS-63 — NASA sts063-708-095',
  },
  bandA: {
    type: 'image',
    src: '/assets/nasa/challenger_51l.jpg',
    alt: 'Space Shuttle Challenger clearing the tower on STS-51-L — NASA 51l-s-156',
  },
  bandB: {
    type: 'image',
    src: '/assets/nasa/columbia_sts107.jpg',
    alt: 'Space Shuttle Columbia liftoff on STS-107 — NASA STS107-S-015',
  },
} as const

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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const secondary = [
    [SIDE_A, splitTitle(SIDE_A), MISSION_MEDIA.sideA],
    [SIDE_B, splitTitle(SIDE_B), MISSION_MEDIA.sideB],
    [BAND_A, splitTitle(BAND_A), MISSION_MEDIA.bandA],
    [BAND_B, splitTitle(BAND_B), MISSION_MEDIA.bandB],
  ] as const

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

          <p data-hero className="card-label mt-12 sm:mt-16">Historical Crises</p>
          <h1
            data-hero
            className="mt-4 font-display text-[clamp(2.75rem,6.5vw,4rem)] font-bold leading-display tracking-tight"
          >
            1-Click Mission Envelopes
          </h1>
          <p data-hero className="mt-8 max-w-xl text-body leading-[1.85] opacity-80">
            Explore historical fire crises from NASA research — one click previews the mission.
          </p>
        </header>

        {/* ---- missions — historical crises ---- */}
        <section className="mt-16 sm:mt-24" aria-label="Historical missions">
          <svg width="0" height="0" aria-hidden="true" className="absolute">
            <defs>
              <clipPath id="cut-hero" clipPathUnits="objectBoundingBox">
                <path d="M0.32,0 L0.97,0 Q1,0 1,0.04 L1,0.62 Q1,0.68 0.975,0.74 L0.92,0.95 Q0.905,1 0.87,1 L0.04,1 Q0,1 0.014,0.95 L0.3,0.04 Q0.31,0 0.32,0 Z" />
              </clipPath>
              <clipPath id="cut-rail" clipPathUnits="objectBoundingBox">
                <path d="M0.1,0 L0.97,0 Q1,0 0.99,0.05 L0.93,0.95 Q0.92,1 0.89,1 L0.03,1 Q0,1 0.01,0.95 L0.07,0.05 Q0.08,0 0.1,0 Z" />
              </clipPath>
            </defs>
          </svg>

          {/* featured — apollo 1 */}
          <article
            data-hero
            className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-6"
          >
            <OrbitDecor />
            <div className="relative min-w-0">
              <span className="inline-block bg-[#e5202e] px-3 py-1.5 font-mono text-tiny font-semibold uppercase tracking-label text-white">
                Historical Crisis
              </span>
              <h2 className="mt-5 font-display text-[clamp(3.5rem,8vw,6.5rem)] font-bold leading-[0.95] tracking-tight">
                {feature.name}
              </h2>
              <p className="mt-5 font-mono text-[clamp(1.1rem,2vw,1.5rem)] font-semibold text-[#e5202e]">
                {FEATURE.tag}
              </p>
              <p className="mt-6 max-w-md text-body leading-[1.8] opacity-80">{FEATURE.description}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                <button
                  {...pickProps(FEATURE)}
                  className="inline-flex items-center gap-3 rounded-[6px] bg-[#1e3fae] px-6 py-3.5 font-mono text-caption font-semibold text-white transition-colors duration-300 hover:bg-[#2a52d4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  Explore Mission <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((o) => !o)}
                  className="border-b-2 border-[#1e3fae] pb-1 font-mono text-caption font-semibold transition-colors duration-300 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  Details
                </button>
                {activeMission.id === FEATURE.id && <ActiveMark />}
              </div>
              {detailsOpen && (
                <p className="mt-6 max-w-md font-mono text-tiny leading-relaxed opacity-70">
                  {FEATURE.prompt} — {FEATURE.outcomeStatus}
                </p>
              )}
            </div>

            <div className="relative min-w-0">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute -left-2 top-0 z-10 hidden h-full w-[40%] lg:block"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                fill="none"
              >
                <line x1="30" y1="2" x2="2" y2="62" stroke="#e5202e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="cut-hero relative h-[300px] overflow-hidden bg-black sm:h-[400px] lg:h-[500px]">
                <img
                  src={MISSION_MEDIA.feature.src}
                  alt={MISSION_MEDIA.feature.alt}
                  className="h-full w-full object-cover grayscale contrast-125 brightness-95"
                />
                <div className="absolute inset-0 bg-[#1e3fae]/15 mix-blend-multiply" />
              </div>
            </div>
          </article>

          {/* secondary missions — horizontal rules, circular go-icons */}
          <div className="mt-20 grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {secondary.map(([preset, t, media]) => {
              const isActive = activeMission.id === preset.id
              return (
                <button
                  key={preset.id}
                  {...pickProps(preset)}
                  data-hero
                  className="group flex flex-col border-t border-edge pt-6 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-mono text-tiny font-semibold uppercase tracking-label text-[#e5202e]">
                        Historical Crisis
                      </span>
                      <span
                        className="mt-2 block font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
                        style={isActive ? { color: preset.accent } : undefined}
                      >
                        {t.name}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 grid size-9 shrink-0 place-items-center rounded-full border border-edge font-mono text-caption transition-colors duration-300 group-hover:border-accent group-hover:text-accent"
                    >
                      →
                    </span>
                  </span>
                  <span className="mt-3 block font-mono text-tiny font-semibold text-[#e5202e]">{preset.tag}</span>
                  {isActive && <span className="mt-2 block"><ActiveMark /></span>}
                  <span className="cut-rail mt-5 block h-44 overflow-hidden bg-black sm:h-48">
                    {media.type === 'video' ? (
                      <video
                        className="h-full w-full object-cover grayscale contrast-110 transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0"
                        src={media.src}
                        poster={media.poster}
                        aria-label={media.alt}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        className="h-full w-full object-cover grayscale contrast-110 transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0"
                        src={media.src}
                        alt={media.alt}
                        loading="lazy"
                      />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
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
