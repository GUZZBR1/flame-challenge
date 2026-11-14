import { useEffect, useRef } from 'react'
import { gsap } from '../lib/scroll'

interface Regime {
  tag: string
  platform: string
  models: string
  href: string
}

const REGIMES: Regime[] = [
  {
    tag: 'flex',
    platform: 'iss',
    models: 'droplet d²-law burn rate · extinction diameter',
    href: 'https://images.nasa.gov/details/jsc2023e013681',
  },
  {
    tag: 'saffire',
    platform: 'cygnus oa-6',
    models: 'large-scale solid-fuel spread · opposed-flow extinction',
    href: 'https://images.nasa.gov/details/iss051e039882',
  },
  {
    tag: 'acme',
    platform: 'iss',
    models: 'gaseous-fuel flammability matrix · coflow',
    href: 'https://images.nasa.gov/details/GRC-2016-C-05051',
  },
  {
    tag: 'sofie',
    platform: 'iss',
    models: 'cool-flame onset · radiative extinction',
    href: 'https://images.nasa.gov/details/SoFIE-GEL',
  },
]

const SOURCES = [
  { label: 'psi repo', href: 'https://psi.nasa.gov/physci/repo' },
  { label: 'images.nasa.gov', href: 'https://images.nasa.gov/' },
  { label: 'ntrs', href: 'https://ntrs.nasa.gov/' },
]

/** The challenge — a technical ledger: why µg combustion is different,
 *  real NASA footage of the regime, and the experiment matrix the
 *  solver is calibrated against. */
export default function Challenge() {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // luminance keying — black pixels of the footage become real alpha,
  // so the flame floats over the actual page (stars in dark, paper in
  // light) instead of sitting inside a black rectangle
  useEffect(() => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    let raf = 0
    let cancelled = false
    let visible = true

    // skip the pixel work entirely while the section is off-screen
    const obs = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting },
      { threshold: 0 },
    )
    obs.observe(c)

    const tick = () => {
      if (cancelled) return
      if (visible && v.readyState >= 2 && v.videoWidth) {
        const w = v.videoWidth >> 1
        const h = v.videoHeight >> 1
        if (c.width !== w || c.height !== h) {
          c.width = w
          c.height = h
        }
        ctx.drawImage(v, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const d = img.data
        for (let i = 0; i < d.length; i += 4) {
          const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
          d[i + 3] = Math.min(255, Math.max(0, (l - 26) * 3.4))
        }
        ctx.putImageData(img, 0, 0)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      obs.disconnect()
    }
  }, [])

  // reveal rows once, on entry — skipped entirely under reduced motion
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      // each block reveals as it enters — soft fade, no bounce
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 16,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 92%' },
        })
      })

      // dock: on wide screens the footage starts spanning the stage and
      // flies to its right column; the statement stays hidden until the
      // frame has mostly cleared the space, so it's never covered
      const mm = gsap.matchMedia()
      mm.add('(min-width: 1024px)', () => {
        const stage = stageRef.current
        const frame = frameRef.current
        const text = root.querySelector<HTMLElement>('[data-dock-text]')
        if (!stage || !frame) return
        const scaleFrom = () => stage.offsetWidth / Math.max(1, frame.offsetWidth)
        // text starts hidden — the fromTo at 0.35 doesn't immediateRender,
        // so without this it stays visible while the frame is still large
        if (text) gsap.set(text, { autoAlpha: 0, y: 24 })
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: 'top 38%',
            end: 'top -12%',
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        tl.fromTo(
          frame,
          { scale: scaleFrom, transformOrigin: 'right top' },
          { scale: 1, ease: 'none', duration: 1 },
          0,
        )
        if (text) {
          // text finishes at ~85% of the range — a reading window opens
          // while the frame settles into its column
          tl.fromTo(
            text,
            { autoAlpha: 0, y: 24 },
            { autoAlpha: 1, y: 0, ease: 'none', duration: 0.5 },
            0.35,
          )
        }
        return () => {
          gsap.set(frame, { clearProps: 'all' })
          if (text) gsap.set(text, { clearProps: 'all' })
        }
      })
      // narrow screens: stacked flow, text reveals on entry like the rest
      mm.add('(max-width: 1023px)', () => {
        const text = root.querySelector<HTMLElement>('[data-dock-text]')
        if (!text) return
        gsap.from(text, {
          opacity: 0,
          y: 16,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: { trigger: text, start: 'top 92%' },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section
      id="challenge"
      ref={rootRef}
      aria-labelledby="challenge-title"
      className="relative scroll-mt-24 px-5 pb-28 pt-10 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        {/* section marker */}
        <div
          data-reveal
          className="flex items-baseline gap-6 font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70 sm:gap-8"
        >
          <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
            the challenge
          </span>
          <span className="hidden cursor-default font-semibold transition-colors duration-300 hover:text-[var(--accent)] sm:inline">
            nasa space apps 2026 · flame in freefall
          </span>
        </div>

        {/* stage — footage starts full-width, then docks to the right
            column on lg while the statement fades in beside it */}
        <div
          ref={stageRef}
          className="grid gap-10 pt-10 lg:grid-cols-2 lg:gap-14 lg:items-start"
        >
          <figure className="relative z-10 pointer-events-none lg:col-start-2">
            <div
              ref={frameRef}
              className="relative will-change-transform [mask-image:radial-gradient(ellipse_at_center,black_48%,transparent_74%)]"
            >
              <video
                ref={videoRef}
                className="absolute h-px w-px opacity-0"
                autoPlay
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = 0.4
                }}
                onTimeUpdate={(e) => {
                  // loop only the lit phase — after ~15s the flame dies
                  // to a dark smudge (the extinction regime)
                  if (e.currentTarget.currentTime >= 15.5)
                    e.currentTarget.currentTime = 0.4
                }}
                onEnded={(e) => {
                  e.currentTarget.currentTime = 0.4
                  void e.currentTarget.play()
                }}
                aria-hidden="true"
              >
                <source src="/assets/sofie_flame_hd.mp4" media="(min-width: 768px)" />
                <source src="/assets/sofie_flame.mp4" />
              </video>
              <canvas
                ref={canvasRef}
                className="pointer-events-none block aspect-video w-full"
                role="img"
                aria-label="NASA SoFIE-GEL footage: a flame appearing to spin itself into extinction aboard the ISS"
              />
            </div>
          </figure>

          <div data-dock-text className="lg:col-start-1 lg:row-start-1">
            <h2
              id="challenge-title"
              className="m-0 cursor-default font-[family-name:var(--font-display)] text-[clamp(2rem,4.4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
            >
              combustion without buoyancy
            </h2>
            <p className="mt-6 text-[clamp(13px,1.15vw,15px)] leading-[1.75] text-[var(--ink)] opacity-80">
              on earth, buoyancy stretches a flame upward. in orbit there is no
              “up” — a droplet flame closes into a sphere, feeds only by
              diffusion, and can survive as a{' '}
              <a
                href="https://images.nasa.gov/details/SoFIE-GEL"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
              >
                cool flame
              </a>
              : nearly invisible, ~600 k, no soot. hidden fire in a crewed
              cabin is the failure mode ignis exists to simulate.
            </p>
            <p className="mt-4 text-[clamp(13px,1.15vw,15px)] leading-[1.75] text-[var(--ink)] opacity-80">
              the engine is a compiled c++20 core calibrated against iss
              experiment telemetry — not a scripted animation.
            </p>
          </div>
        </div>

        <div data-reveal className="mt-3 lg:grid lg:grid-cols-2 lg:gap-14">
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 font-mono text-[10.5px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-60 lg:col-start-2">

          <span>sofie-gel / iss — flame spinning itself into extinction</span>
          <a
            href="https://images.nasa.gov/details/SoFIE-GEL"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
          >
            nasa image &amp; video library ↗
          </a>
          </p>
        </div>

        {/* experiment ledger — what the solver implements */}
        <div id="simulations" className="scroll-mt-28 pt-16">
          <div
            data-reveal
            className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70"
          >
            <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
              solver regimes — implemented in core/
            </span>
          </div>
          <dl className="m-0">
            {REGIMES.map((r) => (
              <div
                key={r.tag}
                data-reveal
                className="grid grid-cols-[5.5rem_1fr] items-baseline gap-x-4 rounded-md px-2 py-3 transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] sm:grid-cols-[7rem_9rem_1fr] sm:gap-x-8"
              >
                <dt className="font-mono text-[13px] font-medium lowercase tracking-[0.14em]">
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
                  >
                    {r.tag}
                  </a>
                </dt>
                <dd className="m-0 hidden font-mono text-[11px] lowercase tracking-[0.18em] text-[var(--ink)] opacity-50 sm:block">
                  {r.platform}
                </dd>
                <dd className="m-0 text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-80">
                  {r.models}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* dataset provenance */}
        <div id="psi-dataset" className="scroll-mt-28 pt-14">
          <div
            data-reveal
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
                <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
                  psi dataset — provenance
                </span>
              </div>
              <p className="m-0 mt-3 max-w-2xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75">
                experiment telemetry is pulled from the nasa physical sciences
                informatics repo, normalized to csv, and frozen into{' '}
                <span className="font-mono text-[var(--ink)] opacity-90">
                  shared/calibrated-data/*.json
                </span>{' '}
                — the engine only reads verified records.
              </p>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 font-mono text-[11px] lowercase tracking-[0.16em]">
              {SOURCES.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
                  >
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
