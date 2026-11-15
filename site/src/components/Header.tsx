import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { gsap, navigate, ScrollTrigger } from '../lib/scroll'
import Button from './ui/Button'
import { IconMoon, IconSun } from './Icons'

interface Props {
  dark: boolean
  onToggleTheme: () => void
  /** overlay screens (psi dataset, simulations) pin the brand visible —
   *  it's the way back home from a deck, and the main-page scroll scrub
   *  that normally reveals it is frozen underneath the overlay */
  brandVisible?: boolean
}

const NAV: { label: string; href: string; className?: string }[] = [
  { label: 'vision', href: '#vision', className: 'max-lg:hidden' },
  { label: 'simulations', href: '#simulations', className: 'max-[520px]:hidden' },
  { label: 'dashboard', href: '#dashboard', className: 'max-[700px]:hidden' },
  { label: 'psi-dataset', href: '#psi-dataset', className: 'max-[640px]:hidden' },
  { label: 'si console', href: '#si-console' },
]


/** Floating glass header — bare monospace text over the hero, then a
 *  blurred, glowing pill materializes behind the nav as you scroll. */
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Floating glass header — bare monospace text over the hero, then a
 *  blurred, glowing pill materializes behind the nav as you scroll. */
export default function Header({ dark, onToggleTheme, brandVisible = false }: Props) {
  const glassRef = useRef<HTMLSpanElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const [clock, setClock] = useState(() => clockFmt.format(new Date()))

  useEffect(() => {
    const id = setInterval(() => setClock(clockFmt.format(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const glass = glassRef.current
    const brand = brandRef.current
    if (!glass || !brand) return
    const ctx = gsap.context(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(glass, { opacity: 1, scaleX: 1, y: 0 })
        ScrollTrigger.create({
          trigger: '#top',
          start: 'top top',
          end: () => window.innerHeight * 0.58,
          onUpdate: (self) => gsap.set(brand, { opacity: self.progress }),
        })
        return
      }
      const scrub = {
        trigger: '#top',
        start: 'top top',
        end: () => window.innerHeight * 0.58,
        scrub: true,
      } as const
      gsap.fromTo(
        glass,
        { opacity: 0, scaleX: 0.55, y: -6 },
        { opacity: 1, scaleX: 1, y: 0, ease: 'none', scrollTrigger: scrub },
      )
      gsap.fromTo(
        brand,
        { opacity: 0 },
        { opacity: 1, ease: 'none', scrollTrigger: scrub },
      )
    })
    return () => ctx.revert()
  }, [])

  // overlays pin the brand; returning to the main page re-syncs it to
  // wherever the scroll scrub would have left it (hidden at the hero
  // top, solid once you've scrolled)
  useEffect(() => {
    const brand = brandRef.current
    if (!brand) return
    gsap.set(brand, {
      opacity: brandVisible
        ? 1
        : Math.min(1, window.scrollY / (window.innerHeight * 0.58)),
    })
  }, [brandVisible])

  const go = useCallback((href: string) => {
    navigate(href)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-20 px-3 py-4 sm:px-8 sm:py-6">
      <div className="relative mx-auto flex w-fit max-w-full items-center justify-center gap-3 px-3 py-2 sm:gap-10 sm:px-7 sm:py-2.5">
        <span
          ref={glassRef}
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-[var(--edge)] bg-[var(--panel)] shadow-[0_10px_36px_-10px_rgba(23,33,43,0.28),0_0_28px_-8px_rgba(73,184,214,0.35)] backdrop-blur-xl backdrop-saturate-150 will-change-transform dark:border-[#cbd5e15c] dark:bg-[#0d1524e0] dark:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.75),0_0_44px_-6px_rgba(73,184,214,0.6)]"
        />

        <nav className="relative flex items-center gap-2 sm:gap-6 lg:gap-8" aria-label="Primary">
          {NAV.map((item, i) => (
            <Fragment key={item.label}>
              <a
                href={item.href}
                onClick={(e) => {
                  e.preventDefault()
                  go(item.href)
                }}
                className={`group relative pb-1 font-mono text-[clamp(15px,1.7vw,18px)] font-medium lowercase tracking-[0.12em] text-[var(--ink)] opacity-70 transition-opacity duration-300 hover:opacity-100 ${item.className ?? ''}`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 group-hover:scale-x-100"
                />
              </a>
              {i === NAV.length - 1 && (
                <a
                  ref={brandRef}
                  data-ignis-brand
                  href="#top"
                  onClick={(e) => {
                    e.preventDefault()
                    go('#top')
                  }}
                  aria-label="IGNIS — back to top"
                  className="relative pb-1 font-[family-name:var(--font-display)] text-[clamp(14px,1.9vw,20px)] font-bold leading-none tracking-[-0.03em] text-[var(--ink)] opacity-0"
                >
                  IGNIS
                </a>
              )}
            </Fragment>
          ))}
        </nav>

        <div className="relative flex items-center gap-3 sm:gap-6">
          <span className="hidden font-mono text-[13px] lowercase tracking-[0.18em] text-[var(--ink)] opacity-60 xl:inline">
            são paulo, brazil
          </span>
          <span
            className="hidden font-mono text-[13px] lowercase tracking-[0.18em] text-[var(--ink)] opacity-60 sm:inline"
            aria-label="current time in são paulo, utc-3"
          >
            {clock.split(':').map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="clock-blink">:</span>}
                {part}
              </Fragment>
            ))}
            <span className="opacity-60"> utc-3</span>
          </span>
          <Button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={dark}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            variant="glass"
            size="sm"
            className="lowercase"
          >
            {dark ? <IconMoon size={13} /> : <IconSun size={13} />}
            {dark ? 'dark' : 'light'}
          </Button>
        </div>
      </div>
    </header>
  )
}
