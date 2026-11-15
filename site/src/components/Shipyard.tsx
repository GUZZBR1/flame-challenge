import { startTransition, useEffect, useRef, useState } from 'react'
import { gsap, navigate, ScrollTrigger } from '../lib/scroll'
import Button from './ui/Button'

type Pose = 'idle' | 'talk' | 'explain' | 'mad' | 'stern' | 'panic' | 'yell'

interface Line {
  who: 'sci' | 'eng'
  pose: Pose
  text: string
}

/** the comms transcript — real combustion physics, argued about. every claim
 *  here is something the solver or the psi dataset actually encodes. */
const SCRIPT: Line[] = [
  { who: 'sci', pose: 'talk', text: 'fun fact: take away gravity and a flame closes into a sphere. no teardrop, no plume.' },
  { who: 'eng', pose: 'stern', text: 'a sphere. great. so a fuel leak on my ship burns in every direction at once.' },
  { who: 'sci', pose: 'explain', text: 'diffusion-limited, technically. and below ~600 k it slips into cool-flame — almost invisible.' },
  { who: 'eng', pose: 'panic', text: 'invisible fire. on my ship. love that for us.' },
  { who: 'sci', pose: 'mad', text: 'relax — the engine checks every material against real psi mission data.' },
  { who: 'eng', pose: 'yell', text: 'then run the numbers. i am not signing anything until i watch it burn.' },
]

const WHO: Record<Line['who'], string> = {
  sci: 'the scientist',
  eng: 'the engineer',
}

/** hand-placed feel — each speaker tag gets a small tilt + nudge so the
 *  feed reads like scribbled comms, not a centered column. */
const TAG_TILTS = [
  { r: -0.9, x: 2 },
  { r: 0.6, x: -3 },
  { r: -0.4, x: 5 },
  { r: 1.1, x: -4 },
  { r: -0.7, x: 3 },
  { r: 0.8, x: -2 },
]

const SPRITES: Record<Line['who'], Record<string, string>> = {
  sci: {
    idle: '/assets/pixel_scientist.png',
    talk: '/assets/pixel_scientist_talk.png',
    explain: '/assets/pixel_scientist_explain.png',
    mad: '/assets/pixel_scientist_mad.png',
  },
  eng: {
    idle: '/assets/pixel_engineer.png',
    stern: '/assets/pixel_engineer_stern.png',
    panic: '/assets/pixel_engineer_panic.png',
    yell: '/assets/pixel_engineer_yell.png',
  },
}

function scrollToSims() {
  navigate('#simulations')
}

/** The crew arguing combustion physics — typed comms transcript with pose
 *  swaps, auto-started when the section scrolls into view. `vision` nav
 *  target. */
export default function Shipyard() {
  const root = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)
  const [log, setLog] = useState<Line[]>([])
  const [typing, setTyping] = useState<{ who: Line['who']; text: string } | null>(null)
  const [poses, setPoses] = useState<Record<Line['who'], Pose>>({ sci: 'idle', eng: 'idle' })

  const aliveRef = useRef(true)
  const timerRef = useRef(0)
  const idxRef = useRef(0)
  const startRef = useRef<(() => void) | null>(null)
  // the feed sleeps while the section is off-screen, the page is covered
  // by an overlay view, or the tab is hidden — it resumes mid-sentence
  const visibleRef = useRef(true)
  const coveredRef = useRef(false)

  // typed-transcript state machine — finished lines roll into the log,
  // capped so it keeps rolling like a real comms feed
  useEffect(() => {
    aliveRef.current = true
    const canRun = () =>
      visibleRef.current && !coveredRef.current && !document.hidden
    // every beat goes through defer: parked steps poll cheaply instead
    // of typing into an invisible feed
    const defer = (fn: () => void, ms: number) => {
      timerRef.current = window.setTimeout(() => {
        if (!aliveRef.current) return
        if (!canRun()) {
          defer(fn, 400)
          return
        }
        fn()
      }, ms)
    }
    const play = () => {
      if (!aliveRef.current) return
      if (idxRef.current >= SCRIPT.length) {
        defer(() => {
          idxRef.current = 0
          setPoses({ sci: 'idle', eng: 'idle' })
          play()
        }, 2600)
        return
      }
      const { who, pose, text } = SCRIPT[idxRef.current]
      setPoses({ sci: 'idle', eng: 'idle', [who]: pose })
      let c = 0
      setTyping({ who, text: '' })
      const tick = () => {
        if (!aliveRef.current) return
        c += 1
        startTransition(() => setTyping({ who, text: text.slice(0, c) }))
        if (c < text.length) {
          defer(tick, 26)
        } else {
          idxRef.current += 1
          defer(() => {
            setTyping(null)
            setLog((l) => [...l.slice(-4), { who, pose, text }])
            play()
          }, 1500)
        }
      }
      defer(tick, 140)
    }
    startRef.current = play
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { threshold: 0 },
    )
    if (root.current) io.observe(root.current)
    const onView = (e: Event) => {
      coveredRef.current =
        ((e as CustomEvent<{ view?: string }>).detail?.view ?? 'main') !==
        'main'
    }
    window.addEventListener('ignis:view', onView)
    return () => {
      aliveRef.current = false
      window.clearTimeout(timerRef.current)
      io.disconnect()
      window.removeEventListener('ignis:view', onView)
    }
  }, [])

  // section reveal — also kicks off the conversation
  useEffect(() => {
    const el = root.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStarted(true)
      setLog(SCRIPT)
      return
    }
    const ctx = gsap.context(() => {
      gsap.from(el, {
        y: 24, autoAlpha: 0, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      })
      ScrollTrigger.create({
        trigger: el,
        start: 'top 75%',
        once: true,
        onEnter: () => {
          setStarted(true)
          startRef.current?.()
        },
      })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={root}
      id="vision"
      aria-labelledby="shipyard-title"
      className="relative scroll-mt-24 overflow-x-clip px-5 pb-24 pt-6 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
          <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
            day by day in the shipyard — live feed
          </span>
        </div>

        <h2
          id="shipyard-title"
          className="mt-4 cursor-default text-center font-[family-name:var(--font-display)] text-[clamp(26px,4.5vw,40px)] font-bold leading-[1.08] tracking-[-0.02em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
        >
          The Station Where The Numbers Live
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-center font-mono text-[13px] leading-relaxed text-[var(--ink)] opacity-80">
          docked crews argue about combustion the way ground crews argue about
          weather — because out here a flame can hide at 600 k and still be
          alive. every burn is checked against the psi record: droplet d²-law
          rates, cool-flame thresholds, opposed-flow extinction.
        </p>

        {/* the crew — they come alive when the feed starts */}
        <div
          className={`mx-auto mt-12 flex max-w-3xl items-end justify-center gap-6 transition-opacity duration-500 sm:mt-14 ${
            started ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!started}
        >
          {(['sci', 'eng'] as const).map((who) => (
            <img
              key={who}
              src={SPRITES[who][poses[who]] ?? SPRITES[who].idle}
              alt=""
              className={`h-20 w-auto [image-rendering:pixelated] transition-transform duration-200 sm:h-24 ${
                who === 'eng' ? '-scale-x-100' : ''
              } ${typing?.who === who ? 'scale-110 -translate-y-1' : ''}`}
            />
          ))}
        </div>

        {/* comms feed — typed transcript, rolling. sci on the left lane,
            eng on the right (under their sprites), tags dropped in loose */}
        <div className="mx-auto mt-8 max-w-3xl space-y-3 font-mono text-[12.5px] leading-relaxed sm:mt-10" aria-live="polite">
          {!started && (
            <p className="text-[var(--ink)] opacity-40">comms — idle · waiting for the crew</p>
          )}
          {log.map((l, i) => {
            const t = TAG_TILTS[i % TAG_TILTS.length]
            const eng = l.who === 'eng'
            return (
              <div
                key={i}
                className={`max-w-[86%] text-[var(--ink)] opacity-75 sm:max-w-[76%] ${
                  eng ? 'ml-auto text-right' : 'mr-auto'
                }`}
              >
                <span
                  className="mb-0.5 inline-block text-[10px] lowercase tracking-[0.22em] text-[var(--accent)]"
                  style={{ transform: `rotate(${t.r}deg) translateX(${eng ? -t.x : t.x}px)` }}
                >
                  {WHO[l.who]}
                </span>
                <span className="block">{l.text}</span>
              </div>
            )
          })}
          {typing && (() => {
            const t = TAG_TILTS[log.length % TAG_TILTS.length]
            const eng = typing.who === 'eng'
            return (
              <div
                className={`max-w-[86%] text-[var(--ink)] sm:max-w-[76%] ${
                  eng ? 'ml-auto text-right' : 'mr-auto'
                }`}
              >
                <span
                  className="mb-0.5 inline-block text-[10px] lowercase tracking-[0.22em] text-[var(--accent)]"
                  style={{ transform: `rotate(${t.r}deg) translateX(${eng ? -t.x : t.x}px)` }}
                >
                  {WHO[typing.who]}
                </span>
                <span className="block">
                  {typing.text}
                  <span className="caret-blink text-[var(--accent)]">▍</span>
                </span>
              </div>
            )
          })()}
        </div>

        <div
          className={`mt-10 flex justify-center transition-all duration-500 ${
            started ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
          }`}
        >
          <Button
            type="button"
            onClick={scrollToSims}
            variant="accent"
            size="xl"
            className="w-full max-w-full whitespace-normal text-center font-mono lowercase tracking-[0.1em] sm:w-auto sm:tracking-[0.12em]"
          >
            run the numbers — simulations ↑
          </Button>
        </div>
      </div>
    </section>
  )
}
