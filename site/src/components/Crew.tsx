import { useEffect, useRef } from 'react'
import { gsap } from '../lib/scroll'

interface Member {
  name: string
  role: string
  img: string
  href?: string
}

const CREW: Member[] = [
  {
    name: 'lucas coimbra',
    role: 'physics core · data pipeline · site',
    img: '/assets/crew_lucas.png',
  },
  {
    name: 'gustavo moreira',
    role: 'engine · design · research',
    img: '/assets/crew_gustavo.png',
  },
]

/** The crew — small ledger of who built it. Same visual register as the
 *  solver regimes above: name · role · optional profile link. */
export default function Crew() {
  const astroRef = useRef<HTMLDivElement>(null)
  const walkRef = useRef<HTMLImageElement>(null)
  const waveRef = useRef<HTMLImageElement>(null)

  // mascot: walks in from the left, stops, turns to face us and waves.
  // steps() easing keeps the motion blocky, like the sprite itself.
  useEffect(() => {
    const astro = astroRef.current
    const walk = walkRef.current
    const wave = waveRef.current
    if (!astro || !walk || !wave) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      walk.style.opacity = '0'
      wave.style.opacity = '1'
      return
    }

    const ctx = gsap.context(() => {
      gsap.set(astro, { x: -140, y: 0, rotation: 0, scaleX: 1, opacity: 0 })
      gsap.set(walk, { opacity: 1 })
      gsap.set(wave, { opacity: 0 })

      // chunky up/down hop, runs only while walking
      const bob = gsap.to(astro, {
        y: -7, duration: 0.16, ease: 'steps(2)', repeat: -1, yoyo: true, paused: true,
      })
      const maxX = () =>
        Math.max(120, (astro.parentElement?.clientWidth ?? 400) - astro.offsetWidth - 8)

      let x = -140
      let dir = 1 // committed heading: he only turns around at the edges

      const waveHello = () => {
        gsap.set(astro, { scaleX: 1, rotation: 0 })
        gsap.set(walk, { opacity: 0 })
        gsap.set(wave, { opacity: 1 })
        gsap.to(astro, {
          rotation: -7, transformOrigin: '50% 88%',
          duration: 0.42, ease: 'sine.inOut', repeat: 3, yoyo: true,
          onComplete: () => gsap.to(astro, { rotation: 0, duration: 0.15, onComplete: leg }),
        })
      }

      const leg = () => {
        const m = maxX()
        const edge = dir > 0 ? m - 24 : 24
        const rem = edge - x // signed, in heading units
        // sometimes he pauses mid-crossing to wave — then keeps going
        const waveStop = Math.random() < 0.45 && Math.abs(rem) > 340
        const to = waveStop
          ? Math.round(x + rem * gsap.utils.random(0.3, 0.75))
          : edge
        const d = Math.abs(to - x)
        // constant footstep cadence: one step every 0.16s, synced with the bob
        const dur = Math.max(0.7, d / gsap.utils.random(150, 200))
        gsap.set(astro, { scaleX: dir })
        gsap.set(walk, { opacity: 1 })
        gsap.set(wave, { opacity: 0 })
        bob.restart()
        gsap.to(astro, {
          x: to, duration: dur, ease: `steps(${Math.round(dur / 0.16)})`,
          onComplete: () => {
            bob.pause()
            gsap.to(astro, { y: 0, duration: 0.12 })
            x = to
            if (waveStop) {
              gsap.delayedCall(0.2, waveHello) // resume in the same dir after waving
            } else {
              dir = -dir // reached the edge — turn and patrol back
              gsap.delayedCall(gsap.utils.random(0.4, 0.9), leg)
            }
          },
        })
      }

      gsap.timeline({ scrollTrigger: { trigger: astro, start: 'top 92%' } })
        .to(astro, { opacity: 1, duration: 0.25 })
        .call(leg)
    }, astro)
    return () => ctx.revert()
  }, [])

  return (
    <section
      id="crew"
      aria-labelledby="crew-title"
      className="relative scroll-mt-24 overflow-x-clip px-6 pb-24 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <div className="eyebrow opacity-70">
          <span className="cursor-default transition-colors duration-300 hover:text-accent hover:opacity-100">
            the crew — freefall foundry
          </span>
        </div>

        <h2
          id="crew-title"
          className="m-0 mt-10 cursor-default font-display text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-display tracking-tight text-ink transition-colors duration-300 hover:text-accent"
        >
          built by two people, calibrated by real missions
        </h2>

        <ul className="m-0 mt-8 list-none p-0">
          {CREW.map((m) => (
            <li
              key={m.name}
              className="row-hover flex items-center gap-x-6 rounded-md px-2 py-3 sm:gap-x-8"
            >
              <img
                src={m.img}
                alt={`${m.name} — pixel portrait`}
                className="h-16 w-16 shrink-0 object-contain [image-rendering:pixelated] sm:h-20 sm:w-20"
                loading="lazy"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="font-mono text-caption font-medium lowercase tracking-card text-ink sm:w-40 sm:shrink-0">
                  {m.name}
                </span>
                <span className="text-tiny lowercase leading-relaxed text-ink opacity-80">
                  {m.role}
                </span>
              </span>
              {m.href && (
                <a
                  href={m.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden font-mono text-mini lowercase tracking-card text-link underline-offset-4 transition-colors duration-300 hover:text-accent hover:underline sm:inline"
                >
                  profile ↗
                </a>
              )}
            </li>
          ))}
        </ul>

        {/* mascot — walks in, faces you, waves */}
        <div className="relative mt-14 h-36 overflow-hidden sm:h-40" aria-hidden="true">
          <div ref={astroRef} className="absolute bottom-0 left-0 w-20 sm:w-24 will-change-transform">
            <img
              ref={walkRef}
              src="/assets/astro_walk.png"
              alt=""
              className="block w-full [image-rendering:pixelated]"
            />
            <img
              ref={waveRef}
              src="/assets/astro_wave.png"
              alt=""
              className="absolute inset-0 m-auto block h-full w-auto opacity-0 [image-rendering:pixelated]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
