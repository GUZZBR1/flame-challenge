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
const SIDE_A = MISSION_PRESETS[3] // challenger 51-l
const SIDE_B = MISSION_PRESETS[2] // mir 1997
const BAND_A = MISSION_PRESETS[1] // apollo 13
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

/** large orbital arc sweeping across the spread + crosshair */
function OrbitDecor() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -right-40 -top-72 hidden h-[1000px] w-[1100px] text-ink opacity-[0.14] lg:block"
      viewBox="0 0 1100 1000"
      fill="none"
    >
      <circle cx="1020" cy="140" r="640" stroke="currentColor" strokeWidth="1" />
      <circle cx="1020" cy="140" r="520" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 8" opacity="0.7" />
      <path d="M690 296 V326 M675 311 H705" stroke="currentColor" strokeWidth="1" />
      <circle cx="560" cy="702" r="3.5" fill="currentColor" />
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
  const rail = [
    [SIDE_A, splitTitle(SIDE_A), MISSION_MEDIA.bandA, '02', 'cut-slant'],
    [SIDE_B, splitTitle(SIDE_B), MISSION_MEDIA.sideB, '03', 'cut-slant'],
  ] as const
  const band = [
    [BAND_A, splitTitle(BAND_A), MISSION_MEDIA.sideA, '04', 'cut-rail'],
    [BAND_B, splitTitle(BAND_B), MISSION_MEDIA.bandB, '05', 'cut-slant'],
  ] as const

  const renderMedia = (media: (typeof MISSION_MEDIA)[keyof typeof MISSION_MEDIA], cls: string) =>
    media.type === 'video' ? (
      <video
        className={cls}
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
      <img className={cls} src={media.src} alt={media.alt} loading="lazy" />
    )
  const mediaCls =
    'h-full w-full object-cover grayscale contrast-110 transition-[filter,transform] duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0'

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overflow-x-hidden overscroll-contain bg-bg">
      <div className="shell relative pb-24 pt-28 sm:pt-32">
        <KeyedFlame
          className="-top-24 left-1/2 h-[min(72vh,640px)] w-screen -translate-x-1/2"
          strength={0.3}
          mask="[mask-image:radial-gradient(ellipse_closest-side_at_50%_45%,black_12%,transparent_100%)]"
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
            Explore historical fire crises from NASA research — one click previews the mission.
          </p>
          <p
            data-hero
            aria-hidden="true"
            className="absolute right-0 top-28 hidden border-r border-ink/40 pr-4 text-right font-mono text-tiny uppercase leading-[1.9] tracking-label opacity-70 lg:block"
          >
            Fire<br />Combustion<br />Microgravity
          </p>
        </header>

        {/* ---- missions — historical crises ---- */}
        <section className="relative mt-14 sm:mt-20" aria-label="Historical missions">
          <svg width="0" height="0" aria-hidden="true" className="absolute">
            <defs>
              <clipPath id="cut-hero" clipPathUnits="objectBoundingBox">
                <path d="M0.3,0 L0.97,0 Q1,0 1,0.04 L1,0.62 Q1,0.68 0.975,0.74 L0.92,0.95 Q0.905,1 0.87,1 L0.04,1 Q0,1 0.014,0.95 L0.28,0.04 Q0.29,0 0.3,0 Z" />
              </clipPath>
              <clipPath id="cut-slant" clipPathUnits="objectBoundingBox">
                <path d="M0.2,0 L0.96,0 Q1,0 1,0.06 L1,0.94 Q1,1 0.96,1 L0.03,1 Q0,1 0.01,0.94 L0.19,0.03 Q0.195,0 0.2,0 Z" />
              </clipPath>
              <clipPath id="cut-panel" clipPathUnits="objectBoundingBox">
                <path d="M0.07,0.03 Q0.075,0 0.1,0 L0.975,0 Q1,0 1,0.05 L1,0.95 Q1,1 0.975,1 L0.03,1 Q0,1 0.006,0.95 Z" />
              </clipPath>
              <clipPath id="cut-rail" clipPathUnits="objectBoundingBox">
                <path d="M0.1,0 L0.97,0 Q1,0 0.99,0.05 L0.93,0.95 Q0.92,1 0.89,1 L0.03,1 Q0,1 0.01,0.95 L0.07,0.05 Q0.08,0 0.1,0 Z" />
              </clipPath>
            </defs>
          </svg>
          <OrbitDecor />

          <div className="relative grid gap-x-14 gap-y-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* featured — apollo 1 */}
            <article data-hero className="grid items-center gap-8 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="min-w-0">
                <span className="inline-block bg-[#e5202e] px-3 py-1.5 font-mono text-tiny font-semibold uppercase tracking-label text-white">
                  Historical Crisis
                </span>
                <h2 className="mt-5 whitespace-nowrap font-display text-[clamp(3.2rem,7vw,4.5rem)] font-bold leading-[0.95] tracking-tight">
                  {feature.name}
                </h2>
                <p className="mt-5 font-mono text-[clamp(1rem,1.6vw,1.2rem)] font-semibold text-[#e5202e]">
                  {FEATURE.tag}
                </p>
                <p className="mt-5 max-w-xs text-body leading-[1.8] opacity-80">{FEATURE.description}</p>
                <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
                  <button
                    {...pickProps(FEATURE)}
                    className="inline-flex items-center gap-3 rounded-[6px] bg-[#1e3fae] px-6 py-3.5 font-mono text-caption font-semibold text-white transition-colors duration-300 hover:bg-[#2a52d4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    {activeMission.id === FEATURE.id ? '● Active' : 'Explore Mission'} <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen((o) => !o)}
                    className="border-b-2 border-[#1e3fae] pb-1 font-mono text-caption font-semibold transition-colors duration-300 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    Details
                  </button>
                </div>
                {detailsOpen && (
                  <p className="mt-5 max-w-xs font-mono text-tiny leading-relaxed opacity-70">
                    {FEATURE.prompt} — {FEATURE.outcomeStatus}
                  </p>
                )}
              </div>
              <div className="relative min-w-0 xl:-ml-6">
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-3 top-0 z-10 hidden h-full w-[35%] xl:block"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  fill="none"
                >
                  <line x1="34" y1="4" x2="2" y2="64" stroke="#e5202e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="cut-hero relative h-[300px] overflow-hidden bg-black sm:h-[380px] xl:h-[420px]">
                  <img
                    src={MISSION_MEDIA.feature.src}
                    alt={MISSION_MEDIA.feature.alt}
                    className="h-full w-full object-cover grayscale contrast-125 brightness-95"
                  />
                  <div className="absolute inset-0 bg-[#1e3fae]/15 mix-blend-multiply" />
                </div>
              </div>
            </article>

            {/* rail — challenger (text) over mir 1997 (panel) */}
            <div className="flex flex-col gap-8 lg:pt-8">
              {rail.map(([preset, t, media, n, shape], idx) => {
                const isActive = activeMission.id === preset.id
                const arrow = (
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-[#1e3fae] font-mono text-caption text-[#1e3fae] transition-colors duration-300 group-hover:bg-[#1e3fae] group-hover:text-white"
                  >
                    →
                  </span>
                )
                const label = (
                  <span className="block font-mono text-tiny uppercase tracking-label opacity-60">
                    {n} / Historical Crisis
                  </span>
                )
                const name = (
                  <span
                    className="mt-1 block font-display text-[clamp(2rem,3.2vw,2.75rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
                    style={isActive ? { color: preset.accent } : undefined}
                  >
                    {t.name}
                  </span>
                )
                const tag = (
                  <span className="mt-2 block font-mono text-tiny font-semibold text-[#e5202e]">
                    {isActive ? '● active' : preset.tag}
                  </span>
                )
                const desc = (
                  <span className="mt-3 line-clamp-2 block max-w-[17rem] text-caption leading-relaxed opacity-75">
                    {preset.description}
                  </span>
                )
                if (idx === 0)
                  return (
                    <div key={preset.id} className="space-y-8">
                      <button
                        {...pickProps(preset)}
                        data-hero
                        className="group relative flex w-full items-start justify-between gap-4 pl-10 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                      >
                        <span aria-hidden="true" className="absolute left-0 top-1 h-24 w-px bg-ink/35" />
                        <span className="min-w-0">
                          {label}
                          {name}
                          {tag}
                          {desc}
                        </span>
                        {arrow}
                      </button>
                      <svg aria-hidden="true" className="h-4 w-full text-ink opacity-25" viewBox="0 0 400 16" preserveAspectRatio="none" fill="none">
                        <path d="M0 16 Q0 0 28 0 H400" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                  )
                return (
                  <button
                    key={preset.id}
                    {...pickProps(preset)}
                    data-hero
                    className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    <span className="cut-panel grid min-h-[230px] grid-cols-[minmax(0,1fr)_44%] items-center gap-2 bg-ink/[0.07] py-5 pl-9 pr-4">
                      <span className="flex min-w-0 flex-col items-start">
                        {label}
                        {name}
                        {tag}
                        {desc}
                        <span className="mt-4">{arrow}</span>
                      </span>
                      <span className={`${shape} block h-44 overflow-hidden bg-black sm:h-48`}>
                        {renderMedia(media, mediaCls)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* band — challenger + columbia, media bleeding to the screen edges */}
          <div className="mission-bleed relative mt-24 border-t border-edge pt-12 sm:mt-28">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-16">
              {band.map(([preset, t, media, n, shape], i) => {
                const isActive = activeMission.id === preset.id
                const imageLeft = i === 0
                return (
                  <button
                    key={preset.id}
                    {...pickProps(preset)}
                    data-hero
                    className="group flex flex-col items-stretch gap-6 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:flex-row sm:items-center sm:gap-8"
                  >
                    <span
                      className={`${shape} block h-44 overflow-hidden bg-black sm:h-48 sm:w-[46%] sm:shrink-0 ${
                        imageLeft ? 'bleed-l' : 'bleed-r sm:order-2'
                      }`}
                    >
                      {renderMedia(media, mediaCls)}
                    </span>
                    <span className="flex min-w-0 flex-1 items-start justify-between gap-4">
                      <span className="min-w-0">
                        <span className="block font-mono text-tiny uppercase tracking-label opacity-60">
                          {n} / Historical Crisis
                        </span>
                        <span
                          className="mt-1 block font-display text-[clamp(1.8rem,3vw,2.5rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
                          style={isActive ? { color: preset.accent } : undefined}
                        >
                          {t.name}
                        </span>
                        <span className="mt-2 block font-mono text-tiny font-semibold text-[#1e3fae]">
                          {isActive ? '● active' : preset.tag}
                        </span>
                        <span className="mt-3 line-clamp-2 block max-w-[17rem] text-caption leading-relaxed opacity-75">
                          {preset.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-2 grid size-10 shrink-0 place-items-center rounded-full border border-[#1e3fae] font-mono text-caption text-[#1e3fae] transition-colors duration-300 group-hover:bg-[#1e3fae] group-hover:text-white"
                      >
                        →
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div aria-hidden="true" className="mt-10 flex gap-1.5">
              <span className="h-[3px] w-8 bg-[#1e3fae]" />
              <span className="h-[3px] w-8 bg-ink/20" />
              <span className="h-[3px] w-8 bg-ink/20" />
              <span className="h-[3px] w-8 bg-ink/20" />
            </div>
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
