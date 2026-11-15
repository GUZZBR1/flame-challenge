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
  const secondary = [
    [SIDE_A, splitTitle(SIDE_A), MISSION_MEDIA.sideA],
    [SIDE_B, splitTitle(SIDE_B), MISSION_MEDIA.sideB],
    [BAND_A, splitTitle(BAND_A), MISSION_MEDIA.bandA],
    [BAND_B, splitTitle(BAND_B), MISSION_MEDIA.bandB],
  ] as const

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overflow-x-hidden overscroll-contain bg-bg">
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
        <section className="mission-bleed mt-16 sm:mt-28" aria-label="Historical missions">
          {/* featured — apollo 1 */}
          <article data-hero className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <OrbitDecor />
            <div className="relative min-w-0">
              <h2 className="whitespace-nowrap font-display text-[clamp(3.5rem,9vw,7.5rem)] font-bold leading-[0.95] tracking-tight">
                {feature.name}
              </h2>
              <p className="mt-6 font-mono text-[clamp(1rem,1.6vw,1.25rem)] font-semibold text-[#e5202e]">
                {FEATURE.tag}
              </p>
              <p className="mt-5 max-w-sm text-body leading-[1.8] opacity-75">{FEATURE.description}</p>
              <button
                {...pickProps(FEATURE)}
                className="mt-9 inline-flex items-center gap-3 font-mono text-caption font-semibold text-accent transition-all duration-300 hover:gap-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                {activeMission.id === FEATURE.id ? '● active' : 'Explore mission'} <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="fade-to-l bleed-r relative h-[320px] sm:h-[460px] lg:h-[560px]">
              <img
                src={MISSION_MEDIA.feature.src}
                alt={MISSION_MEDIA.feature.alt}
                className="h-full w-full object-cover grayscale contrast-125 brightness-95"
              />
            </div>
          </article>

          {/* the rest — staggered left / right, names overlap their media */}
          <div className="mt-24 sm:mt-32">
            {secondary.map(([preset, t, media], i) => {
              const isActive = activeMission.id === preset.id
              const nameLeft = i % 2 === 0
              return (
                <button
                  key={preset.id}
                  {...pickProps(preset)}
                  data-hero
                  className={`group relative grid w-full items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:gap-0 ${
                    nameLeft ? 'sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'sm:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
                  } ${i > 0 ? 'mt-16 sm:-mt-6' : ''}`}
                >
                  <span className={`relative z-10 block min-w-0 ${nameLeft ? 'sm:pr-6' : 'sm:order-2 sm:pl-6 sm:text-right'}`}>
                    <span
                      className="block font-display text-[clamp(2.5rem,6.5vw,5.5rem)] font-bold leading-[0.98] tracking-tight transition-colors duration-300 group-hover:text-accent"
                      style={isActive ? { color: preset.accent } : undefined}
                    >
                      {t.name}
                    </span>
                    <span className="mt-3 block font-mono text-tiny font-semibold text-[#e5202e]">
                      {isActive ? '● active' : preset.tag}
                    </span>
                  </span>
                  <span
                    className={`relative block h-56 sm:h-80 lg:h-96 ${
                      nameLeft ? 'fade-to-l bleed-r' : 'fade-to-r bleed-l sm:order-1'
                    }`}
                  >
                    {media.type === 'video' ? (
                      <video
                        className="h-full w-full object-cover grayscale contrast-110 transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.03] group-hover:grayscale-0"
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
                        className="h-full w-full object-cover grayscale contrast-110 transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.03] group-hover:grayscale-0"
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
