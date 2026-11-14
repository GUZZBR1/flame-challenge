import { useEffect, useRef, useState } from 'react'
import { gsap } from '../lib/scroll'

const IMG = '/assets/shipyard_foreground.png'

/** Orbital shipyard section — GSAP reveal, expands to the old estaleiro
 *  fullscreen experience (dark void + contained art + back button). */
export default function Shipyard() {
  const sectionRef = useRef<HTMLElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const el = sectionRef.current
    const img = imgRef.current
    if (!el || !img) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        img,
        { scale: 1.12, y: 60, opacity: 0 },
        {
          scale: 1,
          y: 0,
          opacity: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 82%',
            end: 'top 30%',
            scrub: 1.2,
          },
        },
      )
      gsap.to(img, {
        y: -50,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })
    })
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    if (!expanded) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <section
      id="estaleiro"
      ref={sectionRef}
      aria-label="IGNIS orbital shipyard"
      className="relative grid min-h-[100svh] place-items-center overflow-hidden px-[3vw] py-[3vh]"
    >
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="View shipyard fullscreen"
        className="absolute right-5 top-5 z-10 rounded-full border border-[var(--edge)] bg-[var(--panel)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--ink)] opacity-70 backdrop-blur transition-opacity hover:opacity-100"
      >
        expand ⤢
      </button>
      <img
        ref={imgRef}
        src={IMG}
        alt="IGNIS orbital shipyard in space"
        className="block h-auto max-h-[94svh] w-auto max-w-full object-contain"
      />

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="IGNIS orbital shipyard — fullscreen"
          className="fixed inset-0 z-40 grid place-items-center bg-[#070b14]"
          onClick={() => setExpanded(false)}
        >
          <button
            ref={closeRef}
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Back to home page"
            className="absolute left-5 top-5 grid h-[42px] w-[42px] place-items-center rounded-full border border-[#cbd5e13d] bg-[#0b12204d] text-xl text-[#edf4fa] backdrop-blur transition-colors hover:border-[#49b8d6a6] hover:bg-[#111d2caa]"
          >
            ←
          </button>
          <img
            src="/design/assets/estaleiros/station_foreground.png"
            alt="IGNIS orbital shipyard — full view"
            onClick={(e) => e.stopPropagation()}
            className="block max-h-[100svh] max-w-full object-contain"
          />
        </div>
      )}
    </section>
  )
}
