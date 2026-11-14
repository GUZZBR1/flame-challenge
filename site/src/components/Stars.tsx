import { useEffect, useRef } from 'react'

/** Page-wide starfield for the dark theme — same deterministic hash
 *  distribution as the hero canvas, but fixed behind all content
 *  (-z-10 paints above the page bg, below normal flow). */
export default function Stars() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // ~380 stars viewport-wide; deterministic pseudo-random layout
      const n = Math.round((w * h) / 4200)
      for (let i = 0; i < n; i++) {
        const x = ((Math.sin(i * 127.1 + 1) * 43758.5453) % 1 + 1) % 1
        const y = ((Math.sin(i * 311.7 + 2) * 96453.132) % 1 + 1) % 1
        ctx.fillStyle = `rgba(195,218,236,${0.12 + (i % 5) * 0.09})`
        ctx.beginPath()
        ctx.arc(x * w, y * h, i % 11 === 0 ? 1.2 : 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-0 transition-opacity duration-700 dark:opacity-100"
    />
  )
}
