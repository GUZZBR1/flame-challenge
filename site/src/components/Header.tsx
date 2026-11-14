import { useCallback, useEffect, useRef } from 'react'
import { getLenis, gsap } from '../lib/scroll'

interface Props {
  dark: boolean
  onToggleTheme: () => void
}

const NAV: { label: string; href: string; className?: string }[] = [
  { label: 'vision', href: '#top', className: 'max-[560px]:hidden' },
  { label: 'simulations', href: '#simulations' },
  { label: 'psi-dataset', href: '#psi-dataset', className: 'max-[560px]:hidden' },
  { label: 'shipyard', href: '#estaleiro' },
]

/** Floating glass header — bare monospace text over the hero, then a
 *  blurred, glowing pill materializes behind the nav as you scroll. */
export default function Header({ dark, onToggleTheme }: Props) {
  const glassRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const glass = glassRef.current
    if (!glass) return
    const ctx = gsap.context(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(glass, { opacity: 1, scaleX: 1, y: 0 })
        return
      }
      gsap.fromTo(
        glass,
        { opacity: 0, scaleX: 0.55, y: -6 },
        {
          opacity: 1,
          scaleX: 1,
          y: 0,
          ease: 'none',
          scrollTrigger: { start: 0, end: 140, scrub: true },
        },
      )
    })
    return () => ctx.revert()
  }, [])

  const go = useCallback((href: string) => {
    const lenis = getLenis()
    if (lenis) {
      lenis.scrollTo(href === '#top' ? 0 : href)
      return
    }
    if (href === '#top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-20 px-3 py-4 sm:px-8 sm:py-6">
      <div className="relative mx-auto flex w-fit max-w-full items-center justify-center gap-4 px-4 py-2 sm:gap-10 sm:px-7 sm:py-2.5">
        <span
          ref={glassRef}
          aria-hidden="true"
          className="absolute inset-0 rounded-full border border-[var(--edge)] bg-[var(--panel)] shadow-[0_10px_36px_-10px_rgba(23,33,43,0.28),0_0_28px_-8px_rgba(73,184,214,0.35)] backdrop-blur-xl backdrop-saturate-150 will-change-transform dark:shadow-[0_10px_36px_-10px_rgba(0,0,0,0.6),0_0_32px_-6px_rgba(73,184,214,0.45)]"
        />

        <nav className="relative flex items-center gap-3 sm:gap-6 lg:gap-8" aria-label="Primary">
          {NAV.map((item) => (
            <a
              key={item.label}
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
          ))}
        </nav>

        <div className="relative flex items-center gap-3 sm:gap-6">
          <span className="hidden font-mono text-[10px] lowercase tracking-[0.18em] text-[var(--ink)] opacity-60 lg:inline">
            são paulo, brasil
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={dark}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="rounded-full border-2 border-[var(--olive)] p-[3px] transition-colors hover:border-[var(--ink)]"
          >
            <span className="block rounded-full border border-[var(--olive)]/50 px-2 py-0.5 font-mono text-[9px] font-medium lowercase tracking-[0.14em] text-[var(--ink)] sm:px-3 sm:py-1 sm:text-[10px] sm:tracking-[0.18em]">
              {dark ? 'dark' : 'light'}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
