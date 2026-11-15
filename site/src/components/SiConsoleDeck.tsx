import { useEffect, useRef } from 'react'
import {
  clearInnerTarget,
  gsap,
  navigate,
  navigateBack,
  peekInnerTarget,
} from '../lib/scroll'
import AsciiBrain from './AsciiBrain'
import AskPanel from './AskPanel'
import { IconArrowLeft, IconArrowUpRight } from './Icons'
import Button from './ui/Button'

/** The si console screen ('#si-console') — the copilot's insides,
 *  not its mouth: the auditable record it grounds every answer on,
 *  and the living tissue of every psi/ntrs record it has consumed.
 *  talking to it happens on the simulations deck; this is where you
 *  watch what it learned. */
export default function SiConsoleDeck() {
  const rootRef = useRef<HTMLDivElement>(null)

  // inner navigation — 'ignis:scroll-inner' lands on 'ask' while open;
  // the stash covers the mount tick (peek, not consume — StrictMode's
  // remount would eat a one-shot)
  useEffect(() => {
    const root = rootRef.current
    const go = (id: string) => {
      root
        ?.querySelector(`#${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      clearInnerTarget()
    }
    const onInner = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id
      if (id) go(id)
    }
    window.addEventListener('ignis:scroll-inner', onInner)
    const pending = peekInnerTarget()
    const t = pending ? window.setTimeout(() => go(pending), 90) : 0
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('ignis:scroll-inner', onInner)
    }
  }, [])

  // choreography — hero in on mount, the surfaces reveal on the
  // screen's own scroller
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero]', {
        opacity: 0,
        y: 18,
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.07,
      })
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 16,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 92%', scroller: root },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div
      ref={rootRef}
      data-lenis-prevent
      className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-[var(--bg)]"
    >
      <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-24 sm:px-10 sm:pt-28 lg:px-16">
        <div className="relative">
          <div
            data-hero
            className="flex items-baseline justify-between gap-6 font-mono text-[12px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70"
          >
            <Button asChild variant="glass" size="sm" className="lowercase">
              <a
                href="#top"
                onClick={(e) => {
                  e.preventDefault()
                  navigateBack()
                }}
              >
                <IconArrowLeft size={14} />
                back
              </a>
            </Button>
            <span className="hidden cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100 sm:inline">
              mission control · the copilot's memory
            </span>
          </div>

          <h2
            data-hero
            className="m-0 mt-8 cursor-default font-[family-name:var(--font-display)] text-[clamp(2.6rem,6.4vw,5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
          >
            si console
          </h2>
          <p
            data-hero
            className="mt-6 max-w-2xl text-[clamp(14.5px,1.25vw,16.5px)] leading-[1.8] text-[var(--ink)] opacity-80"
          >
            the copilot's insides — not its mouth. search the psi/ntrs
            record it grounds every answer on, then watch the living
            tissue of everything it has touched so far fire below.
            the comms and the burn itself live on the{' '}
            <a
              href="#simulations"
              onClick={(e) => {
                e.preventDefault()
                navigate('#simulations')
              }}
              className="text-[var(--link)] underline-offset-4 hover:underline"
            >
              simulations deck
            </a>
            .
          </p>
        </div>

        {/* the copilot's living 3D ASCII cortex — centerpiece */}
        <div data-hero className="relative mt-10">
          <div className="mb-2 font-mono text-[12px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
            <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
              3D ASCII cortex · neural telemetry & evidence lobes
            </span>
          </div>
          <AsciiBrain />
        </div>

        {/* the auditable path — same record, exact rows + citations */}
        <div data-reveal className="relative mt-16 border-t border-[var(--edge)] pt-10">
          <div className="mb-4 font-mono text-[12px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
            <span>search the psi ground truth corpus</span>
          </div>
          <AskPanel slim />
        </div>

        <div
          data-reveal
          className="relative mt-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--edge)] pt-6 font-mono text-[12px] lowercase tracking-[0.18em]"
        >
          <Button asChild variant="glass" size="sm" className="lowercase">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault()
                navigateBack()
              }}
            >
              <IconArrowLeft size={14} />
              back
            </a>
          </Button>
          <Button asChild variant="glass" size="sm" className="lowercase">
            <a
              href="#simulations"
              onClick={(e) => {
                e.preventDefault()
                navigate('#simulations')
              }}
            >
              talk to it in simulations
              <IconArrowUpRight size={14} />
            </a>
          </Button>
          <Button asChild variant="glass" size="sm" className="lowercase">
            <a
              href="#dashboard"
              onClick={(e) => {
                e.preventDefault()
                navigate('#dashboard')
              }}
            >
              generated cards land in dashboard
              <IconArrowUpRight size={14} />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
