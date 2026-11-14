import { useEffect, useRef } from 'react'
import { gsap } from '../lib/scroll'
import HeroCanvas from './HeroCanvas'

const TITLE = 'IGNIS'

/** Hero — typewriter title in Space Mono, per-letter hover lift,
 *  expanding rule with technical end-tags, mesh backdrop, GSAP scroll
 *  choreography (lift → scale → fade as the hero leaves view). */
export default function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const identityRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // typewriter — writes each letter as its own span so hover lift works
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.replaceChildren()
    const cursor = document.createElement('span')
    cursor.className = 'caret'
    cursor.setAttribute('aria-hidden', 'true')
    el.append(cursor)
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const typeNext = () => {
      if (i < TITLE.length) {
        const span = document.createElement('span')
        span.className =
          'inline-block transition duration-300 ease-out group-hover:-translate-y-2'
        span.textContent = TITLE[i++]
        el.insertBefore(span, cursor)
        timer = setTimeout(typeNext, 320)
      } else {
        timer = setTimeout(() => cursor.remove(), 1200)
      }
    }
    timer = setTimeout(typeNext, 700)
    return () => clearTimeout(timer)
  }, [])

  // scroll choreography
  useEffect(() => {
    const hero = heroRef.current
    const identity = identityRef.current
    if (!hero || !identity) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // capture once — reading offsetHeight inside onUpdate forces layout per frame
    const heroHeight = hero.offsetHeight
    const ctx = gsap.context(() => {
      const tween = { p: 0 }
      gsap.to(tween, {
        p: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '58% top',
          scrub: true,
        },
        onUpdate: () => {
          const lift = (heroHeight * 0.43 - 45) * tween.p
          const scale = 1 - tween.p * 0.72
          identity.style.transform = `translate(-50%, calc(-50% - ${lift}px)) scale(${scale})`
          identity.style.opacity = String(1 - Math.max(0, (tween.p - 0.76) / 0.24))
        },
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <section
      id="top"
      ref={heroRef}
      aria-labelledby="ignis-title"
      className="relative isolate h-[100svh] min-h-[680px] cursor-crosshair overflow-hidden"
    >
      <HeroCanvas />
      <div className="hero-shade pointer-events-none absolute inset-0" aria-hidden="true" />

      <div
        ref={identityRef}
        className="pointer-events-none fixed left-1/2 top-[43%] z-10 w-[min(78%,850px)] text-center will-change-transform"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <div className="group pointer-events-auto mx-auto w-fit max-w-full cursor-default text-center">
          <h1
            id="ignis-title"
            ref={titleRef}
            aria-label={TITLE}
            className="m-0 font-[family-name:var(--font-display)] text-[clamp(4.5rem,13vw,10.5rem)] font-bold leading-none tracking-[-0.04em]"
          />
        </div>
      </div>
    </section>
  )
}
