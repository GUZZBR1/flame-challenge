import { useEffect, useRef } from 'react'
import {
  clearInnerTarget,
  gsap,
  navigate,
  navigateBack,
  peekInnerTarget,
} from '../lib/scroll'
import KeyedFlame from './KeyedFlame'
import LiveChamber from './LiveChamber'
import { IconArrowLeft, IconArrowUpRight } from './Icons'
import Button from './ui/Button'
import ResponseFeed from './ResponseFeed'
import SiConsole from './SiConsole'

/** The simulations deck — its own screen ('#simulations'): talk or
 *  type to the copilot, watch it write its answers back, and see the
 *  live chamber relight itself under real c++ physics when it runs
 *  something. the copilot's brain and the auditable record live on
 *  the si console screen. NASA saffire-v footage is luminance-keyed
 *  behind the hero. */
export default function SimDeck() {
  const rootRef = useRef<HTMLDivElement>(null)

  // inner navigation — 'ignis:scroll-inner' lands on chamber /
  // mission-control / ask while open; the stash covers the mount tick
  // (peek, not consume — StrictMode's remount would eat a one-shot)
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

  // choreography — hero in on mount, the response surfaces reveal on
  // the deck's own scroller
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
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 sm:px-10 sm:pt-28 lg:px-16">
        {/* saffire-v keyed footage bleeding behind the head + console
            — the uv sensor channel, a different clip than the psi
            screen's visible-light saffire-vi and the challenge page's
            sofie-gel */}
        <KeyedFlame
          className="inset-x-0 -top-8 h-[min(64vh,540px)]"
          strength={0.5}
          src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }}
        />

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
              mission control · the engine listens
            </span>
          </div>

          <h2
            data-hero
            className="m-0 mt-8 cursor-default font-[family-name:var(--font-display)] text-[clamp(2.6rem,6.4vw,5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
          >
            simulations
          </h2>
          <p
            data-hero
            className="mt-6 max-w-2xl text-[clamp(14.5px,1.25vw,16.5px)] leading-[1.8] text-[var(--ink)] opacity-80"
          >
            hold space anywhere and say it — or type below:{' '}
            <span className="font-mono text-[var(--ink)] opacity-90">
              "run saffire at nineteen percent" · "what kills this flame
              fastest?"
            </span>{' '}
            and the chamber below relights itself under real c++
            physics — while its brain and the auditable record live on
            the{' '}
            <a
              href="#si-console"
              onClick={(e) => {
                e.preventDefault()
                navigate('#si-console')
              }}
              className="text-[var(--link)] underline-offset-4 hover:underline"
            >
              si console
            </a>
            . behind you: saffire-v station footage — the uv channel
            watching fire crawl the sample inside cygnus.
          </p>
        </div>

        {/* the one input — chat or hold-to-talk */}
        <div data-hero className="relative mt-12">
          <SiConsole slim />
        </div>

        {/* the answer stream — typed out live on soft cards */}
        <div data-reveal className="relative mt-16">
          <div id="copilot-answers">
            <ResponseFeed />
          </div>
        </div>

        {/* the stage — quiet until a copilot command relights it,
            wherever the command was spoken from */}
        <div data-reveal className="relative mt-20">
          <LiveChamber stage />
        </div>

        <div
          data-reveal
          className="relative mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--edge)] pt-5 font-mono text-[11px] lowercase tracking-[0.18em]"
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
              href="#si-console"
              onClick={(e) => {
                e.preventDefault()
                navigate('#si-console')
              }}
            >
              its brain + the record live in si console
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
              the risk ranking lives in dashboard
              <IconArrowUpRight size={14} />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
