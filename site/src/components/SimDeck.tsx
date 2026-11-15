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
      className="pointer-events-none absolute -right-40 -top-72 hidden h-[1000px] w-[1100px] text-ink opacity-[0.22] dark:opacity-[0.09] lg:block"
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
      <div className="relative mx-auto w-[min(92vw,96rem)] pb-28 pt-32 sm:pt-40">
        <KeyedFlame
          className="-top-24 left-1/2 h-[min(72vh,640px)] w-screen -translate-x-1/2"
          strength={0.3}
          mask="[mask-image:radial-gradient(ellipse_closest-side_at_50%_45%,black_12%,transparent_100%)]"
          src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }}
        />

        {/* ---- editorial hero ---- */}
        <header className="relative sm:pl-[clamp(1rem,6vw,7rem)]">
          <div className="grid items-end gap-x-[clamp(3rem,7vw,9rem)] gap-y-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <div>
              <p data-hero className="card-label !text-[color-mix(in_srgb,var(--accent)_55%,var(--ink))] dark:!text-accent">Guided Scenarios &amp; Historical Crises</p>
              <h1
                data-hero
                className="mt-2 font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold leading-display tracking-tight"
              >
                Mission Envelopes
              </h1>
            </div>
            <p data-hero className="max-w-sm text-caption leading-[1.7] opacity-80">
              Explore historical fire crises from NASA research — one click previews the mission.
            </p>
          </div>
        </header>

        {/* ---- missions — historical crises ---- */}
        <section className="relative mt-12 sm:mt-16" aria-label="Historical missions">
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

          <div
            aria-hidden="true"
            className="relative mb-12 grid h-3 gap-x-[clamp(3rem,7vw,9rem)] sm:mb-16 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]"
          >
            <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-ink/60 via-ink/30 to-transparent dark:from-ink/35 dark:via-ink/15" />
            <span className="absolute left-0 top-0 h-3 w-px bg-ink/70 dark:bg-ink/45" />
            <span className="relative hidden lg:col-start-2 lg:block">
              <span className="absolute -left-[clamp(1.5rem,3.5vw,4.5rem)] top-[2px] h-2 w-px bg-ink/55 dark:bg-ink/30" />
              <span className="absolute -left-[clamp(1.5rem,3.5vw,4.5rem)] top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e5202e]" />
            </span>
          </div>

          <div className="relative grid gap-x-[clamp(3rem,7vw,9rem)] gap-y-24 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            {/* featured — apollo 1: giant name across the block, copy + plate below */}
            <article data-hero className="flex min-w-0 flex-col">
              <div className="flex items-center gap-5">
                <span className="inline-block shrink-0 bg-[#e5202e] px-3 py-1.5 font-mono text-tiny font-semibold uppercase tracking-label text-white">
                  Historical Crisis
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-[#e5202e] to-transparent dark:from-[#e5202e]/60" />
              </div>
              <h2 className="mt-4 whitespace-nowrap font-display text-[clamp(3rem,7.6vw,7rem)] font-bold leading-[0.92] tracking-tight">
                {feature.name}
              </h2>
              <div className="mt-10 grid flex-1 items-center gap-x-[clamp(2.5rem,5vw,6rem)] gap-y-12 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="min-w-0">
                  <p className="font-mono text-[clamp(0.9rem,1.3vw,1.05rem)] font-semibold text-[#e5202e]">
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
                <div className="relative min-w-0">
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-3 top-0 z-10 hidden h-full w-[35%] sm:block"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <line x1="34" y1="4" x2="2" y2="64" stroke="#e5202e" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="cut-hero relative h-[300px] overflow-hidden bg-black sm:h-[420px] lg:h-[500px] xl:h-[560px]">
                    <img
                      src={MISSION_MEDIA.feature.src}
                      alt={MISSION_MEDIA.feature.alt}
                      className="h-full w-full object-cover grayscale contrast-125 brightness-95"
                    />
                    <div className="absolute inset-0 bg-[#1e3fae]/15 mix-blend-multiply" />
                  </div>
                </div>
              </div>
            </article>

            {/* rail — two identical panels sharing the feature's height */}
            <div className="relative flex flex-col gap-10">
              <span
                aria-hidden="true"
                className="absolute -left-[clamp(1.5rem,3.5vw,4.5rem)] top-[6%] hidden h-[88%] w-px bg-gradient-to-b from-transparent via-ink/55 to-transparent dark:via-ink/30 lg:block"
              />
              <svg
                aria-hidden="true"
                className="absolute -left-[calc(clamp(1.5rem,3.5vw,4.5rem)+32px)] top-[46%] hidden text-ink lg:block"
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
              >
                <line x1="4" y1="60" x2="60" y2="4" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" />
                <circle cx="32" cy="32" r="3" fill="#e5202e" />
              </svg>
              {rail.map(([preset, t, media, n, shape]) => {
                const isActive = activeMission.id === preset.id
                return (
                  <button
                    key={preset.id}
                    {...pickProps(preset)}
                    data-hero
                    className="group flex flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    <span className="cut-panel grid w-full grid-cols-[minmax(0,1fr)_46%] items-center gap-3 bg-ink/[0.09] dark:bg-ink/[0.07] py-10 pl-12 pr-8 transition-colors duration-300 group-hover:bg-ink/[0.13] dark:group-hover:bg-ink/[0.1]">
                      <span className="flex h-full min-w-0 flex-col justify-between gap-6">
                        <span className="block">
                          <span className="block font-mono text-tiny uppercase tracking-label opacity-60">
                            {n} / Historical Crisis
                          </span>
                          <span
                            className="mt-2 block font-display text-[clamp(1.5rem,2.2vw,2.25rem)] font-bold leading-[1.05] tracking-tight transition-colors duration-300 group-hover:text-accent"
                            style={isActive ? { color: preset.accent } : undefined}
                          >
                            {t.name}
                          </span>
                          <span className="mt-3 block font-mono text-tiny font-semibold text-[#e5202e]">
                            {isActive ? '● active' : preset.tag}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="grid size-10 shrink-0 place-items-center rounded-full border border-[#1e3fae] font-mono text-caption text-[#1e3fae] transition-colors duration-300 group-hover:bg-[#1e3fae] group-hover:text-white"
                        >
                          →
                        </span>
                      </span>
                      <span className={`${shape} block h-48 overflow-hidden bg-black sm:h-60`}>
                        {renderMedia(media, mediaCls)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* band — challenger + columbia, media bleeding to the screen edges */}
          <div className="mission-bleed relative mt-24 pt-16 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-ink/60 before:via-ink/35 before:to-transparent dark:before:from-ink/35 dark:before:via-ink/20 sm:mt-32">
            <span aria-hidden="true" className="absolute left-[var(--gut)] top-0 h-[3px] w-14 -translate-y-px bg-[#1e3fae]" />
            <div className="grid gap-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[clamp(4rem,8vw,10rem)]">
              {band.map(([preset, t, media, n, shape], i) => {
                const isActive = activeMission.id === preset.id
                const imageLeft = i === 0
                return (
                  <button
                    key={preset.id}
                    {...pickProps(preset)}
                    data-hero
                    className="group relative flex flex-col items-stretch gap-6 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:flex-row sm:items-center sm:gap-8"
                  >
                    {!imageLeft && (
                      <span
                        aria-hidden="true"
                        className="absolute -left-[clamp(2rem,4vw,5rem)] top-[10%] hidden h-[80%] w-px bg-gradient-to-b from-transparent via-ink/55 to-transparent dark:via-ink/30 lg:block"
                      />
                    )}
                    <span
                      className={`${shape} block h-48 overflow-hidden bg-black sm:h-60 sm:w-[48%] sm:shrink-0 ${
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
                          className="mt-1 block font-display text-[clamp(1.5rem,2.3vw,2rem)] font-bold leading-display tracking-tight transition-colors duration-300 group-hover:text-accent"
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
          </div>
        </section>

        <div className="relative mt-20 flex justify-end">
          <Button variant="glass" onClick={navigateBack}>
            Back to overview <IconArrowLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
