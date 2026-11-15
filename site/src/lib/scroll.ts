/** Lenis smooth-scroll + GSAP ScrollTrigger wiring (initialized once). */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

export function initScroll(): Lenis {
  if (lenis) return lenis
  lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis!.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  return lenis
}

export function getLenis(): Lenis | null {
  return lenis
}

/** voice/navigation names -> real DOM ids (voice contract uses these
 *  friendly names; the sections carry different ids) */
const SECTION_IDS: Record<string, string> = {
  hero: 'top',
  simulations: 'simulations',
  'psi-dataset': 'psi-dataset',
  dashboard: 'dashboard',
  chamber: 'chamber',
  shipyard: 'vision',
  'mission-control': 'mission-control',
}

/** smooth-scroll to a named section — Lenis when it's up, native
 *  scrollIntoView otherwise. Returns false for unknown names. */
export function scrollToSection(name: string): boolean {
  const id = SECTION_IDS[name] ?? name
  const l = getLenis()
  if (id === 'top') {
    if (l) l.scrollTo(0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
    return true
  }
  const el = document.getElementById(id)
  if (!el) return false
  if (l) l.scrollTo(el, { offset: -96 })
  else el.scrollIntoView({ behavior: 'smooth' })
  return true
}

/** apply the copilot's navigation block — scroll + matrix filter fan-out */
export function applyNavigation(
  nav: {
    scroll_to_section?: string | null
    active_filter_tag?: string | null
  } | null | undefined,
): void {
  if (nav?.scroll_to_section) scrollToSection(nav.scroll_to_section)
  if (nav?.active_filter_tag) {
    window.dispatchEvent(
      new CustomEvent('ignis:filter', {
        detail: { tag: nav.active_filter_tag },
      }),
    )
  }
}

export { gsap, ScrollTrigger }
